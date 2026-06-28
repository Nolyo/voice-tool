# Post-process strict prompt — design

**Date**: 2026-04-20
**Scope**: `src-tauri/src/commands/ai.rs`
**Type**: Prompt-only change (no architecture, no API, no frontend impact)

## Problem

The post-process feature (mode `auto`) is triggered automatically from a mini-window shortcut. The underlying LLM (`gpt-4o-mini` for OpenAI, `llama-3.1-8b-instant` for Groq) does not always follow the system prompt: instead of just reformatting the dictation, it sometimes:

- answers a question contained in the dictation
- completes an unfinished sentence with invented content
- interprets the dictation as an instruction aimed at itself

Examples observed by the user:
- Dictation: "Par défaut j'ai mis CTRL plus F11 mais sur mon PC portable le F11 est inaccessible. J'ai voulu mettre CTRL Windows mais ça ne marche pas, pourquoi ?"
- Expected output: the same sentence, just with cleaned punctuation.
- Actual output: a full explanation of the Windows dictation shortcut.

Desired behaviour in `auto` mode:

- **Meta-instructions** in the dictation (e.g. "traduis en anglais X", "rédige ça comme un mail X") → apply the instruction to the rest of the dictation AND strip the instruction itself from the output.
- **Normal text** (including questions, incomplete sentences) → reformat only (punctuation, casing, optional list/email structure). Never answer, never complete, never invent.

## Goals

1. In `auto` mode, the LLM never answers a dictated question.
2. In `auto` mode, the LLM never completes an unfinished sentence with invented content.
3. In `auto` mode, the LLM still correctly detects and applies meta-instructions ("traduis…", "rédige comme un mail…").
4. Across all other modes (`list`, `email`, `formal`, `casual`, `summary`, `grammar`, `custom`), the same anti-answer / anti-complete rule applies — the user already chose a transformation, so the LLM must never break out of it.

## Non-goals

- Not changing the default model (`gpt-4o-mini` / `llama-3.1-8b-instant`).
- Not adding a new post-process mode.
- Not modifying frontend, shortcuts, or any Tauri command surface.
- Not introducing few-shot examples in modes other than `auto` (not worth the token cost; modes are already narrowly scoped).

## Architecture

Three edits, all in `src-tauri/src/commands/ai.rs`:

1. **`AUTO_PROMPT` constant** — full rewrite with explicit absolute rule, two-step decision tree (meta-instruction → else reformat), and four few-shot examples.
2. **`LIST_PROMPT`, `EMAIL_PROMPT`, `FORMAL_PROMPT`, `CASUAL_PROMPT`, `SUMMARY_PROMPT`, `GRAMMAR_PROMPT`, `CUSTOM_PREAMBLE`** — insert a standard anti-answer / anti-complete sentence before the existing closing boilerplate.
3. **`post_process_text` function body** — wrap the user text in `<dictation>…</dictation>` before passing it to `chat_completion_with_provider`, so every system prompt can reliably refer to that delimiter.

No new dependencies, no schema changes, no migration.

## Detailed changes

### 3.1 New `AUTO_PROMPT`

```
Tu es un assistant de mise en forme de texte dicté à la voix.
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
→ Donc je pense qu'on pourrait.
```

### 3.2 Shared anti-answer clause inserted into other prompts

Inserted before the existing closing sentence ("Ne préfixe pas ta réponse…") in each of the 6 prompts + `CUSTOM_PREAMBLE`:

```
Tu reçois une dictée brute encadrée par <dictation>...</dictation>. Tu ne réponds JAMAIS à une question contenue dans le texte, tu ne complètes JAMAIS une phrase inachevée, tu n'inventes JAMAIS de contenu absent de la dictée.
```

### 3.3 Wrapping the user text

Before:

```rust
let outcome = chat::chat_completion_with_provider(provider, &api_key, &system_prompt, trimmed)
    .await
    .map_err(|e| e.to_string())?;
```

After:

```rust
let wrapped_text = format!("<dictation>\n{}\n</dictation>", trimmed);
let outcome = chat::chat_completion_with_provider(provider, &api_key, &system_prompt, &wrapped_text)
    .await
    .map_err(|e| e.to_string())?;
```

## Testing plan

Manual smoke tests via the running app (dev mode), for each scenario the user reported:

1. Dictate a question ("Pourquoi le raccourci Ctrl+Windows ne marche pas ?") → output is the reformatted question, not an answer.
2. Dictate "Traduis en anglais bonjour comment ça va" → output is "Hello, how are you?" (or equivalent), with no leading "Traduis en anglais".
3. Dictate "Rédige ça comme un mail, je voulais te dire que…" → output is an email body starting with a greeting, without the words "Rédige ça comme un mail".
4. Dictate a clearly unfinished sentence ("Donc je pense qu'on pourrait") → output is that same sentence, cleaned but not completed.
5. Dictate a multi-item enumeration → output is a Markdown bullet list.

No automated tests: the post-process code path already has no tests, and the change is pure prompt tuning whose quality is evaluated on real LLM output.

## Risks

- **Small regression risk** on edge cases where the existing prompt happened to work. Mitigated by the four few-shot examples covering the main intended behaviours.
- **Token cost slightly increased** (few-shot examples add ~250 tokens per call on `auto`). At `gpt-4o-mini` pricing (0.15 $/M input), this is negligible (<$0.005 per 100 calls).
- **Language drift**: the prompt is French, but dictations may be in English. The "Conserve la langue d'origine" instruction already covers this.

## Rollback

Trivial: revert the commit. No state, no migration, no persisted data is affected.
