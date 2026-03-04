# Voice Tool - Stories d'amélioration

## 🐛 Bugs critiques

### 1. ✅ Détection audio trop sensible (RÉSOLU)
**Problème:** L'application détecte très souvent que le son est trop bas et refuse de transcrire, même si le son est OK à la lecture.

**Cause identifiée:**
- Seuil par défaut: 0.01 (1%) trop strict
- RMS mesuré: 0.0095 (0.95%) → considéré comme silencieux
- Le seuil était à la limite basse du range normal de la parole (0.01-0.05)

**Solution appliquée:**
- ✅ Seuil par défaut réduit: `0.01` → `0.005` (1% → 0.5%)
- ✅ Curseur UI ajusté: Min `0` → `0.001` (0.1%), Max `0.1` → `0.05` (5%)
- ✅ Modifié dans 3 fichiers:
  - `src/lib/settings.ts:60` - Valeur par défaut
  - `src-tauri/src/lib.rs:92` - Fallback commande
  - `src-tauri/src/lib.rs:494` - Seuil shortcuts
  - `src/components/setting-tabs.tsx:610-611` - Bornes curseur

**Statut:** TESTÉ ET VALIDÉ ✅

---

### 2. ✅ Mini window reste bloquée après erreur (RÉSOLU)
**Problème:** La mini fenêtre de visualisation reste affichée (grisée/inactive) après certaines erreurs et ne se ferme pas automatiquement.

**Cause identifiée:**
Le flux normal émet des événements de transcription (`transcription-success` ou `transcription-error`) qui ferment la mini window, mais **3 cas d'erreur ne les émettaient pas** :

1. **Silence détecté via toggle recording** (`Dashboard.tsx:386-391`)
2. **Silence détecté via shortcuts** (`Dashboard.tsx:244-251`)
3. **Erreur générale d'enregistrement** (`Dashboard.tsx:419-423`)

Dans ces cas, la mini window restait en état "idle" sans jamais se fermer.

**Problèmes de design découverts :**
- Message d'erreur trop long ("Aucun son détecté dans l'enregistrement") nécessitant du scroll
- Layout vertical (titre + message) sur 2 lignes, incohérent avec success/processing
- Conteneur principal utilisant `min-h-screen` créant du scroll
- Padding excessif (`px-3 py-2`) ajoutant de la hauteur

**Solution appliquée:**
- ✅ Ajout de `emit("transcription-error")` dans les 3 cas d'erreur
- ✅ Callback `async` ajouté pour supporter `await emit()`
- ✅ Message raccourci: "Son trop faible"
- ✅ Layout unifié: horizontal avec icône (✕ rouge) comme success/processing
- ✅ Conteneur: `min-h-screen` → `h-full` + `overflow-hidden`
- ✅ Padding réduit pour contenu compact

**Fichiers modifiés:**
- `src/components/Dashboard.tsx` - 3 corrections d'émission d'événements + callback async
- `src/mini-window.tsx` - Design error state + fix conteneur + padding

**Statut:** TESTÉ ET VALIDÉ ✅

---

## 🔧 Améliorations fonctionnelles

### 3. Mode local offline ne fonctionne pas
**Problème:** Le mode de transcription local/offline génère une erreur affichée dans une alerte.

**Statut:** Whisper.cpp semble intégré (voir commit `abd014f feat: add whisper.cpp`) mais non fonctionnel.

**Actions:**
- Récupérer le message d'erreur exact
- Vérifier l'intégration de Whisper.cpp dans le code Rust
- Vérifier que les modèles sont téléchargés et accessibles
- Tester et corriger l'implémentation

---

### 4. OpenAI Whisper est lent
**Problème:** Le mode OpenAI Whisper fonctionne correctement mais avec une latence perceptible.

**Note:** C'est normal pour une API batch (upload + traitement). Moins prioritaire.

**Actions possibles:**
- Optimiser la taille des fichiers WAV envoyés
- Ajouter un indicateur de progression plus clair
- (Ou accepter la latence comme normale pour ce mode)

---

### 5. Deepgram: qualité de reconnaissance médiocre
**Problème:** Le mode streaming Deepgram fonctionne bien techniquement mais la qualité de reconnaissance n'est pas satisfaisante.

**Actions:**
- Vérifier les modèles Deepgram disponibles (actuellement utilisé ?)
- Tester avec d'autres modèles (nova-2, enhanced, etc.)
- Vérifier les paramètres de langue (`fr` vs `fr-FR`)
- Tester avec différentes configurations (punctuation, diarization, etc.)
- Comparer avec la documentation Deepgram 2026

---

## 📋 Ordre de traitement suggéré

1. ✅ **Bug #1** (Détection audio) - ~~URGENT~~ RÉSOLU
2. ✅ **Bug #2** (Mini window) - ~~URGENT~~ RÉSOLU
3. **Story #3** (Mode local) - Fonctionnalité manquante importante - **PROCHAINE ÉTAPE**
4. **Story #5** (Deepgram qualité) - Amélioration qualité
5. **Story #4** (Whisper lent) - Nice to have, comportement normal

---

## 🔍 Informations de debug

### Configuration audio observée
- Device: Logitech G733 Gaming Headset
- Format: F32
- Sample rate: 48000 Hz
- Channels: 1 (mono)

### Problème de seuil RMS
- Seuil actuel: 0.0100
- RMS mesuré: 0.0095
- Différence: 0.0005 (5% sous le seuil)
- Le seuil est probablement trop strict


## 🚀 Nouvelles Idées / Backlog

### 6. Transcription de fichiers audio/vidéo
**Idée:** Permettre d'importer et de transcrire des fichiers audio ou vidéo existants.
**Actions:**
- Ajouter une interface pour l'import de fichiers.
- Gérer l'extraction et l'envoi de l'audio au moteur de transcription.

### 7. Annulation de l'enregistrement via Échap
**Idée:** Offrir un moyen rapide d'annuler une prise ratée.
**Actions:**
- Écouter la touche `Échap` pendant un enregistrement.
- Annuler l'enregistrement en cours sans lancer le processus de transcription.

### 8. Amélioration de l'Onboarding et Mode Local
**Idée:** Simplifier le premier lancement et guider l'utilisateur.
**Actions:**
- Définir le mode de transcription "Local" comme l'option par défaut.
- Au démarrage, vérifier si un service de transcription est utilisable (modèle local prêt ou clé API renseignée).
- Si rien n'est configuré, alerter l'utilisateur et l'inviter à configurer l'application via les paramètres.

// a reecrire par LLM
