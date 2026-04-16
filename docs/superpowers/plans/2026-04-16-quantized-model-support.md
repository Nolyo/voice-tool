# Quantized Model Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter le modèle `large-v3-turbo-q5_0` et réviser la reco d'onboarding pour couvrir proprement le palier "6-12 GB RAM sans GPU" (voir spec `docs/superpowers/specs/2026-04-16-quantized-model-support-design.md`).

**Architecture:** Aucun changement backend — whisper-rs et l'URL de download sont déjà agnostiques au format (fp16/quantifié). Tous les changements sont frontend : extension du type union, i18n, sélecteurs UI, et logique de recommandation.

**Tech Stack:** TypeScript, React 19, i18next, Tauri. Le code Rust (`src-tauri`) n'est pas modifié.

---

## Contexte pour l'engineer

Ce repo est une app **Tauri + React + TypeScript**. Aucun framework de test n'est configuré — la vérification se fait via `pnpm build` (qui exécute `tsc -b && vite build`) et tests manuels dans l'app.

**IMPORTANT** : `pnpm tauri dev` est **interdit** à l'agent (règle de `CLAUDE.md`). Pour tester visuellement, demande à l'utilisateur de lancer `pnpm tauri dev` et de valider le rendu.

Les modèles Whisper sont téléchargés depuis `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-{model}.bin`. Le template Rust (`src-tauri/src/transcription_local.rs:32`) construit ce nom automatiquement, donc ajouter `large-v3-turbo-q5_0` côté frontend suffit — le fichier `ggml-large-v3-turbo-q5_0.bin` existe bien dans le repo HuggingFace (~547 Mo).

---

## File Structure

**Fichiers modifiés (5)** :
- `src/lib/settings.ts` — ajouter la valeur au type union `local_model_size`
- `src/locales/fr.json` — clé i18n `settings.transcription.modelLargeV3TurboQ5`
- `src/locales/en.json` — clé i18n `settings.transcription.modelLargeV3TurboQ5`
- `src/components/settings/sections/TranscriptionSection.tsx` — `<SelectItem>` + cast union dans `onValueChange`
- `src/components/OnboardingWizard.tsx` — entrée `MODEL_OPTIONS` + logique `recommendModel`

**Fichiers créés** : aucun.
**Rust** : aucune modification (voir design spec section "Touchpoints code").

---

### Task 1: Étendre le type union `local_model_size`

**Files:**
- Modify: `src/lib/settings.ts:16`

- [ ] **Step 1: Modifier le type union**

Dans `src/lib/settings.ts`, remplacer la ligne 16 :

```ts
    local_model_size: "tiny" | "base" | "small" | "medium" | "large-v1" | "large-v2" | "large-v3" | "large-v3-turbo";
```

par :

```ts
    local_model_size: "tiny" | "base" | "small" | "medium" | "large-v1" | "large-v2" | "large-v3" | "large-v3-turbo" | "large-v3-turbo-q5_0";
```

- [ ] **Step 2: Vérifier que TypeScript repère les call-sites à mettre à jour**

Run: `pnpm build`

Expected: échec de compilation avec erreurs TypeScript dans `src/components/settings/sections/TranscriptionSection.tsx` (le cast `as "tiny" | "base" | ... | "large-v3-turbo"` ne couvre pas la nouvelle valeur).

C'est **attendu** — on corrige ce cast dans la Task 3. On enchaîne avec les i18n d'abord pour garder les commits cohérents.

- [ ] **Step 3: Commit**

```bash
git add src/lib/settings.ts
git commit -m "feat: add large-v3-turbo-q5_0 to local_model_size union"
```

---

### Task 2: Ajouter les clés i18n

**Files:**
- Modify: `src/locales/fr.json:116-123`
- Modify: `src/locales/en.json:116-123`

- [ ] **Step 1: Ajouter la clé FR**

Dans `src/locales/fr.json`, après la ligne 123 (`"modelLargeV3Turbo": ...`), ajouter une ligne :

```json
      "modelLargeV3TurboQ5": "Large v3 Turbo Q5 (547 Mo) - Compact + Rapide",
```

Attention à la virgule en fin de la ligne 123 (elle devient obligatoire) et à l'absence de virgule après la nouvelle ligne si c'est la dernière du bloc. Vérifier la structure JSON localement.

- [ ] **Step 2: Ajouter la clé EN**

Dans `src/locales/en.json`, après la ligne 123 (`"modelLargeV3Turbo": ...`), ajouter :

```json
      "modelLargeV3TurboQ5": "Large v3 Turbo Q5 (547 MB) - Compact + Fast",
```

Même attention aux virgules JSON.

- [ ] **Step 3: Vérifier le JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/locales/fr.json','utf8')); JSON.parse(require('fs').readFileSync('src/locales/en.json','utf8')); console.log('OK')"`

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add src/locales/fr.json src/locales/en.json
git commit -m "feat: add i18n keys for large-v3-turbo-q5_0 model"
```

---

### Task 3: Ajouter l'option au sélecteur des Settings

**Files:**
- Modify: `src/components/settings/sections/TranscriptionSection.tsx:119-129` (cast onValueChange)
- Modify: `src/components/settings/sections/TranscriptionSection.tsx:144` (liste `<SelectItem>`)

- [ ] **Step 1: Étendre le cast dans onValueChange**

Remplacer les lignes 117-130 :

```tsx
                <Select
                  value={settings.local_model_size}
                  onValueChange={(value) =>
                    updateSetting(
                      "local_model_size",
                      value as
                        | "tiny"
                        | "base"
                        | "small"
                        | "medium"
                        | "large-v1"
                        | "large-v2"
                        | "large-v3"
                        | "large-v3-turbo",
                    )
                  }
                  disabled={isDownloading}
                >
```

par (ajout de `| "large-v3-turbo-q5_0"`) :

```tsx
                <Select
                  value={settings.local_model_size}
                  onValueChange={(value) =>
                    updateSetting(
                      "local_model_size",
                      value as
                        | "tiny"
                        | "base"
                        | "small"
                        | "medium"
                        | "large-v1"
                        | "large-v2"
                        | "large-v3"
                        | "large-v3-turbo"
                        | "large-v3-turbo-q5_0",
                    )
                  }
                  disabled={isDownloading}
                >
```

- [ ] **Step 2: Ajouter le `<SelectItem>`**

Remplacer la ligne 144 :

```tsx
                    <SelectItem value="large-v3-turbo">{t('settings.transcription.modelLargeV3Turbo')} ⭐</SelectItem>
```

par deux lignes :

```tsx
                    <SelectItem value="large-v3-turbo">{t('settings.transcription.modelLargeV3Turbo')} ⭐</SelectItem>
                    <SelectItem value="large-v3-turbo-q5_0">{t('settings.transcription.modelLargeV3TurboQ5')}</SelectItem>
```

- [ ] **Step 3: Vérifier le build TypeScript**

Run: `pnpm build`

Expected: PASS (build complet sans erreur TS).

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/sections/TranscriptionSection.tsx
git commit -m "feat: add large-v3-turbo-q5_0 option to settings model selector"
```

---

### Task 4: Onboarding — ajouter l'entrée `MODEL_OPTIONS` et réviser `recommendModel`

**Files:**
- Modify: `src/components/OnboardingWizard.tsx:38-47` (MODEL_OPTIONS)
- Modify: `src/components/OnboardingWizard.tsx:49-54` (recommendModel)

- [ ] **Step 1: Étendre `MODEL_OPTIONS`**

Remplacer les lignes 38-47 :

```tsx
const MODEL_OPTIONS: { value: ModelSize; label: string; size: string }[] = [
  { value: "tiny", label: "Tiny", size: "39 Mo" },
  { value: "base", label: "Base", size: "74 Mo" },
  { value: "small", label: "Small", size: "244 Mo" },
  { value: "medium", label: "Medium", size: "1,5 Go" },
  { value: "large-v1", label: "Large v1", size: "2,9 Go" },
  { value: "large-v2", label: "Large v2", size: "2,9 Go" },
  { value: "large-v3", label: "Large v3", size: "2,9 Go" },
  { value: "large-v3-turbo", label: "Large v3 Turbo", size: "1,6 Go" },
];
```

par :

```tsx
const MODEL_OPTIONS: { value: ModelSize; label: string; size: string }[] = [
  { value: "tiny", label: "Tiny", size: "39 Mo" },
  { value: "base", label: "Base", size: "74 Mo" },
  { value: "small", label: "Small", size: "244 Mo" },
  { value: "medium", label: "Medium", size: "1,5 Go" },
  { value: "large-v1", label: "Large v1", size: "2,9 Go" },
  { value: "large-v2", label: "Large v2", size: "2,9 Go" },
  { value: "large-v3", label: "Large v3", size: "2,9 Go" },
  { value: "large-v3-turbo-q5_0", label: "Large v3 Turbo (quantifié)", size: "547 Mo" },
  { value: "large-v3-turbo", label: "Large v3 Turbo", size: "1,6 Go" },
];
```

Note : la nouvelle entrée est placée **avant** `large-v3-turbo` (fp16) pour présenter l'option compacte en premier dans le dropdown.

- [ ] **Step 2: Réécrire `recommendModel`**

Remplacer les lignes 49-54 :

```tsx
function recommendModel(info: SystemInfo): ModelSize | "api" {
  if (info.has_discrete_gpu) return "large-v3-turbo";
  if (info.total_ram_gb < 8) return "api";
  if (info.total_ram_gb < 16) return "small";
  return "large-v3-turbo";
}
```

par :

```tsx
function recommendModel(info: SystemInfo): ModelSize | "api" {
  if (info.has_discrete_gpu) return "large-v3-turbo";
  if (info.total_ram_gb < 6) return "api";
  if (info.total_ram_gb < 12) return "large-v3-turbo-q5_0";
  return "large-v3-turbo";
}
```

- [ ] **Step 3: Vérifier le build TypeScript**

Run: `pnpm build`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/OnboardingWizard.tsx
git commit -m "feat: add quantized model option and revise onboarding reco thresholds"
```

---

### Task 5: Validation manuelle

**Files:** aucun changement — validation uniquement.

- [ ] **Step 1: Demander à l'utilisateur de lancer l'app**

Demander : *"Peux-tu lancer `pnpm tauri dev` et vérifier les points ci-dessous ?"*

- [ ] **Step 2: Checklist de validation utilisateur**

L'utilisateur doit vérifier :

1. **Settings > Transcription > Modèle Whisper** :
   - La liste déroulante contient bien une nouvelle entrée "Large v3 Turbo Q5 (547 Mo) - Compact + Rapide"
   - Sélectionner cette entrée persiste le choix (re-ouvrir settings → toujours sélectionné)
   - Cliquer "Télécharger" lance bien le download depuis HuggingFace (URL `ggml-large-v3-turbo-q5_0.bin`)
   - Le modèle téléchargé fonctionne pour une transcription réelle

2. **Onboarding wizard** (pour tester, réinitialiser les settings ou créer un user neuf) :
   - Sur machine **sans GPU avec 6-12 GB RAM** : la reco proposée est **"Large v3 Turbo (quantifié) (547 Mo)"**
   - Sur machine **sans GPU avec ≥12 GB RAM** : la reco est **"Large v3 Turbo (1,6 Go)"** (fp16)
   - Sur machine **avec GPU discret** : la reco reste **"Large v3 Turbo"** (fp16, inchangée)
   - Sur machine **sans GPU avec <6 GB RAM** : la reco est **"API OpenAI"**
   - Dans le dropdown manuel, l'ordre est : tiny → base → small → medium → large-v1 → large-v2 → large-v3 → **large-v3-turbo-q5_0** → large-v3-turbo

- [ ] **Step 3: Retour utilisateur**

Si un point échoue, identifier le fichier concerné (voir mapping dans le design spec) et corriger. Sinon, la feature est terminée.

---

## Self-review effectuée

- **Couverture du spec** : ✓ les 3 touchpoints code (settings.ts, OnboardingWizard.tsx, TranscriptionSection.tsx) sont couverts par les Tasks 1, 3, 4. Les i18n (Task 2) couvrent l'intégration visible dans Settings. La logique de reco révisée (Task 4) applique strictement les seuils 6/12 GB du spec.
- **Placeholders** : aucun `TBD`, aucun placeholder, tout le code est littéral.
- **Cohérence de types** : la valeur `"large-v3-turbo-q5_0"` est identique partout (type union, cast, `value` dans `MODEL_OPTIONS`, `value` dans `<SelectItem>`, retour de `recommendModel`).
- **Cohérence des tailles affichées** : `547 Mo` dans les i18n et dans `MODEL_OPTIONS` (alignés).
