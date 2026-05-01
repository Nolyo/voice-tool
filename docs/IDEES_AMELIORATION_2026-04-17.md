# Idées d'amélioration — Voice Tool

> Brain-dump exhaustif pour triage utilisateur. Date : 2026-04-17.
> Basé sur l'analyse de l'app v2.10.0-beta.5 et du backlog existant.
>
> **Convention de marquage** :
> - ⚡ Quick win (< 1 jour)
> - 🔧 Simple (1-3 jours)
> - 🏗️ Moyen (1-2 semaines)
> - 🚀 Audacieux (plusieurs semaines / refonte)
> - 🌙 Moonshot (vision long terme)
>
> Les idées **déjà présentes dans BACKLOG.md** (traduction, Mac/Linux, releases auto, sécurité, comptes) ne sont pas reprises sauf pour les compléter.

---

## 1. Enregistrement audio & capture

### 1.1 ⚡ Indicateur visuel de niveau d'entrée dans les settings ✅
Quand l'utilisateur teste un micro dans les paramètres, afficher en direct le niveau RMS pour qu'il vérifie sans lancer d'enregistrement.

### 1.2 ⚡ Rappel sonore configurable (bip de début/fin)
Actuellement `enable_sounds` est un bool global. Proposer des packs de sons (discret, net, cinématique) ou permettre de charger un WAV custom.

### 1.3 🔧 Auto-gain / normalisation avant transcription
Beaucoup d'utilisateurs ont un micro trop bas. Normaliser le signal (RMS target) avant envoi à Whisper améliore les résultats sans toucher au matériel.

### 1.4 🔧 Détection de voix (VAD) au lieu de simple RMS
Remplacer `silence_threshold` basique par un VAD (Silero VAD en ONNX, ou `webrtc-vad`). Moins de faux positifs sur les bruits de fond (clavier, respiration).

### 1.5 🔧 Trim silence automatique en début/fin
Couper automatiquement les silences de bord avant la transcription → latence perçue réduite + meilleure qualité.

### 1.6 🏗️ Mode "recording en continu avec découpage auto"
Plutôt qu'un toggle start/stop, enregistrer en continu et envoyer par chunks dès qu'un silence de X secondes est détecté. UX type "tout devient dictable".

### 1.7 🏗️ Multi-micro simultané (micro + audio système)
Permettre d'enregistrer les deux en parallèle dans un même flux (réunions : je parle + mes interlocuteurs). Brancherait EPIC-04 mais en version "tout venant".

### 1.8 🚀 Dé-bruitage IA en temps réel (RNNoise / DeepFilterNet)
Intégrer un filtre de suppression de bruit en amont de Whisper. Gain énorme sur les transcriptions en environnement bruyant (café, open-space).

### 1.9 🚀 Séparation de locuteurs (diarization) offline
Pour les notes de réunion : identifier qui parle (Speaker 1, 2…). Possible avec `pyannote` ou `speechbrain` exportés en ONNX.

---

## 2. Transcription — qualité & moteurs

### 2.1 ⚡ Afficher la langue détectée automatiquement ❌
Aujourd'hui la langue est forcée dans les settings. Ajouter un indicateur "langue détectée : XX" après chaque transcription, utile pour multilingues.

### 2.2 ⚡ Prompt initial ("initial prompt") configurable ✅
Whisper accepte un prompt qui influence le vocabulaire et le style. L'exposer dans les settings (en plus du dictionnaire), avec des templates (dev, médical, juridique, gaming…).

### 2.3 🔧 Intégration du dictionnaire dans l'initial prompt ✅
Aujourd'hui `dictionary: string[]` existe dans les settings mais son usage réel via Whisper initial prompt n'est pas évident. Documenter / renforcer.

### 2.4 🔧 Correction post-transcription via LLM local (petit modèle) ✅ (fait avec appel via api pas cloud)
Passer chaque transcription brute dans un petit LLM local (Llama 3.2 3B en Q4, ou Phi) pour corriger orthographe/ponctuation sans appel cloud. Option à activer.

### 2.5 🔧 Support Deepgram / AssemblyAI comme provider ❌
En plus d'OpenAI, proposer Deepgram (streaming, moins cher) et AssemblyAI (meilleure ponctuation). `transcription_provider` est déjà une enum, facile à étendre.

### 2.6 🔧 Support Groq (Whisper large-v3-turbo hébergé, ultra rapide) ✅
Groq héberge Whisper à des vitesses absurdes et prix bas. Un provider "Groq" serait le meilleur compromis rapidité/coût/qualité pour un power user.

### 2.7 🏗️ Transcription streaming (résultats partiels pendant l'enregistrement)
Afficher le texte qui se construit pendant qu'on parle, comme Wispr Flow ou Dragon. Whisper n'est pas naturellement streaming mais des hacks existent (chunking avec overlap), et Deepgram le fait nativement.

### 2.8 🏗️ Mode "dictée longue" avec pauses ❌
Pour enregistrer 10-30 min sans stress : découpage en chunks, assemblage propre, correction de jointures, export unique.

### 2.9 🏗️ Fallback automatique provider
Si OpenAI plante (timeout, quota), basculer automatiquement sur le modèle local. Aujourd'hui l'utilisateur doit le faire à la main.

### 2.10 🚀 Mix providers : rapide + précis
Transcription immédiate via `tiny` local pour preview, puis re-transcription via `large-v3-turbo` en arrière-plan qui remplace le texte. Best of both worlds.

### 2.11 🚀 Fine-tuning du modèle sur la voix de l'utilisateur ❌
Optionnel, offline : l'utilisateur enregistre 10 minutes de calibration, l'app fine-tune un adapter (LoRA) local. Gain de précision massif pour noms propres, jargon perso.

---

## 3. Mini-window & UX d'enregistrement

### 3.1 ⚡ Timer visible en permanence (pas seulement pendant l'enregistrement) ❌
Afficher la durée depuis la dernière transcription ou un compteur "silence depuis X s" pour guider.

### 3.2 ⚡ Bouton "annuler" directement dans la mini-window ❌
Aujourd'hui il faut le raccourci clavier `cancel_hotkey`. Ajouter un bouton visible sur hover.

### 3.3 ⚡ Indication visuelle du mode actif (toggle vs PTT)
Badge discret dans la mini-window pour savoir quel mode est en cours.

### 3.4 🔧 Taille configurable de la mini-window ✅
Certains utilisateurs veulent une barre plus discrète, d'autres plus grande avec plus d'infos. Ajouter un slider.

### 3.5 🔧 Position mémorisée (pas forcément bottom-center)
Permettre à l'utilisateur de drag la mini-window où il veut et la retrouver à cet endroit.

### 3.6 🔧 Mode "waveform" au lieu de "bars" ✅
Alternative graphique : oscilloscope/waveform continue, plus riche visuellement.

### 3.7 🏗️ Mini-window interactive : afficher texte en streaming
Pendant le streaming (voir 2.7), afficher le texte qui se construit dans la mini-window.

### 3.8 🏗️ Overlay "dictated" temporaire
Après collage auto, afficher 2 secondes un toast "✓ 42 mots dictés" en corner d'écran. Réassurance.

### 3.9 🚀 Mini-window contextuelle qui s'adapte à l'app active ❌
Si l'utilisateur est dans VS Code → suggestion "mode code" (sans ponctuation aléatoire). Dans Outlook → "mode mail". Via détection de la fenêtre active.

---

## 4. Notes & édition

### 4.1 ⚡ Raccourci pour créer une nouvelle note vocale
Un hotkey global "nouveau note + enregistrer" qui ouvre l'éditeur et déclenche le recording en une action.

### 4.2 ⚡ Export Markdown / PDF / DOCX des notes
Actuellement les notes sont dans l'app uniquement. Export simple via copy-to-markdown ou via headless browser → PDF.

### 4.3 ⚡ Recherche dans toutes les notes (full-text) ✅
`searchNotes` existe mais à vérifier qu'elle couvre le contenu et pas juste le titre.

### 4.4 🔧 Tags / catégories de notes
Organiser les notes avec des tags colorés, filtrage par tag.

### 4.5 🔧 Favoris pour notes ET pour transcriptions ❌
`toggleFavorite` existe pour notes. L'étendre aux transcriptions de l'historique.

### 4.6 🔧 Dossiers / arborescence ✅
Pour utilisateurs qui ont beaucoup de notes, structure en dossiers.

### 4.7 🔧 Templates de notes
"Compte-rendu de réunion", "Idée brainstorm", "Journal quotidien" : l'utilisateur choisit, la structure est pré-remplie, il dicte dans les blocs.

### 4.8 🔧 Historique de versions par note
Chaque save crée une version. Rollback possible. Pratique quand une action IA a dégradé le contenu.

### 4.9 🏗️ Commandes vocales pendant la dictée dans une note ✅
"Nouveau paragraphe", "liste à puce", "titre 2 : XXX", détectées et appliquées automatiquement.

### 4.10 🏗️ Continuation de note par dictée
Au lieu de créer une nouvelle transcription, dicter directement dans la note active en mode append.

---

## 5. Snippets & vocabulaire

### 5.1 ⚡ Import/export snippets + dictionnaire
Aujourd'hui dans le JSON settings. Un bouton export/import pour partager entre machines ou avec des collègues.

### 5.2 ⚡ Activation/désactivation globale des snippets sans les supprimer ❌
Toggle général pour les désactiver temporairement (pour quelqu'un qui code et ne veut pas que "mon adresse mail" soit remplacé).

### 5.3 🔧 Snippets contextuels par application ❌
"mon adresse mail" → `perso@…` dans Gmail, `pro@…` dans Outlook.

### 5.4 🔧 Variables dans les snippets ❌
`{{date}}`, `{{time}}`, `{{user}}`, curseur `|`. Format à la TextExpander.

### 5.5 🔧 Snippets dynamiques (scripts) ❌
Le remplacement est le résultat d'un petit script/shell/JS. Ex : "mon IP publique" → appel à ipify.

### 5.6 🏗️ Partage de packs de snippets ❌ ❌
Marketplace communautaire (ou juste un export GitHub Gists) : pack "développeur web", pack "médecin", pack "commercial".

### 5.7 🏗️ Apprentissage automatique du dictionnaire ❌
Détecter les mots que Whisper rate systématiquement et proposer à l'utilisateur de les ajouter au dictionnaire. "Ollama" a l'air d'avoir été ajouté parce que Whisper le ratait ; automatiser.

---

## 6. IA & actions sur le texte

### 6.1 ⚡ Raccourci clavier pour chaque action IA fréquente ❌
Cmd+Shift+T = traduire, Cmd+Shift+C = corriger… Dans les notes.

### 6.2 ⚡ Historique des actions IA (undo intelligent) ❌
Voir ce que l'IA a changé, pouvoir revenir en arrière précisément.

### 6.3 🔧 Actions IA sur la sélection dans n'importe quelle app ❌
Pas seulement dans l'éditeur de notes : raccourci global qui prend le texte sélectionné n'importe où, le passe dans une action IA, remet le résultat à la place. Concurrent direct de Raycast AI, GrammarlyGO, Wispr Flow.

### 6.4 🔧 Actions IA personnalisées sauvegardables
Aujourd'hui "custom" permet un prompt à la volée. Permettre de sauvegarder des prompts perso ("transformer en TL;DR", "corriger en style LinkedIn"…).

### 6.5 🔧 Choix du modèle IA par action
Pour "corriger" → GPT-4o mini (rapide, pas cher). Pour "améliorer formel" → GPT-4o. Pour "traduire" → Claude Haiku. Optimisation coût/qualité.

### 6.6 🔧 Support LLM local (Ollama, llama.cpp)
Les actions IA actuelles passent par OpenAI. Permettre de les router vers un Ollama local. 100% offline.

### 6.7 🏗️ Mode "clean up voice notes" : correction automatique de toute transcription ✅
Toute transcription brute est passée dans un LLM discret qui enlève les "euh", "voilà", répétitions, et formate joliment. Option on/off. Différent de `smart_formatting` qui est côté Whisper.

### 6.8 🏗️ "Ask your notes" : chat avec ses notes
Interroger son corpus de notes en langage naturel. Embeddings locaux + LLM. Recherche sémantique. Un mini RAG perso.

### 6.9 🚀 Agent vocal complet
"Ajoute un événement demain à 14h avec Yohann", "envoie un mail à maman pour lui dire que j'arrive", "résume-moi mes 3 dernières notes". Intention → action réelle (calendar, mail, app control).

---

## 7. Productivité & workflow

### 7.1 ⚡ Historique partageable (lien, export zip) ❌
Exporter un lot de transcriptions avec audio en zip.

### 7.2 ⚡ Copie d'une transcription avec formatage (Markdown, HTML, texte) ❌
Menu de copie contextuel : "copier en MD", "copier en texte brut".

### 7.3 🔧 Raccourci clavier pour re-coller la dernière transcription
Pratique si la dernière dictée s'est perdue (ex : focus dans un champ qui a reset).

### 7.4 🔧 Queue de transcriptions en attente
Si on enchaîne 5 dictées rapidement pendant que la transcription est lente, les empiler et les traiter dans l'ordre au lieu de perdre des enregistrements.

### 7.5 🔧 Stats d'usage
"Tu as dicté 1h23 cette semaine, 14 528 mots, économisé ~47 min comparé au clavier". Motivation + data perso.

### 7.6 🏗️ Intégration avec le presse-papier (historique) ❌
Mini clipboard manager intégré, combiné à la dictée. Chaque transcription = une entrée du clipboard.

### 7.7 🏗️ Actions post-transcription chaînables  ✅
"Chaque fois que je dicte, passe dans → corriger → traduire en anglais → copier". Pipeline configurable.

### 7.8 🚀 Macros vocales programmables ❌
L'utilisateur définit "envoyer mail à X" → ouvre Outlook, tabule, colle X, tabule, colle le texte dicté, envoie. Via enigo qui est déjà là. Un peu comme AutoHotkey mais déclenché par la voix.

---

## 8. Intégrations externes

### 8.1 ⚡ Webhooks sortants ❌
"Envoie chaque transcription en POST à cette URL". Permet à un utilisateur technique de brancher n'importe quoi (Zapier, n8n, Obsidian via local-rest-api…).

### 8.2 🔧 Intégration Obsidian / Logseq
Écrire directement dans un vault Obsidian en tant que daily note ou nouvelle note. Très gros public cible.

### 8.3 🔧 Intégration Notion ❌
API Notion : créer une page, ajouter un bloc… depuis une dictée.

### 8.4 🔧 Intégration Todoist / Things / TickTick ❌
"Ajoute une tâche : appeler le médecin demain" → création directe.

### 8.5 🏗️ URL scheme / deep links ❌
`lexena://record?mode=ptt&paste=false` pour déclencher des actions depuis d'autres outils.

### 8.6 🏗️ Serveur HTTP local ❌
L'app expose une API REST/WebSocket locale (localhost:port). Permet à des plugins d'autres apps (VSCode, navigateurs) de s'intégrer.

### 8.7 🚀 Extensions / plugins communautaires ❌
Système de plugins (sandbox JS ou WASM) pour que la communauté développe des intégrations. Marketplace.

---

## 9. Personnalisation & apparence

### 9.1 ⚡ Dark / light mode toggle ✅
À vérifier si déjà là. Si non, rapide avec Tailwind.

### 9.2 ⚡ Choix des couleurs d'accent
Bleu, vert, violet, orange… Dans les settings.

### 9.3 ⚡ Densité UI (compacte / confort)
Pour les power users qui veulent voir plus de contenu à l'écran.

### 9.4 🔧 Thèmes complets (skin)
Au-delà du dark/light, des thèmes : classique, dracula, nord, solarized…

### 9.5 🔧 Icône système tray personnalisable
Ronde, carrée, animée pendant l'enregistrement…

### 9.6 🏗️ Layout du dashboard personnalisable
Drag & drop des panels, ratio liste/détail, sidebar gauche/droite.

---

## 10. Accessibilité

### 10.1 ⚡ Support du screen reader (ARIA)
Vérifier que les composants Radix sont bien accessibles, ajouter les aria-labels manquants.

### 10.2 ⚡ Taille de police configurable
Particulièrement important pour une app de dictée, souvent utilisée par personnes avec limitations motrices ou visuelles.

### 10.3 🔧 Modes contraste élevé
Pour malvoyants.

### 10.4 🔧 Retour haptique / visuel pour sourds & malentendants
Alternative aux bips sonores pour savoir que l'enregistrement a démarré : flash d'écran, vibration (si hw), indication très visible.

### 10.5 🏗️ Mode "dictée uniquement" pour personnes à mobilité réduite
Interface simplifiée, toutes les actions pilotables à la voix, sans clavier/souris.

### 10.6 🚀 Commande vocale pour contrôler l'app elle-même
"Arrête l'enregistrement", "supprime la dernière note", "change la langue en anglais". L'app se pilote à la voix.

---

## 11. Performance & ressources

### 11.1 ⚡ Monitoring RAM / GPU dans les settings (debug tab)
Savoir combien whisper-rs cache en mémoire, si le GPU est utilisé… Info technique mais très rassurante pour les geeks.

### 11.2 🔧 Mode "économie de batterie"
Sur laptop, décharger le modèle plus agressivement, couper les animations de la mini-window, réduire les polling.

### 11.3 🔧 Preload intelligent du modèle
Anticiper le chargement quand le hotkey est appuyé, pas seulement quand l'enregistrement démarre.

### 11.4 🔧 Warm-up automatique au démarrage
Option "prêt immédiatement" qui charge le modèle au boot, au prix de RAM permanente.

### 11.5 🏗️ Benchmark intégré
Outil qui mesure pour l'utilisateur combien de secondes prend chaque taille de modèle sur sa machine, avec ou sans GPU. Remplace le "devine" de l'onboarding.

### 11.6 🚀 Inférence distribuée locale (entre ses propres machines)
Le laptop dicte, le desktop gaming transcrit (via réseau local). Pour les utilisateurs multi-machines.

---

## 12. Données & historique

### 12.1 ⚡ Export complet des données (backup)
Bouton "tout exporter" : settings + historique + notes + audios. Un zip signé.

### 12.2 ⚡ Import/restore
Charger un backup.

### 12.3 🔧 Rétention fine (pas que "keep last N")
Par exemple "garder les audios 7 jours, les textes pour toujours", ou "supprimer auto après X jours".

### 12.4 🔧 Sync optionnel via dossier cloud (Dropbox/iCloud/OneDrive)
L'utilisateur pointe le dossier data vers un sync cloud, l'app gère sans casser. Pas de cloud propriétaire à développer.

### 12.5 🏗️ Chiffrement at-rest des transcriptions et audios
Aujourd'hui c'est en clair dans AppData. Chiffrer avec une clé dérivée d'un mot de passe utilisateur (optionnel). Prérequis de confiance pour usage pro/médical/légal.

### 12.6 🏗️ Mode "private" : aucune trace disque
Dictée → transcription → paste, zéro disque touché. Pour contextes sensibles.

### 12.7 🚀 Git-like versioning des notes + transcriptions
Commits, branches, diff. Overkill pour 90% des users mais puissant.

---

## 13. Onboarding & découvrabilité

### 13.1 ⚡ Checklist de première utilisation
"✓ Teste ton micro, ✓ Lance ta première dictée, ✓ Configure un raccourci, ✓ Essaie une action IA". Gamifie les premiers pas.

### 13.2 ⚡ Tooltips contextuels premier lancement
Pointer les éléments clés de l'UI à la première connexion.

### 13.3 🔧 Changelog in-app après update
À l'ouverture post-update, afficher un modal "voici les nouveautés".

### 13.4 🔧 Mode démo / tutoriel interactif
Une visite guidée qui simule une vraie dictée avec un sample audio embarqué.

### 13.5 🔧 Détection de sous-utilisation
Si l'utilisateur n'utilise jamais les actions IA après 2 semaines, lui montrer un prompt "hey, savais-tu que…".

### 13.6 🏗️ Tips & tricks rotatifs dans la mini-window
Quand elle n'est pas en enregistrement, afficher occasionnellement un tip.

---

## 14. Mobile & cross-device

### 14.1 🚀 App mobile compagnon (dictée distante)
iOS/Android qui dicte → envoie au desktop via réseau local → paste. Utile pour dicter depuis le canap.

### 14.2 🚀 Mode serveur (desktop) + client web (PWA)
Le desktop transcrit via son GPU, les autres machines de la maison peuvent dicter via navigateur. Super LAN.

### 14.3 🌙 Support hardware dédié
Pédale de dictée USB (courant chez les médecins), boutons macros Stream Deck, Elgato… Mapper sur les hotkeys.

### 14.4 🌙 Support smartwatch (Apple Watch/Wear OS)
Bouton PTT au poignet qui déclenche la dictée sur le desktop.

---

## 15. Privacy & confiance

### 15.1 ⚡ Indicateur clair "provider actif"
Dans la mini-window ou le header : badge "☁ OpenAI" vs "💻 Local" pour savoir si l'audio part sur le net.

### 15.2 ⚡ Mode "strict local"
Setting qui empêche physiquement tout appel réseau pour la transcription. Sécurise les environnements sensibles.

### 15.3 🔧 Log de ce qui est envoyé où
Page qui liste "dernières 20 transcriptions : X locales, Y envoyées à OpenAI". Transparence.

### 15.4 🏗️ Audit mode (journal signé)
Pour usage pro : chaque action est loggée avec hash, pour auditabilité.

### 15.5 🚀 Support de PIA/VPN détection
Si l'utilisateur est sur un VPN "confiance", autoriser le cloud. Sinon, forcer local. Setting automatique selon réseau.

---

## 16. Monétisation & positionnement (complément EPIC-08)

### 16.1 Premium — Cloud sync des settings/notes/historique
Reconnu comme feature premium dans EPIC-08. Complément : versioning cloud.

### 16.2 Premium — Crédits de transcription cloud inclus
Eviter aux utilisateurs de gérer leur clé OpenAI. L'app fait proxy et fournit du volume. Marge sur différentiel coût.

### 16.3 Premium — Modèles cloud premium (GPT-4o, Claude 3.5 Sonnet)
Actions IA plus intelligentes sur les notes, réservé au plan payant.

### 16.4 Premium — Sync multi-device
Vrai sync temps réel, pas juste dossier cloud.

### 16.5 Premium — Partage de notes (liens publics, collab)
Transforme l'app d'outil perso en outil d'équipe.

### 16.6 🚀 Offre "team" / "enterprise"
Multi-utilisateurs, SSO, déploiement centralisé, audit, admin console. Prix 10x le perso.

### 16.7 🚀 Offre "enterprise on-prem"
App + serveur de modèles self-hosted. Pour hôpitaux, cabinets juridiques, admin. Licence annuelle chère.

---

## 17. Qualité de code / stabilité interne

### 17.1 ⚡ CI lint + type-check + cargo check
Si pas déjà en place sur chaque PR.

### 17.2 🔧 Tests E2E avec Tauri-driver / Playwright
Au moins les flux critiques (recording, transcription, hotkey).

### 17.3 🔧 Télémétrie opt-in (crash reports, perf)
Aujourd'hui `@vercel/analytics` est dans package.json. Élargir avec Sentry, avec opt-in explicite.

### 17.4 🔧 Tests unitaires Rust sur audio + transcription
Les fonctions pures (RMS, resampling, clean-up old recordings) sont testables facilement.

### 17.5 🏗️ Refactor de `lib.rs` (devient gros)
Le fichier centralise AppState, commands, tray, hotkeys, windows. Le découper par domaine.

---

## 18. Moonshots 🌙 (idées vraiment audacieuses)

### 18.1 🌙 Voice Tool Studio — création de contenu
Mode "podcast/vidéo" : enregistrement long, diarization, chapitres auto, transcript éditable, export SRT/VTT. Concurrence Descript.

### 18.2 🌙 Mode "réunion live" avec résumé auto post-call
Pendant une visio : capture (EPIC-04), transcript temps réel, à la fin → résumé, actions, décisions. Un peu comme Granola/Otter/Fireflies mais 100% local-first.

### 18.3 🌙 Assistant vocal système (remplace Cortana/Siri sur Windows)
Hotkey → parle → action système (ouvrir app, chercher fichier, envoyer mail, coller…). Utilise enigo et whisper local. Devient un gros produit en soi.

### 18.4 🌙 Intégration dans le workflow de code
Plugin VS Code : "dicter une fonction qui fait X", l'IA génère, tu valides par voix. Pair programming vocal.

### 18.5 🌙 Training data voluntary pool
Les utilisateurs volontaires partagent leurs transcriptions corrigées → entraînement de modèles communautaires → boucle de qualité qui s'améliore pour tous. Opt-in strict et anonymisation.

### 18.6 🌙 Generative audio : clonage de voix pour réponses
Tu dictes un brouillon de mail, l'IA génère la réponse, et un TTS cloné sur ta voix lit à haute voix pour validation. Proche de l'agent vocal complet (6.9).

### 18.7 🌙 Voice Tool OS widget / Windows shell integration
Intégration native au shell Windows (barre de tâches, recherche, explorateur) via l'API ShellExtensions. L'app devient invisible, elle est partout.

### 18.8 🌙 Apprentissage personnel "style"
L'app apprend ton style d'écriture via tes mails envoyés, tes notes. Les actions "améliorer" deviennent "améliorer dans TON style", pas un style générique. Fine-tuning d'un petit LLM local ou RAG sur tes écrits.

---

## 19. Bonus — idées qui traînent

### 19.1 ⚡ Mode "minuteur Pomodoro vocal"
"Démarre pomodoro 25min" → timer flottant, fin = son + auto-note "qu'as-tu fait ?".

### 19.2 ⚡ "Jour d'absence" : message vocal de réponse auto
Tu dictes un message, il devient le répondeur de ton mail pendant X jours. Gimmick mais feature virale.

### 19.3 🔧 "Dictate anywhere" → inclut les champs où le paste ne marche pas
Certaines apps bloquent Ctrl+V. Simuler une frappe caractère par caractère en fallback (enigo sait faire).

### 19.4 🔧 Comparaison A/B providers
L'utilisateur dicte une fois, l'app transcrit avec 2 providers en parallèle, affiche les deux résultats côte à côte. Utile pour choisir.

### 19.5 🚀 "Second cerveau vocal"
Tout ce que l'utilisateur dicte est indexé, vectorisé, et devient interrogeable. Tu te demandes "j'avais parlé de quoi la semaine dernière à propos du projet X ?" → réponse immédiate avec audio.

### 19.6 🚀 Intégration LSP pour le code
Le plugin VS Code comprend le contexte du fichier et dicte du code "raisonnable" (bon naming, respect du style du fichier).

---

## Notes pour le triage

**Thèmes transversaux** qui apparaissent dans plusieurs idées et pourraient devenir des piliers produit :
- **Streaming temps réel** (2.7, 3.7, 18.2) → changement de paradigme UX
- **IA locale + cloud hybride** (2.4, 2.10, 6.6, 18.8) → différenciation vs Wispr Flow / Dragon
- **Intégrations tierces** (8.x) → écosystème
- **Mode pro/enterprise** (15.4, 16.6, 16.7) → monétisation B2B
- **Accessibilité** (section 10) → marché sous-servi, très gros upside social
- **Agent vocal complet** (6.9, 18.3) → la grosse vision long terme
