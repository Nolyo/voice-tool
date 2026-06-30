# Associations de fichiers Windows — import de fichiers texte en note

- **Date** : 2026-06-30
- **Statut** : spec validée, implémentation **mise en pause** (le déclenchement reste à décider)
- **Scope** : Windows uniquement (v1)
- **Sous-épique** : hors épique v3 sync (feature autonome, s'appuie sur l'infra existante)

## 1. Problème / objectif

Aujourd'hui, dans l'explorateur Windows, un fichier texte propose « Ouvrir avec → Cursor / Bloc-notes ». On veut que **Lexena apparaisse dans cette liste** et que, à l'ouverture, le contenu du fichier soit importé comme **nouvelle note**.

Lexena n'apparaît dans « Ouvrir avec » que s'il est enregistré comme handler du type de fichier dans le registre Windows. Tauri sait écrire ces entrées via `bundle.fileAssociations` (l'installeur NSIS les pose à l'installation et les nettoie à la désinstallation), mais ne « livre » pas le fichier à l'app au runtime : sur Windows le chemin arrive en **argument de ligne de commande**, exactement comme nos deep links `lexena://`. **~80 % de la plomberie existe déjà** (single-instance + buffer cold-start deep-link).

## 2. Rappel : comment Windows route l'ouverture

- `HKEY_CLASSES_ROOT\.ext` → pointe vers un **ProgID** (ex. `Lexena.textfile`).
- `HKEY_CLASSES_ROOT\<ProgID>\shell\open\command` → `"C:\...\Lexena.exe" "%1"` où `%1` = chemin du fichier.
- L'app apparaît dans « Ouvrir avec » via `OpenWithProgIds` **sans voler l'association par défaut** existante (Cursor/Bloc-notes restent le défaut).
- Au clic : Windows lance `Lexena.exe "C:\chemin\fichier.ext"` → le chemin arrive en `argv`.

## 3. Décisions prises (verrouillées)

| # | Décision | Choix retenu | Alternatives écartées |
|---|----------|--------------|------------------------|
| D1 | Types de fichiers | Fichiers **texte au sens large, incluant le code** | Minimal (txt/md/json/html) ; audio (hors scope, nécessiterait un pipeline de transcription de fichier inexistant) |
| D2 | Comportement sync à l'import | **Note normale** : sync auto si le profil a la sync active, rétention 30j à la suppression — assumé | Local-only par défaut ; demander à chaque import |
| D3 | Rendu du contenu | **Bloc de code** monospace fidèle (indentation + sauts de ligne préservés), langage déduit de l'extension | Paragraphes (perd l'indentation) ; rendu intelligent par type (parseur Markdown + DOMPurify, surface XSS) |
| D4 | Titre de la note | **Nom complet du fichier** (`config.json`, `script.py`) | Nom sans extension |
| D5 | Emplacement | **Racine** (note non classée) | Dossier dédié « Importé » ; dossier actif |
| D6 | Multi-fichiers | **Une note par fichier** | Un seul fichier ; note unique concaténée |
| D7 | Plateforme | **Windows uniquement** (v1) | macOS (`RunEvent::Opened`) reporté |

**Sécurité** : le contenu passe par `escapeNoteHtml` (échappe `& < >`) avant d'être placé dans le bloc de code → **aucune injection HTML possible**, même pour un `.html` importé (on stocke et affiche son source, on ne le rend pas).

## 4. Comportement utilisateur

1. Clic-droit sur un fichier texte/code → « Ouvrir avec → Lexena » (ou double-clic si Lexena est défini comme défaut par l'utilisateur).
2. **App fermée** → Lexena démarre, la fenêtre principale s'affiche, une nouvelle note est créée avec le contenu en bloc de code, et elle s'ouvre directement.
3. **App déjà ouverte** → la fenêtre passe au premier plan (même depuis le tray), la note est créée et ouverte ; **aucun second processus** (single-instance).
4. Plusieurs fichiers sélectionnés → une note par fichier.
5. Toast de confirmation (i18n). Si un fichier dépasse les garde-fous (taille/encodage), message d'erreur explicite (i18n), les autres fichiers du lot restent traités.

## 5. Architecture technique

### 5.1 Configuration — `src-tauri/tauri.conf.json`

Ajout de `bundle.fileAssociations` : liste d'extensions + description + ProgID + icône. NSIS (seul target actuel) écrit le registre.

Liste d'extensions cible (« large », à finaliser à l'implémentation) :

```
.txt .md .markdown .json .html .htm .xml .csv .tsv .yaml .yml
.css .scss .less .log .ini .toml .conf .cfg .env
.js .jsx .ts .tsx .py .rb .php .go .rs .java .c .h .cpp .cs
.sh .bash .ps1 .bat .sql .lua .r .pl .swift .kt
```

### 5.2 Backend Rust — nouveau module `src-tauri/src/file_import.rs`

En miroir de `auth::emit_deep_link_event` (parsing + buffer cold-start + émission d'event).

- **Distinction arg fichier vs URL** : le filtre actuel `a.starts_with("lexena://")` (lib.rs:66/73) est **étendu, pas remplacé**. Un arg est traité comme import si : ne commence pas par `-` (exclut `--minimized` etc.), pointe vers un fichier **existant** (`Path::exists()`), extension dans la liste reconnue.
- **Validation** : extension reconnue, fichier existant, **taille max** (garde-fou anti-binaire/anti-énorme, ex. refus > 10 Mo avec message).
- **Lecture** : UTF-8 **lossy** (`String::from_utf8_lossy`) — les `.txt` Windows peuvent être UTF-16/Latin-1 ; fallback propre plutôt que crash. (Amélioration possible v2 : détection d'encodage type `chardetng`.)
- **Cold start** (app fermée) : lire `std::env::args()` au `setup`, bufferiser le(s) payload(s) jusqu'à ce que le frontend signale qu'il est prêt (réutilise le pattern du buffer auth deep-link + commande `consume_pending_*`), puis émettre `file-opened`.
- **Warm start** (app ouverte) : le callback `single_instance` (lib.rs:65) route les args fichier vers `file_import` + `window.show()` + `set_focus()`.
- **Event émis** : `file-opened` avec payload `{ filename: string, content: string }`. La **déduction du langage se fait côté front** (table de mapping dans `file-to-note.ts`, près du `CodeBlock`) — le back reste agnostique du langage.

### 5.3 Frontend

- **`src/lib/notes/file-to-note.ts`** — fonction **pure et testable** (jumelle de `transcription-to-note.ts`) :
  `fileToNoteHtml(filename, content)` → `content_html` = un bloc de code TipTap contenant `escapeNoteHtml(content)`, avec attribut langage déduit de l'extension (table de mapping `extension → langage CodeBlock`). Réutilise `escapeNoteHtml` de `note-text.ts`.
- **Table de mapping langage** : `json→json`, `js/jsx→javascript`, `ts/tsx→typescript`, `py→python`, `html/htm→html`, `xml→xml`, `css→css`, `md→markdown`, `yaml/yml→yaml`, `sql→sql`, `sh/bash→bash`, `rs→rust`, `go→go`, … inconnu → bloc brut (pas de langage).
- **`src/hooks/useFileImport.ts`** — écoute l'event `file-opened` :
  crée la note via `useNotes` (titre = filename, contenu = `fileToNoteHtml(...)`, dossier = racine) → ouvre/sélectionne la note → montre la fenêtre principale → toast i18n.
- **Cap 3 Mo** : **réutilise le mécanisme `oversized_note_count` existant** (`src/lib/sync/note-size.ts`). Un fichier dont le contenu dépasse 3 Mo UTF-8 crée une note **locale non syncée** + bannière `sync.oversizedNotes_warning` déjà en place. **Aucun code neuf** pour ce cas.
- **i18n** : tous les toasts/messages via react-i18next (clés `fileImport.*`).

### 5.4 Intégration `lib.rs`

- Enregistrer le module `file_import` + d'éventuelles commandes (`consume_pending_file_import`, `mark_frontend_ready` si pas déjà existant).
- Étendre le callback `single_instance` et le `setup` deep-link existants ; **ne pas dupliquer** la logique « bring window forward ».

## 6. Cas limites

- **Fichier inexistant / supprimé entre le clic et le traitement** → ignoré silencieusement (log).
- **Extension reconnue mais contenu binaire** (ex. `.log` binaire) → UTF-8 lossy produit des `�` ; garde-fou taille limite les dégâts. Acceptable v1.
- **Fichier > 10 Mo** → refusé avec message (évite d'exploser la mémoire et la note).
- **Fichier 3–10 Mo** → importé en note locale non syncée (mécanisme oversized).
- **Lot multi-fichiers partiellement invalide** → traiter les valides, signaler les invalides.
- **App portable (non installée)** → pas d'association possible (le registre n'est écrit que par l'installeur NSIS) ; cohérent avec l'updater déjà désactivé en portable.
- **Profil actif** → la note atterrit dans le profil courant ; pas de sélecteur de profil à l'import (v1).

## 7. Tests

- **Rust (`file_import.rs`)** : parsing/validation des args — extension reconnue/non, chemin inexistant, distinction URL `lexena://` vs chemin fichier, dépassement taille, UTF-8 lossy. (Miroir des 11 tests `auth`.)
- **TS (`file-to-note.test.ts`)** : échappement HTML, mapping langage par extension, gros contenu, extension inconnue → bloc brut.
- **E2E manuel (obligatoire)** : build NSIS → installer → vérifier l'apparition dans « Ouvrir avec » → import à froid (app fermée) **et** à chaud (app ouverte) → vérifier titre, bloc de code, langage, sync. Le registre ne se teste qu'en conditions réelles.

## 8. Effort estimé

**~2 à 3 jours de dev** (Windows uniquement) :

| Lot | Estimation |
|-----|------------|
| `fileAssociations` (config) + table mapping langages | ~1 h |
| `file_import.rs` (validation, lecture, buffer cold-start, routing args) + tests Rust | ~1 j |
| Frontend (`file-to-note.ts` + `useFileImport.ts` + i18n) + tests TS | ~0,5–1 j |
| Encodage UTF-8 lossy + garde-fous taille + intégration cap 3 Mo | ~0,5 j |
| E2E registre (build/install/Ouvrir avec, cold + warm) + ajustements | ~0,5 j |

## 9. Hors scope / suites possibles

- **macOS** : associations via `CFBundleDocumentTypes` + event `RunEvent::Opened`. Reporté.
- **Fichiers audio** (`.wav`, `.mp3`, `.m4a`) → transcription : nécessite un **nouveau pipeline de transcription de fichier** (décodage → PCM 16 kHz → whisper), inexistant aujourd'hui (l'app ne transcrit que le micro temps réel). Estimé +1–3 j. Hors scope v1.
- **Rendu intelligent par type** (Markdown rendu, HTML rendu sanitizé) : reporté (D3).
- **Détection d'encodage avancée** (UTF-16/Latin-1 fiable) : reporté (UTF-8 lossy en v1).
- **Choix du profil/dossier de destination à l'import** : reporté.

## 10. Points à revalider au moment de l'implémentation

- Vérifier que le NSIS de la version Tauri utilisée écrit bien `OpenWithProgIds` (apparition dans « Ouvrir avec » **sans** écraser le défaut).
- Confirmer la commande/flag exact de signalement « frontend prêt » pour le buffer cold-start (réutiliser l'existant auth si possible).
