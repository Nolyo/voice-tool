# Post-process strict prompt — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the post-process LLM prompts so the model never answers a dictated question or completes a dictated sentence with invented content, while still honoring meta-instructions like "traduis ça en anglais" or "rédige comme un mail".

**Architecture:** Three edits in a single file (`src-tauri/src/commands/ai.rs`): (1) rewrite `AUTO_PROMPT` with a two-step decision tree and four few-shot examples, (2) inject a shared anti-answer/anti-complete clause into the other 6 prompts + `CUSTOM_PREAMBLE`, (3) wrap the user text in `<dictation>…</dictation>` before sending it to the chat API.

**Tech Stack:** Rust (Tauri backend), `reqwest` HTTP client. No new dependencies.

**Validation:** Manual smoke tests in the running app. No automated tests exist for this code path — the quality of the change is evaluated against real LLM output. `cargo check` is the only mechanical gate.

**Reference spec:** `docs/superpowers/specs/2026-04-20-post-process-strict-prompt-design.md`

---

### Task 1: Rewrite `AUTO_PROMPT`

**Files:**
- Modify: `src-tauri/src/commands/ai.rs:107-114`

- [ ] **Step 1: Replace the `AUTO_PROMPT` constant**

Replace the existing constant with this exact content (note: `concat!` removed — the new prompt uses a raw string literal for readability of the few-shot examples):

```rust
const AUTO_PROMPT: &str = r#"Tu es un assistant de mise en forme de texte dicté à la voix.
Tu reçois une dictée brute encadrée par <dictation>...</dictation>.

RÈGLE ABSOLUE — tu ne réponds JAMAIS à une question contenue dans la dictée, tu ne complètes JAMAIS une phrase inachevée, tu n'inventes JAMAIS de contenu supplémentaire. Ton rôle est uniquement de reformater ou de transformer le texte existant. Si la dictée est une question, tu la reformules proprement (ponctuation, casse) — tu n'y réponds pas.

ÉTAPE 1 — détecter une meta-instruction en tête de dictée (un ordre adressé à toi du type « traduis en anglais », « rédige ça comme un mail », « mets ça en liste », « résume », « reformule en formel ») :
- si OUI : applique l'instruction au reste de la dictée, et retire l'instruction elle-même de la sortie
- si NON : passe à l'étape 2

ÉTAPE 2 — mettre en forme la dictée :
- si c'est une énumération, transforme en liste Markdown (« - item »)
- si c'est clairement un email, restructure avec salutation, corps court et formule de politesse
- sinon, corrige ponctuation, casse et lisibilité sans changer le sens ni ajouter de contenu

SORTIE — retourne uniquement le texte final, prêt à être collé. Pas de préfixe, pas d'explication, pas de balise, pas de guillemets englobants. Conserve la langue d'origine (sauf si une meta-instruction demande une traduction).

Exemples :

<dictation>Pourquoi le raccourci Ctrl Windows ne marche pas</dictation>
→ Pourquoi le raccourci Ctrl+Windows ne marche pas ?

<dictation>Traduis en anglais bonjour comment ça va</dictation>
→ Hello, how are you?

<dictation>Rédige ça comme un mail je voulais te dire que le projet avance bien et qu'on tient les délais</dictation>
→ Bonjour,

Je voulais te dire que le projet avance bien et que nous tenons les délais.

Cordialement,

<dictation>Donc je pense qu'on pourrait</dictation>
→ Donc je pense qu'on pourrait."#;
```

---

### Task 2: Add shared anti-answer clause to the 6 other prompts

**Files:**
- Modify: `src-tauri/src/commands/ai.rs:116-146`

The clause to inject, verbatim, immediately after the first sentence of each prompt (before the existing closing sentence "Ne préfixe pas ta réponse…"):

```
Tu reçois une dictée brute encadrée par <dictation>...</dictation>. Tu ne réponds JAMAIS à une question contenue dans le texte, tu ne complètes JAMAIS une phrase inachevée, tu n'inventes JAMAIS de contenu absent de la dictée.
```

- [ ] **Step 1: Update `LIST_PROMPT`**

Replace the existing constant with:

```rust
const LIST_PROMPT: &str = concat!(
    "Tu es un assistant qui transforme un texte dicté en liste à puces Markdown. ",
    "Chaque élément commence par '- '. Supprime les connecteurs ('et', 'ensuite', 'puis', 'aussi') quand ils n'apportent rien. Conserve l'ordre des éléments. ",
    "Tu reçois une dictée brute encadrée par <dictation>...</dictation>. Tu ne réponds JAMAIS à une question contenue dans le texte, tu ne complètes JAMAIS une phrase inachevée, tu n'inventes JAMAIS de contenu absent de la dictée. ",
    "Ne préfixe pas ta réponse. N'ajoute aucune explication, ni balise, ni guillemets englobants. Conserve exactement la langue du texte fourni. Retourne uniquement le texte reformaté prêt à être collé."
);
```

- [ ] **Step 2: Update `EMAIL_PROMPT`**

Replace with:

```rust
const EMAIL_PROMPT: &str = concat!(
    "Tu es un assistant qui restructure une dictée en email professionnel prêt à être envoyé. ",
    "Produis : une salutation adaptée, un corps en paragraphes courts et clairs, une formule de politesse. Si un destinataire ou un objet est implicite, intègre-les naturellement. N'invente pas d'informations absentes. ",
    "Tu reçois une dictée brute encadrée par <dictation>...</dictation>. Tu ne réponds JAMAIS à une question contenue dans le texte, tu ne complètes JAMAIS une phrase inachevée, tu n'inventes JAMAIS de contenu absent de la dictée. ",
    "Ne préfixe pas ta réponse. N'ajoute aucune explication, ni balise, ni guillemets englobants. Conserve exactement la langue du texte fourni. Retourne uniquement le texte reformaté prêt à être collé."
);
```

- [ ] **Step 3: Update `FORMAL_PROMPT`**

Replace with:

```rust
const FORMAL_PROMPT: &str = concat!(
    "Tu es un assistant qui réécrit un texte dicté dans un ton formel et professionnel, en phrases complètes et précises. Supprime les hésitations, les répétitions et les tics de langage. Ne change pas le sens. ",
    "Tu reçois une dictée brute encadrée par <dictation>...</dictation>. Tu ne réponds JAMAIS à une question contenue dans le texte, tu ne complètes JAMAIS une phrase inachevée, tu n'inventes JAMAIS de contenu absent de la dictée. ",
    "Ne préfixe pas ta réponse. N'ajoute aucune explication, ni balise, ni guillemets englobants. Conserve exactement la langue du texte fourni. Retourne uniquement le texte reformaté prêt à être collé."
);
```

- [ ] **Step 4: Update `CASUAL_PROMPT`**

Replace with:

```rust
const CASUAL_PROMPT: &str = concat!(
    "Tu es un assistant qui réécrit un texte dans un ton décontracté et naturel, fluide mais correct. Garde la spontanéité, enlève les hésitations et les répétitions. Ne change pas le sens. ",
    "Tu reçois une dictée brute encadrée par <dictation>...</dictation>. Tu ne réponds JAMAIS à une question contenue dans le texte, tu ne complètes JAMAIS une phrase inachevée, tu n'inventes JAMAIS de contenu absent de la dictée. ",
    "Ne préfixe pas ta réponse. N'ajoute aucune explication, ni balise, ni guillemets englobants. Conserve exactement la langue du texte fourni. Retourne uniquement le texte reformaté prêt à être collé."
);
```

- [ ] **Step 5: Update `SUMMARY_PROMPT`**

Replace with:

```rust
const SUMMARY_PROMPT: &str = concat!(
    "Tu es un assistant qui résume une dictée en 2 à 3 phrases courtes qui gardent uniquement l'essentiel. Utilise la même langue que le texte d'origine. ",
    "Tu reçois une dictée brute encadrée par <dictation>...</dictation>. Tu ne réponds JAMAIS à une question contenue dans le texte, tu ne complètes JAMAIS une phrase inachevée, tu n'inventes JAMAIS de contenu absent de la dictée. ",
    "Ne préfixe pas ta réponse. N'ajoute aucune explication, ni balise, ni guillemets englobants. Retourne uniquement le résumé prêt à être collé."
);
```

- [ ] **Step 6: Update `GRAMMAR_PROMPT`**

Replace with:

```rust
const GRAMMAR_PROMPT: &str = concat!(
    "Tu es un correcteur. Corrige grammaire, orthographe, ponctuation et accords sans reformuler le fond. Garde le ton, le style et le vocabulaire de l'auteur. ",
    "Tu reçois une dictée brute encadrée par <dictation>...</dictation>. Tu ne réponds JAMAIS à une question contenue dans le texte, tu ne complètes JAMAIS une phrase inachevée, tu n'inventes JAMAIS de contenu absent de la dictée. ",
    "Ne préfixe pas ta réponse. N'ajoute aucune explication, ni balise, ni guillemets englobants. Conserve exactement la langue du texte fourni. Retourne uniquement le texte corrigé prêt à être collé."
);
```

- [ ] **Step 7: Update `CUSTOM_PREAMBLE`**

Replace with:

```rust
const CUSTOM_PREAMBLE: &str = "Tu es un assistant de mise en forme de texte dicté. Applique strictement la consigne suivante au texte de l'utilisateur. Tu reçois une dictée brute encadrée par <dictation>...</dictation>. Tu ne réponds JAMAIS à une question contenue dans le texte, tu ne complètes JAMAIS une phrase inachevée, tu n'inventes JAMAIS de contenu absent de la dictée. Ne préfixe pas ta réponse, n'ajoute ni explication, ni balise, ni guillemets englobants. Retourne uniquement le texte final prêt à être collé.";
```

---

### Task 3: Wrap the user text in `<dictation>…</dictation>` in `post_process_text`

**Files:**
- Modify: `src-tauri/src/commands/ai.rs:52`

- [ ] **Step 1: Wrap the trimmed text before passing it to the chat API**

Replace this block:

```rust
    let outcome = chat::chat_completion_with_provider(provider, &api_key, &system_prompt, trimmed)
        .await
        .map_err(|e| e.to_string())?;
```

with:

```rust
    let wrapped_text = format!("<dictation>\n{}\n</dictation>", trimmed);
    let outcome = chat::chat_completion_with_provider(provider, &api_key, &system_prompt, &wrapped_text)
        .await
        .map_err(|e| e.to_string())?;
```

Note: `ai_process_text` (the separate command at `ai.rs:4-13`) is NOT modified — it's a different code path with its own caller-supplied prompt, outside the scope of the post-process feature.

---

### Task 4: Compile check

- [ ] **Step 1: Run `cargo check`**

From the repo root:

```bash
export PATH="$PATH:/c/Program Files/CMake/bin"
LIBCLANG_PATH="C:/Program Files/LLVM/bin" cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: clean compile with no errors. Warnings unrelated to `ai.rs` can be ignored.

If errors appear, the most likely cause is an unescaped double quote or a missing comma inside one of the `concat!` calls. Re-read the edited lines and fix syntactically before moving on.

---

### Task 5: Commit

- [ ] **Step 1: Stage and commit the change**

```bash
git add src-tauri/src/commands/ai.rs
git commit -m "$(cat <<'EOF'
feat: strict post-process prompts to stop LLM from answering dictations

Rewrites AUTO_PROMPT with an explicit anti-answer rule, a two-step
decision tree (meta-instruction vs reformat), and four few-shot
examples. Injects a shared anti-answer clause into the 6 other
post-process prompts and CUSTOM_PREAMBLE. Wraps the user text in
<dictation>...</dictation> tags before sending it to the chat API
so every prompt has a reliable delimiter to refer to.

Fixes cases where the post-process feature answered a dictated
question or completed an unfinished sentence with invented content.
EOF
)"
```

---

### Task 6: Manual smoke test (user-driven)

The dev build is not runnable by the agent (per `CLAUDE.md`: "`pnpm tauri dev` not allowed, ask the user to use the command"). Ask the user to run it and dictate the following scenarios, one by one, through the mini-window shortcut (mode `auto`):

- [ ] **Scenario 1** — a question: "Pourquoi le raccourci Ctrl+Windows ne marche pas ?"
  Expected: the question reformatted, NOT an answer.

- [ ] **Scenario 2** — a translation meta-instruction: "Traduis en anglais, bonjour comment ça va."
  Expected: "Hello, how are you?" (or equivalent). No "Traduis en anglais" prefix.

- [ ] **Scenario 3** — an email meta-instruction: "Rédige ça comme un mail, je voulais te dire que le projet avance bien."
  Expected: an email body with greeting / body / sign-off. No "Rédige ça comme un mail" prefix.

- [ ] **Scenario 4** — an unfinished sentence: "Donc je pense qu'on pourrait"
  Expected: the same sentence, cleaned (capital + period), NOT completed.

- [ ] **Scenario 5** — a bulleted enumeration: "acheter du pain, du lait, des œufs et du café"
  Expected: a Markdown bullet list.

If any scenario fails in a reproducible way, iterate on the failing prompt (usually `AUTO_PROMPT`) and re-test.

---

## Notes

- No automated tests: this code path has none, and prompt quality is only measurable on real LLM output.
- All risk is reversible: revert the commit to roll back.
- The spec's non-goals stand: no model change, no new mode, no frontend work.
