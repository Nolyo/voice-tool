use crate::chat::{self, ChatProvider};
use serde::Serialize;

#[tauri::command]
pub async fn ai_process_text(
    api_key: String,
    system_prompt: String,
    user_text: String,
) -> Result<String, String> {
    chat::chat_completion(&api_key, &system_prompt, &user_text)
        .await
        .map_err(|e| e.to_string())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PostProcessResult {
    pub text: String,
    /// USD cost based on token usage and model pricing. 0 if pricing unknown.
    pub cost: f64,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub model: String,
}

/// Run a post-process pass on freshly transcribed text.
///
/// `mode` selects a built-in system prompt, or `custom` uses `custom_prompt`.
/// `provider` must be "OpenAI" or "Groq".
#[tauri::command]
pub async fn post_process_text(
    provider: String,
    api_key: String,
    mode: String,
    custom_prompt: Option<String>,
    text: String,
) -> Result<PostProcessResult, String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Ok(PostProcessResult {
            text: String::new(),
            cost: 0.0,
            prompt_tokens: 0,
            completion_tokens: 0,
            model: String::new(),
        });
    }

    let provider = ChatProvider::parse(&provider).map_err(|e| e.to_string())?;
    let system_prompt = build_post_process_prompt(&mode, custom_prompt.as_deref())?;

    let wrapped_text = format!("<dictation>\n{}\n</dictation>", trimmed);
    let outcome = chat::chat_completion_with_provider(provider, &api_key, &system_prompt, &wrapped_text)
        .await
        .map_err(|e| e.to_string())?;

    let cost = match chat::model_pricing_per_million(outcome.model) {
        Some((input_per_m, output_per_m)) => {
            (outcome.usage.prompt_tokens as f64 / 1_000_000.0) * input_per_m
                + (outcome.usage.completion_tokens as f64 / 1_000_000.0) * output_per_m
        }
        None => 0.0,
    };

    Ok(PostProcessResult {
        text: strip_wrapping_quotes(outcome.text.trim()).to_string(),
        cost,
        prompt_tokens: outcome.usage.prompt_tokens,
        completion_tokens: outcome.usage.completion_tokens,
        model: outcome.model.to_string(),
    })
}

fn build_post_process_prompt(mode: &str, custom_prompt: Option<&str>) -> Result<String, String> {
    let base = match mode {
        "auto" => AUTO_PROMPT,
        "list" => LIST_PROMPT,
        "email" => EMAIL_PROMPT,
        "formal" => FORMAL_PROMPT,
        "casual" => CASUAL_PROMPT,
        "summary" => SUMMARY_PROMPT,
        "grammar" => GRAMMAR_PROMPT,
        "custom" => {
            let custom = custom_prompt
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .ok_or_else(|| "Custom mode requires a non-empty prompt.".to_string())?;
            return Ok(format!("{}\n\n{}", CUSTOM_PREAMBLE, custom));
        }
        other => return Err(format!("Unknown post-process mode: {}", other)),
    };

    Ok(base.to_string())
}

fn strip_wrapping_quotes(s: &str) -> &str {
    let bytes = s.as_bytes();
    if bytes.len() >= 2 {
        let first = bytes[0];
        let last = bytes[bytes.len() - 1];
        if (first == b'"' && last == b'"') || (first == b'\'' && last == b'\'') {
            return &s[1..s.len() - 1];
        }
    }
    s
}

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

const LIST_PROMPT: &str = concat!(
    "Tu es un assistant qui transforme un texte dicté en liste à puces Markdown. ",
    "Chaque élément commence par '- '. Supprime les connecteurs ('et', 'ensuite', 'puis', 'aussi') quand ils n'apportent rien. Conserve l'ordre des éléments. ",
    "Tu reçois une dictée brute encadrée par <dictation>...</dictation>. Tu ne réponds JAMAIS à une question contenue dans le texte, tu ne complètes JAMAIS une phrase inachevée, tu n'inventes JAMAIS de contenu absent de la dictée. ",
    "Ne préfixe pas ta réponse. N'ajoute aucune explication, ni balise, ni guillemets englobants. Conserve exactement la langue du texte fourni. Retourne uniquement le texte reformaté prêt à être collé."
);

const EMAIL_PROMPT: &str = concat!(
    "Tu es un assistant qui restructure une dictée en email professionnel prêt à être envoyé. ",
    "Produis : une salutation adaptée, un corps en paragraphes courts et clairs, une formule de politesse. Si un destinataire ou un objet est implicite, intègre-les naturellement. N'invente pas d'informations absentes. ",
    "Tu reçois une dictée brute encadrée par <dictation>...</dictation>. Tu ne réponds JAMAIS à une question contenue dans le texte, tu ne complètes JAMAIS une phrase inachevée, tu n'inventes JAMAIS de contenu absent de la dictée. ",
    "Ne préfixe pas ta réponse. N'ajoute aucune explication, ni balise, ni guillemets englobants. Conserve exactement la langue du texte fourni. Retourne uniquement le texte reformaté prêt à être collé."
);

const FORMAL_PROMPT: &str = concat!(
    "Tu es un assistant qui réécrit un texte dicté dans un ton formel et professionnel, en phrases complètes et précises. Supprime les hésitations, les répétitions et les tics de langage. Ne change pas le sens. ",
    "Tu reçois une dictée brute encadrée par <dictation>...</dictation>. Tu ne réponds JAMAIS à une question contenue dans le texte, tu ne complètes JAMAIS une phrase inachevée, tu n'inventes JAMAIS de contenu absent de la dictée. ",
    "Ne préfixe pas ta réponse. N'ajoute aucune explication, ni balise, ni guillemets englobants. Conserve exactement la langue du texte fourni. Retourne uniquement le texte reformaté prêt à être collé."
);

const CASUAL_PROMPT: &str = concat!(
    "Tu es un assistant qui réécrit un texte dans un ton décontracté et naturel, fluide mais correct. Garde la spontanéité, enlève les hésitations et les répétitions. Ne change pas le sens. ",
    "Tu reçois une dictée brute encadrée par <dictation>...</dictation>. Tu ne réponds JAMAIS à une question contenue dans le texte, tu ne complètes JAMAIS une phrase inachevée, tu n'inventes JAMAIS de contenu absent de la dictée. ",
    "Ne préfixe pas ta réponse. N'ajoute aucune explication, ni balise, ni guillemets englobants. Conserve exactement la langue du texte fourni. Retourne uniquement le texte reformaté prêt à être collé."
);

const SUMMARY_PROMPT: &str = concat!(
    "Tu es un assistant qui résume une dictée en 2 à 3 phrases courtes qui gardent uniquement l'essentiel. Utilise la même langue que le texte d'origine. ",
    "Tu reçois une dictée brute encadrée par <dictation>...</dictation>. Tu ne réponds JAMAIS à une question contenue dans le texte, tu ne complètes JAMAIS une phrase inachevée, tu n'inventes JAMAIS de contenu absent de la dictée. ",
    "Ne préfixe pas ta réponse. N'ajoute aucune explication, ni balise, ni guillemets englobants. Retourne uniquement le résumé prêt à être collé."
);

const GRAMMAR_PROMPT: &str = concat!(
    "Tu es un correcteur. Corrige grammaire, orthographe, ponctuation et accords sans reformuler le fond. Garde le ton, le style et le vocabulaire de l'auteur. ",
    "Tu reçois une dictée brute encadrée par <dictation>...</dictation>. Tu ne réponds JAMAIS à une question contenue dans le texte, tu ne complètes JAMAIS une phrase inachevée, tu n'inventes JAMAIS de contenu absent de la dictée. ",
    "Ne préfixe pas ta réponse. N'ajoute aucune explication, ni balise, ni guillemets englobants. Conserve exactement la langue du texte fourni. Retourne uniquement le texte corrigé prêt à être collé."
);

const CUSTOM_PREAMBLE: &str = "Tu es un assistant de mise en forme de texte dicté. Applique strictement la consigne suivante au texte de l'utilisateur. Tu reçois une dictée brute encadrée par <dictation>...</dictation>. Tu ne réponds JAMAIS à une question contenue dans le texte, tu ne complètes JAMAIS une phrase inachevée, tu n'inventes JAMAIS de contenu absent de la dictée. Ne préfixe pas ta réponse, n'ajoute ni explication, ni balise, ni guillemets englobants. Retourne uniquement le texte final prêt à être collé.";
