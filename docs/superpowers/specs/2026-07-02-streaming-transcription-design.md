# Mode streaming — transcription en continu (cloud-first)

**Date** : 2026-07-02 (nuit, session autonome)
**Statut** : validé (auto-approbation — mandat d'autonomie explicite donné par Yohann)
**Branche** : `feat/streaming-transcription`

## 1. Objectif

Aujourd'hui, Lexena transcrit en batch : l'utilisateur parle, arrête l'enregistrement,
puis attend que tout l'audio soit transcrit d'un bloc. Le mode streaming affiche le
texte **pendant** que l'utilisateur parle, phrase par phrase, avec 1 à 2 secondes de
latence après chaque pause naturelle.

Objectif produit : le streaming est **exclusif à Lexena Cloud**. C'est un argument
concret d'abonnement — l'utilisateur local voit la feature (teaser désactivé dans les
settings), l'utilisateur cloud la vit. Aligné avec la stratégie business v3
(local = gratuit, cloud = trial 60 min puis abo).

## 2. Approches considérées

### A. OpenAI Realtime API (WebSocket, deltas mot à mot) — écartée pour ce lot

- Latence minimale (deltas par mot), le « vrai » streaming.
- **Bloquant** : nécessite un endpoint serveur qui minte un token éphémère
  (`POST /v1/realtime/client_secrets`) car la clé OpenAI vit sur le worker
  `api.lexena.app` — dont le repo n'est pas présent sur cette machine.
- **Bloquant produit** : l'audio partirait en direct vers OpenAI sans passer par le
  worker → le billing/quota/trial (comptés par requête `/transcribe` côté serveur)
  serait contourné. Il faudrait un système de comptage de session complet côté worker.
- Coût : gpt-4o-transcribe realtime est facturé plus cher que le batch.

### B. Segmentation aux silences + endpoint `/transcribe` existant — **retenue**

- Rust segmente l'audio live aux pauses naturelles (VAD par fenêtres RMS, même
  famille d'algorithme que `audio_trim.rs`), le frontend envoie chaque segment à
  l'endpoint `/transcribe` existant dès qu'il est coupé.
- Le texte apparaît phrase par phrase, ~1-2 s après chaque pause. Granularité
  « phrase » et non « mot », mais l'effet dictée-live est là.
- **Zéro changement serveur** : billing, quotas, trial, idempotence, rate-limits —
  tout le pipeline actuel reste la source de vérité. Chaque segment est une requête
  `/transcribe` normale, facturée à la durée comme aujourd'hui (la somme des durées
  des segments = la durée de l'enregistrement, donc coût identique au batch).
- Livrable de bout en bout cette nuit, testable, sans dépendance externe.

### C. Segmentation côté frontend (polling des samples) — écartée

- Obligerait à faire transiter tout l'audio en continu par l'IPC, avec des timers JS
  peu fiables quand la fenêtre est cachée. Le Rust possède déjà le callback audio.

**Décision** : B maintenant, avec des frontières de modules qui permettent de brancher
A plus tard (le transport d'un segment est isolé ; passer à un transport WebSocket ne
touchera ni la segmentation ni l'assemblage ni l'UI). Prérequis pour A documentés en §10.

## 3. Architecture retenue

```
┌────────────────────────── Rust ──────────────────────────┐
│ audio.rs (callback cpal)                                  │
│   └─ tap optionnel ── mpsc ──► streaming.rs worker thread │
│                                 SpeechSegmenter (pur)     │
│                                 émet les événements Tauri │
└───────────────────────────────┬───────────────────────────┘
              "streaming-chunk" │ { sessionId, chunkIndex,
                                │   samples, sampleRate, … }
┌───────────────────────────────▼── Frontend ───────────────┐
│ useStreamingSession (hook, fenêtre main)                   │
│   file d'upload séquentielle ──► transcribeCloud() (exist.)│
│   assembler (pur) : index → texte, texte assemblé ordonné  │
│   émet "streaming-transcript" ──► MiniWindow + Dashboard   │
│   à la fin : finalisation via le pipeline existant         │
│   (post-process → snippets → historique → collage)         │
└────────────────────────────────────────────────────────────┘
```

### 3.1 Répartition des responsabilités

- **Rust = capture + segmentation** (il possède le callback audio, thread fiable
  même fenêtre cachée). Il n'upload PAS : pas de JWT à pousser côté Rust, pas de
  duplication du client cloud.
- **Frontend = upload + assemblage + finalisation**. Réutilise `transcribeCloud`
  (retry réseau, mapping `CloudApiError`, i18n des erreurs), le JWT est frais à
  chaque segment via `supabase.auth.getSession()`. Précédent établi : l'événement
  `audio-captured` fait déjà transiter des enregistrements entiers par l'IPC ; les
  segments sont plus petits.

### 3.2 Rust — nouveau module `src-tauri/src/streaming.rs`

**`SpeechSegmenter`** — machine à états pure (unités testables sans audio réel) :

- Entrée : lots de samples i16 mono (tels que produits par le callback).
- Fenêtres RMS de 20 ms (même primitive que `audio_trim.rs`).
- Seuil adaptatif : fraction du pic RMS observé depuis le début de la session
  (10 %, clampé [0.004, 0.020]) — robuste au gain micro, cohérent avec `audio_trim`.
- **Coupe** quand : ≥ 600 ms consécutives sous le seuil ET le segment courant
  contient de la parole ET dure ≥ 1,4 s. Le point de coupe garde ~250 ms de silence
  en fin de segment (padding), le reste du silence ouvre le segment suivant —
  aucun sample de **parole** n'est jamais perdu (seul du silence pur peut être
  jeté, cf. ci-dessous).
- **Coupe forcée** à 15 s même sans pause (monologue rapide) : on coupe à la fenêtre
  de RMS minimal des 2 dernières secondes pour minimiser le risque de couper un mot.
- **Silence pur** : un segment sans aucune fenêtre de parole n'est jamais émis
  (pas de requête facturée pour du silence, pas d'hallucination Whisper) ; son buffer
  est jeté au fil de l'eau (borné en mémoire).
- `flush()` à l'arrêt : émet la queue si elle contient de la parole.

**Tap audio** (`audio.rs`) : `AudioRecorder` gagne un
`chunk_tap: Arc<Mutex<Option<mpsc::Sender<TapMsg>>>>`. Dans le callback, après la
conversion mono, si le tap est actif → `send(TapMsg::Samples(...))` (clone borné,
non bloquant). `TapMsg::{Samples, Finish, Abort}` — `Finish` déclenche flush + fin de
session, `Abort` (annulation Échap) jette tout.

**Worker thread** : reçoit les `TapMsg`, nourrit le segmenter, émet :

- `streaming-chunk` `{ sessionId, chunkIndex, samples, sampleRate, startMs, endMs }`
- `streaming-session-end` `{ sessionId, totalChunks }` (après flush sur `Finish`)
- `streaming-session-cancelled` `{ sessionId }` (sur `Abort`)

**État & branchement** : `AppState.streaming: Mutex<StreamingRuntime>`
`{ enabled: bool, session_seq: u64, tap: Option<Sender<TapMsg>> }`.

- Commande `set_streaming_enabled(enabled: bool)` — poussée par le frontend
  (même patron que `set_cloud_gate`) quand `streaming_mode && provider == LexenaCloud
  && eligible` change.
- Les **deux** chemins de démarrage (commande `start_recording` ET
  `start_recording_shortcut` des hotkeys) passent par un helper commun qui, si
  `enabled`, installe le tap et démarre le worker (session_seq++).
- Les chemins d'arrêt (`stop_recording`, hotkey stop, PTT release) envoient `Finish`
  et retirent le tap ; l'annulation envoie `Abort`.
- Quand une session streaming était active, le chemin hotkey **n'émet pas**
  `audio-captured` (les segments sont déjà partis) — le buffer batch reste rempli
  (filet de sécurité et détection de silence inchangée).

### 3.3 Frontend

**`src/lib/streaming/assembler.ts`** (pur, testé Vitest) : `Map<index, text>` +
`assembled()` (jointure ordonnée, ignore les index manquants), `markFailed(index)`,
compteurs (chunks ok/échoués, durée facturée cumulée).

**`src/lib/streaming/session.ts`** (logique de session, transport injecté, testé
Vitest) : file d'upload **séquentielle** (1 requête en vol, préserve l'ordre et
lisse le débit vers le worker), retry porté par `transcribeCloud` existant ;
politique d'erreur :

- `quota_exhausted` / `auth` → **abort de session** : on arrête l'enregistrement
  proprement (`invoke("stop_recording")`), toast i18n existant, événement
  `transcription-error`.
- Erreur réseau/5xx persistante sur un segment → segment marqué perdu, on continue ;
  ≥ 2 échecs consécutifs → abort. À la fin, si des segments manquent, toast
  d'avertissement (le texte assemblé reste utilisable).

**`src/hooks/useStreamingSession.ts`** : écoute `streaming-chunk` /
`streaming-session-end` / `streaming-session-cancelled`, pilote la session, émet
`streaming-transcript` `{ sessionId, text }` à chaque segment transcrit (consommé par
le mini window et le Dashboard), expose `{ liveTranscript, isStreamingSession }`.

**Intégration `useRecordingWorkflow`** : le hook streaming lui est subordonné —
à `streaming-session-end` + file vidée, le texte assemblé entre dans le pipeline de
finalisation **existant** : post-process cloud (sur le texte complet), substitution
snippets, `addTranscription(..., isStreaming: true, duration = Σ durées facturées,
transcriptionProvider = "Cloud")`, collage selon `insertion_mode`, événement
`transcription-success`. Quand une session streaming est active, `transcribeAudio`
batch est court-circuité (bouton) et `audio-captured` n'arrive pas (hotkey, cf. §3.2).
Zéro segment transcrit (tout silence) → même UX que le batch silencieux (toast
`noSound`).

**Settings** : nouvelle clé `streaming_mode: boolean` (défaut `false`) dans
`AppSettings` + `DEFAULT_SETTINGS`. UI dans `TranscriptionSection` :

- Provider LexenaCloud : toggle actif « Transcription en continu » + description.
- Provider Local : rangée teaser désactivée avec chip « Lexena Cloud » (l'upsell).
- Poussée vers Rust : `CloudContext` (là où `set_cloud_gate` est déjà invoqué)
  invoque aussi `set_streaming_enabled`.
- Pas de sync cloud de cette clé pour ce lot (hors des 9 scalaires — à ajouter plus
  tard si demandé).

**Mini window (le « wow »)** : `useMiniWindowState` écoute `streaming-transcript` →
`liveTranscript`. Pendant `status === "recording"` avec `liveTranscript` non vide,
`MiniShell` affiche la **queue du texte live** (dernier ~fragment, une ligne, fondu à
gauche) entre le visualiseur et le timer. Reset à chaque nouvel enregistrement.
Aucun redimensionnement de fenêtre (comportement prévisible).

**Dashboard** : pendant une session streaming, le texte live s'affiche dans la zone
d'enregistrement (AccueilTab/RecordingCard — composant précis choisi à
l'implémentation), il grandit au fil de la dictée.

### 3.4 Ce qui ne change pas

- Le buffer batch d'`AudioRecorder` continue de tout accumuler (silence detection,
  parité de comportement, filet de sécurité).
- Provider Local : strictement aucun changement de comportement.
- Post-process, snippets, dictionnaire, historique, repaste : inchangés — le
  streaming se branche en amont, la finalisation est commune.
- Worker `api.lexena.app` : aucun changement.

## 4. Cas limites & décisions

| Cas | Décision |
|---|---|
| PTT + streaming | Fonctionne naturellement (session courte, souvent 1 segment au flush). |
| Annulation (Échap) | `Abort` : rien n'est finalisé, segments déjà transcrits jetés (déjà facturés — assumé, ils sont courts ; identique à l'annulation batch où l'audio est perdu). |
| JWT expirant en cours de session | Chaque segment relit la session Supabase (refresh automatique par le client). |
| Quota épuisé en cours de dictée | Abort + arrêt de l'enregistrement + toast quota existant. |
| Segment perdu (réseau) | Trou dans le texte + toast d'avertissement en fin ; ≥2 échecs consécutifs → abort. |
| Très longue pause (réflexion) | Aucun segment émis pendant le silence, mémoire bornée, la session continue. |
| Fenêtre main fermée (tray) | Cachée, pas fermée — les listeners tournent. Comportement identique au flux `audio-captured` actuel. |
| `translate_mode` / `smart_formatting` | Même traitement que le chemin cloud batch actuel (non envoyés au worker). |
| Streaming activé puis provider → Local | `set_streaming_enabled(false)` poussé ; les enregistrements suivants sont batch. |
| Coupe en plein mot (coupe forcée 15 s) | Risque résiduel accepté, minimisé par la recherche de RMS minimal ; les pauses naturelles dominent très largement en dictée réelle. |

## 5. Risques identifiés (à valider avant merge/beta)

1. **Rate-limit du worker** sur `/transcribe` : une dictée envoie ~4-6 req/min au
   lieu d'une. La file séquentielle lisse le débit. **À vérifier côté worker avant
   la beta** (repo non accessible cette nuit).
2. **Qualité de transcription par segment** : Whisper perd le contexte inter-segments
   (prompt continu impossible via l'endpoint actuel). Acceptable pour de la dictée ;
   le post-process sur le texte complet rattrape la ponctuation/cohérence.
3. **Facturation** : coût identique au batch (somme des durées). Si le worker applique
   un minimum par requête, léger surcoût — à vérifier en même temps que le point 1.

## 6. Tests

- **Rust** (`streaming.rs`, style `audio_trim.rs`) : coupe aux silences, min/max de
  durée, contiguïté des segments, silence pur jamais émis, flush, coupe forcée au
  RMS minimal, abort.
- **Vitest** : `assembler` (ordre, trous, jointure), `session` (file séquentielle,
  politique d'erreur quota/réseau/abort, fin de session avec uploads en vol) via
  transport injecté.
- **E2E manuel** (checklist `docs/v3/streaming-e2e-checklist.md`) : à dérouler par
  Yohann au réveil (`pnpm tauri dev`) — bouton, hotkey, PTT, annulation, quota,
  mini window, collage final.

## 7. Hors scope (volontairement)

- **Insertion continue au curseur** (le texte se tape en live dans l'app cible) —
  phase 2 naturelle, nécessite une réflexion undo/fenêtre active.
- **Streaming local** (whisper par segments) — l'architecture segmenter/événements le
  permet, mais produit veut le cloud d'abord.
- **Transport OpenAI Realtime** (deltas mot à mot) — cf. §10.
- Sync cloud de `streaming_mode`.

## 8. Fichiers touchés (prévision)

- Rust : `streaming.rs` (nouveau), `audio.rs` (tap), `state.rs`,
  `commands/recording.rs`, `commands/settings.rs` (set_streaming_enabled),
  `hotkeys.rs`, `lib.rs` (enregistrements).
- Frontend : `lib/streaming/{assembler,session}.ts` (+ tests), 
  `hooks/useStreamingSession.ts`, `useRecordingWorkflow.ts` (branchement),
  `useMiniWindowState.ts`, `mini-window/MiniShell.tsx` (+ live line),
  `settings/sections/TranscriptionSection.tsx`, `lib/settings.ts`,
  `contexts/CloudContext.tsx`, `locales/{fr,en}.json`.
- Docs : ce spec, le plan, checklist E2E, CHANGELOG (anglais), CLAUDE.md.

## 9. Critères de succès

- `cargo check` + `cargo test` (Rust) et `pnpm build` + `vitest run` (front) verts.
- Comportement batch strictement inchangé quand `streaming_mode = false` (défaut).
- PR ouverte sur `main` avec description complète — **pas de merge automatique**.

## 10. Évolution vers OpenAI Realtime (quand le repo worker sera dispo)

1. Worker : endpoint `POST /realtime-token` (auth JWT + éligibilité) qui crée un
   client secret éphémère (`POST /v1/realtime/client_secrets`, session type
   `transcription`, modèle `gpt-4o-mini-transcribe`) + comptage d'usage par session.
2. Desktop : un transport WebSocket (tokio-tungstenite) remplace la file d'upload —
   la segmentation Rust, l'assembleur et toute l'UI restent identiques (les deltas
   arrivent juste plus vite et plus fins).
