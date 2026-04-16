# Design : Support du modèle quantifié `large-v3-turbo-q5_0` et révision des seuils de reco

**Date :** 2026-04-16
**Statut :** Approuvé

---

## Contexte

L'onboarding (spec `2026-04-16-onboarding-ai-model-design.md`) recommande aujourd'hui un modèle en fonction de la RAM totale et de la présence d'un GPU discret. Deux problèmes observés :

1. **Les seuils RAM sont calibrés sur la taille de téléchargement, pas sur l'empreinte réelle en mémoire.** Exemple mesuré : `small` (244 Mo download) utilise ~900 Mo de RAM une fois chargé (~3.5× le fichier). whisper-rs sur CPU alloue en plus les buffers d'activation encoder/decoder et le KV cache. Les seuils actuels sont donc optimistes dans le mauvais sens.
2. **Le saut de `small` à `large-v3-turbo` fp16 est brutal.** Entre 8 et 24 GB de RAM sans GPU, on n'a pas de bon compromis : `small` est moyen en multilingue, `large-v3-turbo` fp16 prend ~3-4 GB de RAM plus les pics d'activation.

whisper-rs / whisper.cpp supportent nativement les modèles quantifiés (format `q5_0`, `q5_1`, `q8_0`), diffusés sur le même repo HuggingFace (`ggerganov/whisper.cpp`) que les fp16. Le chargement est transparent : même code, même API, seul le nom de fichier change.

---

## Objectif

Couvrir proprement le cas "RAM moyenne sans GPU" sans alourdir le catalogue de modèles.

---

## Périmètre

**Ajouté :** un seul nouveau modèle, `large-v3-turbo-q5_0`.

- Download : ~550 Mo
- RAM estimée : ~1.5-2 Go
- Qualité : proche du fp16 (quantification 5 bits, perte négligeable en transcription)
- URL : `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin` — résolu automatiquement par le template existant `format!("ggml-{}.bin", model_type)` dans `src-tauri/src/transcription_local.rs:32`.

**Pas ajouté :** variantes `.en` (anglais-only), autres quantifs (`q5_1`, `q8_0`), distil-whisper, `tdrz`. Hors scope pour limiter le catalogue.

---

## Logique de reco révisée

Dans `src/components/OnboardingWizard.tsx`, la fonction `recommendModel(info: SystemInfo)` devient :

```
SI info.has_discrete_gpu                      → "large-v3-turbo"        (fp16)
SI info.total_ram_gb < 6                      → "api"
SI info.total_ram_gb < 12                     → "large-v3-turbo-q5_0"   (NOUVEAU)
SINON                                          → "large-v3-turbo"        (fp16)
```

**Changements par rapport à la logique actuelle :**
- Le seuil RAM basse pour fallback API passe de 8 GB à **6 GB** (on a désormais un modèle local raisonnable pour 6-12 GB).
- Le palier `small` disparaît de la recommandation auto (il reste disponible au choix manuel).
- Le nouveau palier 6-12 GB reçoit `large-v3-turbo-q5_0`.
- Au-dessus de 12 GB sans GPU : `large-v3-turbo` fp16 (inchangé par rapport à la logique actuelle qui faisait déjà ça à 16 GB — on baisse le seuil parce que fp16 tient).

Les utilisateurs existants ne sont pas migrés : la reco ne s'applique qu'au premier onboarding.

---

## Touchpoints code

Aucun changement d'architecture. Seulement des chaînes à ajouter/modifier :

1. **`src/lib/settings.ts`** — étendre le type union `local_model_size` pour inclure `"large-v3-turbo-q5_0"`.
2. **`src/components/OnboardingWizard.tsx`** — ajouter une entrée à `MODEL_OPTIONS` (label + taille affichée) et mettre à jour `recommendModel()`.
3. **`src/components/settings/sections/TranscriptionSection.tsx`** — ajouter l'option au `<Select>` des modèles.

**Pas besoin de modifier :**
- `src-tauri/src/transcription_local.rs` — le template d'URL et whisper-rs chargent n'importe quel `ggml-*.bin` sans distinction fp16/quantifié.
- `src-tauri/src/commands/transcription.rs` — reçoit le nom du modèle en `String`, aucune validation d'énum.
- Les hooks `useModelDownload.ts`, `useRecordingWorkflow.ts` — pass-through de la chaîne.

---

## Format d'affichage dans le sélecteur

L'entrée `MODEL_OPTIONS` pour le nouveau modèle :

```ts
{ value: "large-v3-turbo-q5_0", label: "Large v3 Turbo (quantifié)", size: "550 Mo" }
```

Label retenu : "Large v3 Turbo (quantifié)". On ne détaille pas `q5_0` dans le label (jargon). La refonte plus large des labels est hors scope (voir "Suite").

---

## Hors scope

- **Détection VRAM** pour affiner la reco GPU. Actuellement la présence d'un GPU discret suffit à recommander `large-v3-turbo` fp16 ; un GPU à 2 GB VRAM ne tiendrait pas. À traiter dans un spec séparé.
- **Affichage de l'empreinte RAM estimée** dans l'UI (en plus de la taille de téléchargement). Utile pour la compréhension utilisateur mais dépend de la refonte des labels.
- **Refonte des labels du sélecteur de modèles** — voir "Suite".
- **Migration des users existants** — la reco révisée ne s'applique qu'au premier onboarding, pas de changement automatique sur les installations existantes.

---

## Suite

Un brainstorming dédié sera lancé pour la **refonte des labels du sélecteur de modèles** : choix d'info à afficher (RAM estimée, vitesse relative, cas d'usage, badge "adapté à ta machine"), présentation UI (description, tooltip, badges), et cohérence entre onboarding et settings. Hors scope du présent spec.
