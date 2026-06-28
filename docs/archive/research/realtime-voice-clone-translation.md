# Traduction vocale temps réel avec clonage de voix

> Note de recherche sur la faisabilité d'un pipeline "je parle en FR → Teams entend ma voix en EN".
> Date : 2026-04-17.
> Statut : **faisable avec la tech existante**, bottleneck = UX (latence) et juridique, pas technique.

## Le scénario cible

Tu es en réunion Teams/Zoom avec des interlocuteurs anglophones. Tu parles français dans ton micro, mais côté Teams ils entendent **ta voix en anglais** (même timbre, même couleur vocale). En retour, tu vois/entends leurs propos traduits en français pour toi.

Objectif : **supprimer la barrière linguistique sans perdre ton identité vocale** dans des réunions pro.

## Pipeline complet

```
Toi (FR parlé)
  ↓ capture micro (cpal, déjà dans l'app)
Audio FR
  ↓ Whisper streaming local OU Deepgram streaming
Texte FR
  ↓ LLM (GPT-4o-mini, Claude Haiku, Llama 3)
Texte EN
  ↓ TTS avec clone vocal (ElevenLabs / XTTS-v2 / F5-TTS)
Audio EN (ta voix)
  ↓ routage vers micro virtuel (VB-Cable, VoiceMeeter sur Windows)
Teams / Zoom / Meet (qui pense entendre ton micro)
```

En sens inverse pour le retour (leur audio → transcription EN → traduction FR → affiché dans une fenêtre ou lu à l'oreille).

## Briques et maturité en 2026

| Étape | Solutions | Maturité | Latence |
|---|---|---|---|
| Capture audio | cpal / WASAPI | ✅ Production | ~0 |
| Speech-to-text streaming | Whisper streaming, Deepgram, AssemblyAI streaming | ✅ | 300-800ms |
| Traduction | GPT-4o-mini, Claude Haiku, DeepL API | ✅ | 150-400ms |
| TTS clone streaming | ElevenLabs, XTTS-v2, F5-TTS, OpenVoice v2 | ✅ | 200-800ms (first chunk) |
| Routage vers micro virtuel | VB-Cable, VoiceMeeter, BlackHole (Mac) | ✅ | ~0 |

**Latence totale end-to-end : 1 à 2,5 secondes.**

## Clonage de voix — état de l'art

### Solutions cloud
- **ElevenLabs** (référence qualité)
  - Clone depuis 30s-1min d'audio
  - Streaming TTS ~200ms first-chunk
  - Multilingue (28+ langues)
  - ~5-22 $/mois selon volume
  - API simple, bien documentée

- **Play.ht**, **Resemble AI** : alternatives ElevenLabs, qualité légèrement en dessous

### Solutions locales / open-source
- **XTTS-v2 (Coqui)** : multilingue, clone depuis 10s. Qualité bonne. Latence ~500ms-1s sur RTX 3060+. Projet un peu abandonné mais fonctionnel.
- **F5-TTS** : plus récent, qualité très bonne, clone depuis 15s, optimisé pour le streaming.
- **OpenVoice v2** : bon compromis multilingue, open-source, moins demandeur en GPU.
- **VALL-E-X** : recherche Microsoft, pas de release grand public utilisable.

**Pour du local temps réel de qualité**, F5-TTS sur une RTX 3060+ est la référence en 2026. Pour du cloud, ElevenLabs reste au-dessus en qualité.

## Routage audio vers Teams

### Windows (cas principal)
- **VB-Cable** (gratuit, donation) : 1 ou 2 cables virtuels
- **VoiceMeeter Banana/Potato** : mixer plus flexible
- Principe : ton app envoie son audio vers "CABLE Input", Teams règle son micro sur "CABLE Output"
- **Éprouvé** : les streamers, les musiciens, les podcasteurs l'utilisent en masse depuis 10+ ans

### Mac
- **BlackHole** (gratuit, open-source) : équivalent VB-Cable
- **Loopback** (payant, Rogue Amoeba) : plus confortable

### Linux
- **PulseAudio / PipeWire** supportent nativement les virtual sinks

## Budget latence détaillé

Pour une phrase "Bonjour, je pense que c'est une bonne idée" :

| Étape | Temps |
|---|---|
| Fin de parole détectée (VAD) | +300ms |
| Whisper streaming (dernier chunk) | +400ms |
| Appel LLM traduction | +300ms |
| TTS streaming premier chunk audio | +500ms |
| Playback dans Teams | +50ms |
| **Total audible par l'interlocuteur** | **~1,5s** |

Pour des phrases plus longues, la latence perçue peut être masquée : le TTS commence à parler pendant que la suite de la traduction arrive encore.

## Les vrais problèmes (pas la tech, l'usage)

### 1. Rythme conversationnel cassé
1,5-2,5s de délai = impossible :
- D'interrompre
- De répondre du tac au tac
- De faire des back-and-forth rapides

La réunion adopte un rythme **UN / interprétation simultanée** : chacun parle à tour de rôle, avec pauses. C'est viable pour certains contextes (présentations, Q&A structurées), pénible pour d'autres (brainstorms, débats).

### 2. Problème du "retour casque"
Tu parles FR, mais ce que Teams émet est une version EN différée. Sans retour, tu ne sais pas :
- Si le système a bien capturé
- Si la traduction est bonne
- Si ta voix EN a bien été émise

**Solution** : router aussi la sortie vers ton casque avec un léger offset (monitoring). Mais ça te met la tête à l'envers (tu t'entends parler EN avec 1,5s de retard).

Variante : afficher simplement le **texte EN** qui vient d'être dit, à l'écran, comme un sous-titre.

### 3. Qualité de voix dans l'uncanny valley
Même les meilleurs clones 2026 ne sont pas **transparents**. À 95% de naturel :
- Intonation un peu plate
- Absence de respirations, micro-hésitations
- Émotion difficile à rendre
- Accent : certains modèles gardent ton accent FR (charmant ou ridicule), d'autres prononcent en native (ton timbre mais accent parfait — bizarre)

Les interlocuteurs sensibles peuvent détecter "c'est pas toi qui parles là" ou au minimum sentir quelque chose d'étrange.

### 4. Zone grise juridique
- **Clonage de ta propre voix** par toi-même = OK
- **Enregistrer une réunion** pour entraîner le clone = interdit sans consentement dans plein de pays (France, UE RGPD, Californie, Illinois BIPA…)
- **Diffuser une voix générée par IA** dans un contexte pro sans l'indiquer aux interlocuteurs = débat ouvert, déjà réglementé dans certains cadres (lobbying US en 2024-2025)
- En entreprise, la conformité peut devenir un frein. Plusieurs boîtes interdisent déjà les deep fakes vocaux même auto-appliqués

### 5. Traduction n'est pas interprétation
Un LLM traduit **mot à mot avec adaptation**. Un interprète humain adapte **le fond** :
- Reformule une idée culturellement mal transposable
- Condense ou développe selon le contexte
- Gère l'humour, les idiomes

Un pipeline automatique te fera dire des choses maladroites voire contre-sens sur les métaphores, humour, références culturelles.

## Concurrence / benchmark 2026

| Produit | Temps réel | Clone vocal | Routage apps | Statut |
|---|---|---|---|---|
| HeyGen Video Translation | ❌ | ✅ | ❌ | Asynchrone, vidéo uniquement |
| ElevenLabs Dubbing | ❌ | ✅ | ❌ | Asynchrone, post-prod |
| Meta SeamlessM4T | ✅ | ⚠️ Partiel | ❌ | Recherche, open-source |
| Samsung Galaxy AI Live Translate | ✅ | ❌ | ✅ (appels) | Voix générique, pas clone |
| Microsoft Teams Interpreter | ✅ | ❌ | ✅ (Teams) | Preview, voix générique |
| Google Meet Translate | ✅ | ❌ | ✅ (Meet) | Sous-titres, pas audio |

**Personne** ne propose aujourd'hui en produit grand public : **temps réel + clone vocal + routage vers apps de visio tierces**. La tech existe, les pièces sont là, personne n'a assemblé. **Créneau réel.**

## Faisabilité pour Voice Tool — 3 paliers

### POC minimaliste (1 mois à plein temps)
- Whisper streaming local (ou Deepgram si trop lent)
- Traduction via API OpenAI/Claude
- TTS via **ElevenLabs** (pas de clone local au départ)
- Routage via **VB-Cable** (dépendance externe que l'utilisateur installe)
- UI : un toggle "mode réunion traduite" dans la mini-window

**Résultat attendu** : ça marche, latence ~1,5-2s, qualité correcte, coût utilisateur = forfait ElevenLabs + API LLM.

**Décision clé à valider tôt** : mesurer la latence réelle end-to-end sur ta machine avant d'engager des mois.

### Version finie (3-6 mois)
- Tout local possible : XTTS-v2 ou F5-TTS
- Clone vocal géré dans l'app (onboarding "enregistre 30s")
- UI complète : settings retour casque, choix de langues cible, mode "sous-titres uniquement" vs "voix"
- Gestion des tours de parole (VAD intelligent, pauses)

### Version "produit mature" (12 mois+)
- Optimisation latence < 1s (modèles custom, quantization agressive)
- Détection de tour de parole fine (quand se taire si l'autre parle)
- Préservation d'émotion dans le clone
- Support multi-participants (diarization + clone de chacun côté écoute)
- Intégration native Teams / Zoom via leurs SDK (sans VB-Cable)

## Dépendances et risques

### Dépendances externes
- **ElevenLabs** (option cloud) : dépendance vendor. Prix peut changer. Outage = app cassée.
- **VB-Cable / VoiceMeeter** : installation séparée par l'utilisateur. Friction d'onboarding non négligeable.
- **OpenAI / Claude API** : idem ElevenLabs.

### Risques techniques
- Latence qui gonfle si le réseau/GPU est chargé
- Qualité qui varie selon la voix source (voix graves, accents marqués, enrouements…)
- Conflits avec les systèmes de suppression de bruit de Teams (Teams peut filtrer/altérer l'audio généré)

### Risques produit
- Adoption freinée par la friction (setup VB-Cable, enregistrement clone, comptes API)
- Retours négatifs si la qualité donne des faux-sens embarrassants en réunion pro
- Positionnement : jouet vs outil pro ? Gratuit vs premium ?

### Risques légaux
- Déploiement en entreprise potentiellement bloqué par DSI / compliance
- Obligation future de déclarer "voix IA" dans certains contextes (appels téléphoniques, call centers — déjà en discussion US)

## Décisions à prendre si on poursuit

1. **Cloud, local, ou hybride** pour le TTS ? Impact énorme sur coût, latence, privacy.
2. **ElevenLabs vs local** : qualité vs indépendance. Commencer cloud pour valider, basculer local plus tard ?
3. **Routage** : on pousse l'utilisateur à installer VB-Cable, ou on intègre directement dans un SDK Teams/Zoom ?
4. **Positionnement** : feature de Voice Tool, ou spin-off en produit dédié ?
5. **Validation** : ce scénario est-il ton cas d'usage personnel, ou un pari produit plus large ?

## Prochaines étapes possibles

### Option A — On abandonne l'idée
Pas scandaleux. C'est très ambitieux, risqué juridiquement, et peut être hors scope.

### Option B — Spike technique court (2-3 jours)
Assembler un POC brut :
1. Whisper streaming → texte FR
2. Appel GPT-4o-mini → texte EN
3. Appel ElevenLabs TTS streaming (clone fait une fois, à la main, sur leur site) → audio
4. Play audio → VB-Cable → Teams test call

Mesurer latence réelle et qualité sur une vraie call Teams. Décider ensuite.

### Option C — Épique complet
Intégrer dans le backlog comme EPIC-09 ou équivalent, avec stories détaillées, et prévoir 3-6 mois.

## Références

- [ElevenLabs Streaming API](https://elevenlabs.io/docs/api-reference/streaming)
- [F5-TTS GitHub](https://github.com/SWivid/F5-TTS)
- [XTTS-v2 (Coqui TTS)](https://github.com/coqui-ai/TTS)
- [VB-Audio Virtual Cable](https://vb-audio.com/Cable/)
- [Meta SeamlessM4T](https://ai.meta.com/research/seamless-communication/)
- [OpenAI Realtime API](https://platform.openai.com/docs/guides/realtime) — autre piste pour streaming s2s
- Analyse juridique voice cloning EU : [EU AI Act](https://artificialintelligenceact.eu/) — articles sur deep fakes et transparence
