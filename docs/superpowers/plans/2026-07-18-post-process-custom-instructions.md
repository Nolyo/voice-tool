# Post-Process Custom Instructions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le champ Whisper « Contexte de vocabulaire » (`whisper_initial_prompt`) par un champ « Instructions personnalisées » injecté dans l'appel de post-traitement cloud.

**Architecture:** Nouveau setting `post_process_custom_instructions` (non syncé), textarea dans `PostProcessSection`, passthrough client → `cloud/api.ts` → commande Rust `post_process_cloud` → body JSON `custom_instructions` vers l'API cloud. Suppression complète du plumbing `initial_prompt` Whisper (le dictionnaire seul reste passé à la transcription locale).

**Tech Stack:** React 19 + TypeScript + Vitest (frontend), Rust/Tauri (backend), API cloud Lexena (repo séparé — hors scope, voir spec §5).

**Spec:** `docs/superpowers/specs/2026-07-18-post-process-custom-instructions-design.md`

## Global Constraints

- Branche de travail : `feat/post-process-custom-instructions` (jamais de commit sur main).
- Commits conventionnels, en anglais, courts (`feat:`, `refactor:`, `test:`…).
- Aucune string UI en dur — tout passe par react-i18next (fr.json ET en.json).
- Pas de `cargo update`, pas de modification de features Cargo existantes.
- Cap client des instructions : **1 000 caractères** (slice à la saisie + trim à l'envoi).
- Le champ n'est PAS ajouté à la sync cloud (`src/lib/sync/mapping.ts` ne doit pas être touché).
- `cargo check` sous Git Bash nécessite :
  ```bash
  export PATH="$PATH:/c/Program Files/CMake/bin"
  cd src-tauri && LIBCLANG_PATH="C:/Program Files/LLVM/bin" cargo check
  ```
  (fallback si erreur cmake/Vulkan MAX_PATH : ajouter `--no-default-features`)
- Vérifier le staging avant chaque commit (`git status` — ne jamais embarquer `.codex/` ni `AGENTS.md`).

---

### Task 1: Plumbing TS — `customInstructions` dans l'API cloud

**Files:**
- Modify: `src/lib/cloud/api.ts:19-26` (interface) et `:78-90` (fonction)
- Test: `src/lib/cloud/api.test.ts`

**Interfaces:**
- Consumes: rien (point d'entrée du plan).
- Produces: `PostProcessArgs.customInstructions?: string` ; l'invoke `post_process_cloud` reçoit `customInstructions: string | null`. Consommé par Task 5.

- [ ] **Step 1: Écrire les tests qui échouent**

Dans `src/lib/cloud/api.test.ts`, ajouter à la fin du bloc `describe("postProcessCloud", ...)` :

```ts
  it("forwards customInstructions when provided", async () => {
    (invoke as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      text: "out",
      tokens_in: 10,
      tokens_out: 5,
      request_id: "r3",
      source: "trial",
    });
    await postProcessCloud({
      task: "auto",
      text: "in",
      customInstructions: "Remplace volt par Vault",
      jwt: "jwt",
    });
    expect(invoke).toHaveBeenCalledWith(
      "post_process_cloud",
      expect.objectContaining({
        customInstructions: "Remplace volt par Vault",
      }),
    );
  });

  it("sends null customInstructions when absent", async () => {
    (invoke as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      text: "out",
      tokens_in: 10,
      tokens_out: 5,
      request_id: "r4",
      source: "trial",
    });
    await postProcessCloud({ task: "auto", text: "in", jwt: "jwt" });
    expect(invoke).toHaveBeenCalledWith(
      "post_process_cloud",
      expect.objectContaining({ customInstructions: null }),
    );
  });
```

- [ ] **Step 2: Vérifier qu'ils échouent**

Run: `pnpm exec vitest run src/lib/cloud/api.test.ts`
Expected: FAIL — le premier test échoue en compilation TS (`customInstructions` n'existe pas sur `PostProcessArgs`) ou à l'assertion.

- [ ] **Step 3: Implémenter**

Dans `src/lib/cloud/api.ts`, modifier l'interface (ligne 19) :

```ts
export interface PostProcessArgs {
  task: PostProcessTask;
  text: string;
  language?: string;
  modelTier?: ModelTier;
  /** Consignes utilisateur injectées côté serveur dans le message user (cap 1000 chars). */
  customInstructions?: string;
  jwt: string;
  idempotencyKey?: string;
}
```

Et le payload de `postProcessCloud` (ligne 81) :

```ts
    invokeWithErrorMapping<PostProcessResult>("post_process_cloud", {
      task: args.task,
      text: args.text,
      language: args.language ?? null,
      modelTier: args.modelTier ?? null,
      customInstructions: args.customInstructions ?? null,
      jwt: args.jwt,
      idempotencyKey,
    }),
```

- [ ] **Step 4: Vérifier que les tests passent**

Run: `pnpm exec vitest run src/lib/cloud/api.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/cloud/api.ts src/lib/cloud/api.test.ts
git commit -m "feat: add customInstructions passthrough to post-process cloud API"
```

---

### Task 2: Plumbing Rust — `custom_instructions` dans la commande cloud

**Files:**
- Modify: `src-tauri/src/cloud.rs:211-238`

**Interfaces:**
- Consumes: l'invoke Tauri envoie `customInstructions` (camelCase JS → snake_case Rust automatique).
- Produces: body JSON `"custom_instructions": Option<String>` vers `POST {api_base}/post-process`. Le serveur (repo API, hors scope) l'accepte ou l'ignore — champ inconnu toléré, le client peut shipper en premier (spec §5).

- [ ] **Step 1: Modifier la signature et le body**

Dans `src-tauri/src/cloud.rs`, remplacer la commande `post_process_cloud` :

```rust
#[tauri::command]
pub async fn post_process_cloud(
    task: String,
    text: String,
    language: Option<String>,
    model_tier: Option<String>,
    custom_instructions: Option<String>,
    jwt: String,
    idempotency_key: Option<String>,
) -> Result<PostProcessResult, CloudError> {
    if jwt.is_empty() {
        return Err(CloudError::MissingAuth);
    }
    let body = serde_json::json!({
        "task": task,
        "text": text,
        "language": language,
        "model_tier": model_tier,
        "custom_instructions": custom_instructions,
    });
    let mut req = cloud_client()
        .post(format!("{}/post-process", api_base()))
        .bearer_auth(&jwt)
        .json(&body);
    if let Some(key) = idempotency_key {
        req = req.header("Idempotency-Key", key);
    }
    let res = req.send().await?;
    handle_response(res).await
}
```

- [ ] **Step 2: Vérifier la compilation**

Run (Git Bash) :
```bash
export PATH="$PATH:/c/Program Files/CMake/bin"
cd src-tauri && LIBCLANG_PATH="C:/Program Files/LLVM/bin" cargo check
```
Expected: `Finished` sans erreur ni warning nouveau.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/cloud.rs
git commit -m "feat: accept custom_instructions in post_process_cloud command"
```

---

### Task 3: Setting `post_process_custom_instructions`

**Files:**
- Modify: `src/lib/settings.ts:79-80` (type) et `:177-178` (défaut)

**Interfaces:**
- Consumes: rien.
- Produces: `settings.post_process_custom_instructions: string` (défaut `""`). Consommé par Tasks 4 et 5. NE PAS retirer `whisper_initial_prompt` ici (encore lu par VocabularySection et useRecordingWorkflow — retiré en Task 6).

- [ ] **Step 1: Ajouter la clé au type**

Dans le bloc `// Post-process (AI reformatting after transcription, cloud-only)` (ligne 79) :

```ts
    // Post-process (AI reformatting after transcription, cloud-only)
    post_process_enabled: boolean;
    /** Consignes libres injectées dans chaque post-traitement (cap 1000 chars, non syncé). */
    post_process_custom_instructions: string;
```

- [ ] **Step 2: Ajouter le défaut**

Dans `DEFAULT_SETTINGS` (ligne 177) :

```ts
    // Post-process
    post_process_enabled: false,
    post_process_custom_instructions: "",
```

- [ ] **Step 3: Vérifier la compilation TS**

Run: `pnpm build`
Expected: succès (tsc + vite).

- [ ] **Step 4: Commit**

```bash
git add src/lib/settings.ts
git commit -m "feat: add post_process_custom_instructions setting"
```

---

### Task 4: UI — textarea dans PostProcessSection + i18n

**Files:**
- Modify: `src/components/settings/sections/PostProcessSection.tsx`
- Modify: `src/locales/fr.json` (bloc `settings.postProcess`, ligne ~529)
- Modify: `src/locales/en.json` (bloc `settings.postProcess`, ligne ~529)

**Interfaces:**
- Consumes: `settings.post_process_custom_instructions` (Task 3).
- Produces: saisie utilisateur cappée à 1 000 chars via `updateSetting`. Visible uniquement si `post_process_enabled && isCloudEligible` (rendu dans le fragment conditionnel existant).

- [ ] **Step 1: Ajouter les clés i18n**

Dans `src/locales/fr.json`, à la fin du bloc `"settings" > "postProcess"` (après `"cloudUpsellCta"`) :

```json
      "customInstructions": "Instructions personnalisées",
      "customInstructionsDesc": "Consignes appliquées par l'IA à chaque post-traitement : corrections de vocabulaire, contexte métier, style.",
      "customInstructionsPlaceholder": "Remplace « volt » par « Vault ». Je suis développeur, mes phrases sont orientées dev (React, TypeScript, Rust).",
      "customInstructionsCount": "{{count}} / 1000 caractères"
```

Dans `src/locales/en.json`, même emplacement :

```json
      "customInstructions": "Custom instructions",
      "customInstructionsDesc": "Guidelines the AI applies on every post-process run: vocabulary fixes, domain context, style.",
      "customInstructionsPlaceholder": "Replace \"volt\" with \"Vault\". I'm a developer, my sentences are dev-oriented (React, TypeScript, Rust).",
      "customInstructionsCount": "{{count}} / 1000 characters"
```

- [ ] **Step 2: Ajouter le Row dans PostProcessSection**

Dans `src/components/settings/sections/PostProcessSection.tsx`, à l'intérieur du fragment `{isCloudEligible && settings.post_process_enabled && (<> ... </>)}`, après le Callout « Mode automatique » :

```tsx
            <Row
              label={t("settings.postProcess.customInstructions")}
              hint={t("settings.postProcess.customInstructionsDesc")}
              align="start"
            >
              <div
                className="rounded-lg overflow-hidden"
                style={{
                  border: "1px solid var(--vt-border)",
                  background: "var(--vt-surface)",
                }}
              >
                <textarea
                  value={settings.post_process_custom_instructions}
                  onChange={(e) =>
                    updateSetting(
                      "post_process_custom_instructions",
                      e.target.value.slice(0, 1000),
                    )
                  }
                  placeholder={t("settings.postProcess.customInstructionsPlaceholder")}
                  className="w-full p-3 bg-transparent focus:outline-none text-[13px] resize-none"
                  rows={4}
                  style={{ color: "var(--vt-fg)" }}
                />
                <div
                  className="flex items-center justify-end px-3 py-1.5 border-t"
                  style={{ borderColor: "var(--vt-border)" }}
                >
                  <span
                    className="vt-mono text-[11px]"
                    style={{ color: "var(--vt-fg-3)" }}
                  >
                    {t("settings.postProcess.customInstructionsCount", {
                      count: settings.post_process_custom_instructions.length,
                    })}
                  </span>
                </div>
              </div>
            </Row>
```

Le composant importe déjà `Row` et utilise déjà `updateSetting` — aucun import à ajouter.

- [ ] **Step 3: Vérifier la compilation TS**

Run: `pnpm build`
Expected: succès.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/sections/PostProcessSection.tsx src/locales/fr.json src/locales/en.json
git commit -m "feat: add custom instructions textarea to post-process settings"
```

---

### Task 5: Workflow — envoyer les instructions au post-process

**Files:**
- Modify: `src/hooks/useRecordingWorkflow.ts:68-95` (`maybePostProcessCloud`)

**Interfaces:**
- Consumes: `settings.post_process_custom_instructions` (Task 3), `PostProcessArgs.customInstructions` (Task 1).
- Produces: chaque appel post-process (batch ET streaming — les deux chemins passent par `maybePostProcessCloud`) porte les instructions trimmées, omises si vides.

- [ ] **Step 1: Modifier l'appel**

Dans `maybePostProcessCloud`, remplacer le bloc d'appel (lignes 79-84) :

```ts
  try {
    const customInstructions =
      settings.post_process_custom_instructions?.trim() ?? "";
    const result = await postProcessCloud({
      task: "auto",
      text: trimmed,
      jwt,
      ...(customInstructions ? { customInstructions } : {}),
    });
```

(Le reste de la fonction est inchangé.)

- [ ] **Step 2: Vérifier compilation + tests**

Run: `pnpm build && pnpm exec vitest run`
Expected: build OK, suite Vitest verte.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useRecordingWorkflow.ts
git commit -m "feat: send custom instructions with every post-process call"
```

---

### Task 6: Retrait frontend de `whisper_initial_prompt`

**Files:**
- Modify: `src/components/settings/sections/VocabularySection.tsx`
- Modify: `src/hooks/useRecordingWorkflow.ts:475`
- Modify: `src/lib/settings.ts:77` et `:175`
- Modify: `src/locales/fr.json` (clés `settings.vocabulary.initialPrompt*`, lignes ~554-558)
- Modify: `src/locales/en.json` (idem)

**Interfaces:**
- Consumes: rien.
- Produces: plus aucune référence TS à `whisper_initial_prompt`. La commande Rust `transcribe_audio` garde son paramètre `initial_prompt: Option<String>` jusqu'à Task 7 — un arg optionnel non envoyé se désérialise en `None`, donc le build reste cohérent entre les deux tasks.

- [ ] **Step 1: VocabularySection — retirer le Row et le hook settings**

Dans `src/components/settings/sections/VocabularySection.tsx` :

1. Supprimer l'import `import { useSettings } from "@/hooks/useSettings";` (ligne 3).
2. Supprimer `const { settings, updateSetting } = useSettings();` (ligne 31).
3. Supprimer les deux lignes (36-37) :
```ts
  const prompt = settings.whisper_initial_prompt ?? "";
  const wordCount = prompt.trim().split(/\s+/).filter(Boolean).length;
```
4. Supprimer le Row complet `label={t("settings.vocabulary.initialPrompt")}` (lignes 286-323, du `<Row` au `</Row>` inclus — le textarea et son footer compteur).

- [ ] **Step 2: useRecordingWorkflow — retirer l'arg d'invoke**

Supprimer la ligne 475 :

```ts
              initialPrompt: settings.whisper_initial_prompt ?? "",
```

- [ ] **Step 3: settings.ts — retirer la clé**

Supprimer `whisper_initial_prompt: string;` (ligne 77, bloc `// Vocabulary`) et `whisper_initial_prompt: "",` (ligne 175 dans `DEFAULT_SETTINGS`). Les clés `snippets` et `dictionary` restent.

- [ ] **Step 4: i18n — retirer les 5 clés dans les deux locales**

Dans `src/locales/fr.json` ET `src/locales/en.json`, supprimer du bloc `settings.vocabulary` :
`initialPrompt`, `initialPromptDesc`, `initialPromptPlaceholder`, `initialPromptWordCount`, `initialPromptHint`. Attention à la virgule sur la clé précédente (`addWord` devient la dernière).

- [ ] **Step 5: Vérifier qu'il ne reste aucune référence**

Run: `grep -rn "whisper_initial_prompt\|initialPrompt" src/`
Expected: aucun résultat.

Run: `pnpm build && pnpm exec vitest run`
Expected: build OK, suite verte.

- [ ] **Step 6: Commit**

```bash
git add src/components/settings/sections/VocabularySection.tsx src/hooks/useRecordingWorkflow.ts src/lib/settings.ts src/locales/fr.json src/locales/en.json
git commit -m "refactor: remove whisper_initial_prompt from frontend"
```

---

### Task 7: Retrait Rust de `initial_prompt` dans `transcribe_audio`

**Files:**
- Modify: `src-tauri/src/commands/transcription.rs:27` et `:60-77`

**Interfaces:**
- Consumes: rien (le frontend n'envoie plus `initialPrompt` depuis Task 6).
- Produces: `transcribe_audio` sans paramètre `initial_prompt` ; le dictionnaire seul est passé à `transcription_local::transcribe_local` (dont la signature ne change pas — son 6e paramètre s'appelle déjà `dictionary`). Le log « Translate mode enabled: ignoring initial_prompt » dans `transcription_local.rs:222` reste inchangé.

- [ ] **Step 1: Supprimer le paramètre et la concaténation**

Dans `src-tauri/src/commands/transcription.rs` :

1. Supprimer la ligne 27 : `initial_prompt: Option<String>,`
2. Remplacer le bloc lignes 60-67 :

```rust
    let dict = dictionary.as_deref().unwrap_or("").trim();
    let prompt = initial_prompt.as_deref().unwrap_or("").trim();
    let combined_prompt = match (prompt.is_empty(), dict.is_empty()) {
        (false, false) => format!("{}\n\n{}", prompt, dict),
        (false, true) => prompt.to_string(),
        (true, false) => dict.to_string(),
        (true, true) => String::new(),
    };
```

par :

```rust
    let dict = dictionary.as_deref().unwrap_or("").trim();
```

3. Dans l'appel à `transcribe_local` (ligne ~77), remplacer `&combined_prompt` par `dict`.

- [ ] **Step 2: Vérifier la compilation**

Run (Git Bash) :
```bash
export PATH="$PATH:/c/Program Files/CMake/bin"
cd src-tauri && LIBCLANG_PATH="C:/Program Files/LLVM/bin" cargo check
```
Expected: `Finished` sans erreur. Un warning « unused variable » ne doit PAS apparaître (si oui, une référence a été oubliée).

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/commands/transcription.rs
git commit -m "refactor: drop initial_prompt from transcribe_audio, keep dictionary biasing"
```

---

### Task 8: Vérification finale

**Files:** aucun nouveau — vérification globale.

- [ ] **Step 1: Suite complète**

Run:
```bash
pnpm build && pnpm exec vitest run
export PATH="$PATH:/c/Program Files/CMake/bin"
cd src-tauri && LIBCLANG_PATH="C:/Program Files/LLVM/bin" cargo check
```
Expected: build OK, tous les tests Vitest verts, cargo check propre.

- [ ] **Step 2: Grep de non-régression**

```bash
grep -rn "whisper_initial_prompt" src/ src-tauri/src/
grep -rn "initialPrompt" src/ src-tauri/src/
```
Expected: aucun résultat dans le code (les occurrences dans `docs/` sont historiques et OK).

- [ ] **Step 3: Smoke test manuel (utilisateur)**

Demander à l'utilisateur de lancer `pnpm tauri dev` et dérouler la checklist E2E du spec :
1. instructions vides → comportement identique à aujourd'hui ;
2. « Remplace "volt" par "Vault" » → remplacement appliqué (nécessite le serveur déployé — sinon vérifier seulement que l'appel part sans erreur) ;
3. post-process désactivé → le champ n'apparaît pas dans Settings ;
4. section Vocabulaire → plus de textarea, snippets + dictionnaire intacts.

**Note dépendance serveur :** l'effet réel des instructions dépend du déploiement de l'API cloud (repo séparé, spec §5). Tant que le serveur ignore `custom_instructions`, le champ est inerte mais inoffensif.
