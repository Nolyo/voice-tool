## Plan de mise en production de Voice Tool

### Vue d'ensemble

- **Cible**: Windows (exe + installeur). Linux/macOS en option plus tard.
- **Exécutable**: un seul binaire "background"; activation du mode debug via `--debug` (logs verbeux + ouverture automatique des Logs).
- **ENV**: chargement multi-emplacements, sans jamais modifier/créer les fichiers `.env` de l'utilisateur.
- **Sons**: versionnés dans le repo (`voice_tool/assets/sounds`) et inclus au packaging; fallback génération en AppData si introuvables.
- **Splash**: fenêtre sombre centrée, messages d'étapes pendant l'initialisation, erreurs visibles et guidées.
- **Packaging**: PyInstaller (datas + icône). **Installeur**: Inno Setup (raccourcis, option autostart). **CI**: GitHub Actions (Windows).

### Check-list globale

- [x] ENV: chargement multi-emplacements (+ `--env`, support `GOOGLE_APPLICATION_CREDENTIALS`)
- [x] Sons: déplacer dans `voice_tool/assets/sounds` et chargement via ressources
- [ ] Exécutable unique + flag `--debug` (pas de seconde sortie console dédiée)
- [ ] Splash screen (étapes init + gestion erreurs)
- [x] Packaging PyInstaller (icône, datas, hooks) pour un exe unique — spec placée dans `packaging/pyinstaller/voice_tool.spec`
- [ ] Installeur Inno Setup (raccourcis, autostart optionnel, désinstallateur)
- [ ] CI/CD GitHub Actions (build exe + installeur, release sur tag)
- [ ] QA et documentation utilisateur

---

### ENV: stratégie de chargement prod‑friendly

Principe: ne jamais créer/modifier les `.env` de l'utilisateur; seulement les lire.

Ordre de priorité proposé (le premier trouvé gagne):

1) Paramètre CLI `--env <chemin_vers_env>` (utile en debug/test)
2) Fichier `.env` placé à côté de l'exécutable (répertoire du `Voice Tool.exe`)
3) Fichier `.env` dans AppData: `%APPDATA%/VoiceTool/.env`
4) Variables d'environnement système (Windows)
5) En développement uniquement: `.env` à la racine du projet (comportement actuel)

Compat Google: si les variables détaillées manquent, accepter `GOOGLE_APPLICATION_CREDENTIALS` (chemin vers JSON service account) et construire les credentials à partir du JSON.

Check-list ENV

- [ ] Ajouter parsing `--env <path>` et chargement conditionnel
- [ ] Ajouter lecture `.env` depuis le dossier de l'exécutable (détection `sys.frozen`)
- [ ] Ajouter lecture `.env` AppData `%APPDATA%/VoiceTool/.env`
- [ ] Fallback sur ENV système
- [ ] Conserver lecture `.env` racine projet en dev
- [ ] Support `GOOGLE_APPLICATION_CREDENTIALS` (JSON) comme alternative
- [ ] Splash: messages explicites si variables manquantes + boutons (ouvrir guide / ouvrir fenêtre)

Critères d'acceptation

- [ ] Lancement packagé sans `.env` → splash affiche l'erreur claire et n'écrase aucun fichier
- [ ] Lancement avec `.env` adjacent à l'exe → transcription OK
- [ ] Lancement avec `--env` → surcharge respectée
- [ ] Lancement avec `GOOGLE_APPLICATION_CREDENTIALS` → transcription Google OK

---

### Sons: assets versionnés

Objectif: sons présents dans le repo, inclus dans l'exe; fallback en AppData seulement si introuvables.

- Dossier: `voice_tool/assets/sounds/`
- Fichiers: `start_recording.wav`, `stop_recording.wav`, `success.wav`
- Chargement via `importlib.resources` (ou équivalent) pour fonctionner en mode packagé
- Packaging: inclure ces datas dans PyInstaller

Check-list Sons

- [x] Créer le dossier `voice_tool/assets/sounds` et y placer les 3 WAV
- [x] Adapter `voice_tool/sounds.py` pour charger d'abord depuis les ressources packagées
- [x] Conserver la génération en AppData en fallback uniquement
- [x] Inclure les WAV en datas PyInstaller

Critères d'acceptation

- [ ] En dev comme en packagé, les sons jouent sans génération préalable
- [ ] Si ressources manquantes (cas limite), fallback génération fonctionne (log informatif)

---

### Exécutable unique + mode debug

- Un seul exe (subsystem windowed)
- Flag `--debug` (ou `--console` alias) active:
  - Niveau de logs DEBUG
  - Ouverture automatique de la fenêtre principale sur l'onglet "Logs"
  - Entrées de menu tray: "Ouvrir dossier des logs" et "Ouvrir (Logs)"
- En mode packagé (`sys.frozen`): ne pas tenter de relancer un process enfant en background

Check-list Exe/Debug

- [x] Détecter `sys.frozen` et court-circuiter la relance "background-child"
- [x] Ajouter flag `--debug` (alias `--console`) : logs + ouverture onglet Logs
- [x] Ajouter actions tray pour ouvrir les logs/dossier

Critères d'acceptation

- [ ] Exe unique utilisable normalement; `--debug` donne une expérience de debug sans console Windows

---

### Splash screen (type Discord)

- Petite fenêtre sombre centrée (Tkinter), icône/logo, animation (points/pulse)
- Messages d'étapes: "Chargement .env…", "Initialisation audio…", "Démarrage icône système…", etc.
- Affiché seulement hors `--debug`
- En cas d'erreur (ex: ENV manquant): message clair + actions (ouvrir fenêtre/guide)
- Fermeture automatique quand l'init est terminée

Check-list Splash

- [x] Créer une classe `SplashWindow` (Tkinter) non bloquante
- [x] Déporter l'initialisation (messages d'étapes) et mise à jour du splash
- [x] Fermer le splash → continuer en tray
- [ ] Gérer erreurs avec message et options d'action (boutons guide/ouvrir)

Critères d'acceptation

- [ ] Temps de chargement visible et informatif; pas de clignotements ni blocages UI

---

### Packaging PyInstaller

- `.spec` dédié (icône `voice_tool_icon.ico`, datas sons, ressources nécessaires)
- Hooks éventuels pour `pynput` / `sounddevice` si requis
- Optionnel: UPX pour réduire la taille

Check-list Packaging

- [x] Écrire un `.spec` reproducible pour un exe unique
- [x] Inclure icône et datas `voice_tool/assets/sounds/*`
- [ ] Tester l'exe sur une machine Windows standard (sans Python installé)

Critères d'acceptation

- [ ] Exe démarre, tray OK, raccourcis OK, enregistrement/transcription OK, logs en AppData

---

### Installeur Windows (Inno Setup)

- Installation dans `Program Files/Voice Tool`
- Raccourcis Menu Démarrer + Bureau
- Option "Démarrer avec Windows" (HKCU Run) — alternative propre aux `.bat`
- Désinstallation propre (laisser AppData)
- Raccourcis: normal + "Voice Tool (Debug)" (`--debug`)

Check-list Installeur

- [ ] Script `.iss` avec chemins, icônes et options
- [ ] Créer les raccourcis (normal + debug)
- [ ] Option autostart (case à cocher) et application immédiate

Critères d'acceptation

- [ ] Installation/désinstallation sans résidu côté app; AppData conservé

---

### CI/CD GitHub Actions (Windows)

- Build PyInstaller + Inno Setup
- Versionnage unique (ex: `__version__`) propagé aux artefacts
- Release automatique sur tag `vX.Y.Z`

Check-list CI/CD

- [ ] Workflow Windows: installer deps, builder exe, builder installeur
- [ ] Attacher artefacts (exe + setup) aux Releases

---

### Robustesse & QA

- Instance unique: déjà gérée via fichier lock; revalider en packagé
- Permissions micro et hotkeys: documenter si besoin d'élever les droits
- Antivirus/SmartScreen: recommander la signature de code si disponible

Check-list QA

- [ ] Tests manuels: 1er lancement sans `.env`, avec `.env`, avec `--env`, avec `GOOGLE_APPLICATION_CREDENTIALS`
- [ ] Tests enregistrements: sélection micro par défaut, toggle/PTT, sons OK
- [ ] Tests fermeture propre (tray → quitter; fenêtre → quitter)

---

### Documentation utilisateur

- Fichier `README.md` (ou section dédiée) avec:
  - Où placer `.env` en version packagée (à côté de l'exe ou `%APPDATA%/VoiceTool/.env`)
  - Comment utiliser `GOOGLE_APPLICATION_CREDENTIALS`
  - Mode debug (`--debug`) et où trouver les logs
  - Guide des problèmes courants (audio, hotkeys, permissions)

Check-list Docs

- [ ] Ajouter `.env.example` (si absent) et mettre à jour le guide
- [ ] Ajouter une section "Premiers pas (version packagée)"

---

### Notes de conception

- Ne jamais modifier/créer/écraser les `.env` de l'utilisateur; seulement lecture
- Sons versionnés > robustesse et reproductibilité; fallback génération seulement en cas d'absence
- `sys.frozen` pour différencier packagé vs dev; pas de relance enfant en packagé

---

### Journal d'avancement (à cocher au fil de l'eau)

- [ ] 1. ENV multi-emplacements & fallback `GOOGLE_APPLICATION_CREDENTIALS`
- [ ] 2. Sons en `voice_tool/assets/sounds` + chargement via ressources
- [ ] 3. Exe unique + flag `--debug` + options tray
- [ ] 4. Splash screen avec pipeline d'init et erreurs UX-friendly
- [ ] 5. PyInstaller `.spec` + tests sur machine vierge
- [ ] 6. Inno Setup (raccourcis, autostart, désinstall)
- [ ] 7. CI/CD (workflow + release)
- [ ] 8. QA finale + documentation


