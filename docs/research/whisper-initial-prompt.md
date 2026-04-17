# Whisper — Initial Prompt

> Note de recherche sur le paramètre `prompt` (aussi appelé "initial prompt") de Whisper.
> Source : documentation OpenAI Whisper, expérimentations communauté.
> Date : 2026-04-17.

## Ce que c'est

Un texte libre passé à Whisper **avant la transcription**. Whisper le traite comme s'il s'agissait d'un texte déjà transcrit juste avant l'audio — il continue donc "dans la même veine".

- Format : **texte libre** (phrase, paragraphe, snippet de code…)
- Limite : **~224 tokens** (environ 150-200 mots)
- Troncature : si trop long, le **début** du prompt est coupé (le modèle garde la fin, plus proche de l'audio)

## Ce que ça influence

### 1. Vocabulaire
Les mots rares présents dans le prompt sont significativement mieux reconnus :
- Noms propres (personnes, entreprises, produits)
- Acronymes (API, CRUD, LSP…)
- Jargon technique, médical, juridique…
- Mots étrangers intégrés dans la langue cible

### 2. Style
Whisper imite :
- La ponctuation (virgules, points, tirets)
- La casse (majuscules initiales, tout en minuscules, CamelCase…)
- Le formatage (listes, guillemets, parenthèses)
- Le niveau de langue (soutenu, familier, technique)

## Règle clé : **montre, ne dis pas**

Les prompts **méta/descriptifs** fonctionnent mal. Les prompts qui **donnent un exemple** du résultat attendu fonctionnent bien.

| Prompt | Efficacité | Pourquoi |
|---|---|---|
| `Je suis développeur` | 🟠 Faible | Descriptif, n'influence ni le vocab ni le style |
| `Ce message est un email pro` | 🟠 Faible | Idem |
| `Code TypeScript : const user = await db.users.findMany({ where: { active: true } });` | 🟢 Fort | Montre le domaine par l'exemple |
| `Bonjour Madame Martin, Je vous remercie pour votre retour concernant le dossier 2024-42.` | 🟢 Fort | Donne explicitement le ton et la structure |

## Exemples par cas d'usage

### Développement
```
Stack : React, TypeScript, Tauri, Rust.
Exemple : const handleClick = async () => { await invoke("start_recording"); };
Mots : pnpm, cpal, whisper-rs, tauri-plugin-store, IndexedDB.
```

### Mail professionnel (FR)
```
Bonjour Madame,
Je vous remercie pour votre retour du 12 mars concernant le devis.
Je reviens vers vous dans les meilleurs délais.
Cordialement,
```

### Notes médicales
```
Consultation du 15/03. Patient de 47 ans, dyspnée d'effort depuis 3 semaines.
Auscultation : râles crépitants base gauche. TA 140/85, FC 92/min.
Prescription : amoxicilline 1g x3/jour pendant 7 jours.
```

### Gaming / Discord
```
Salut les gars ! GG pour la game, t'as carry comme un ouf.
Faut que j'up mon rang, je suis encore en Gold.
```

### Juridique
```
Vu les articles 1240 et suivants du Code civil, la cour de cassation
a jugé dans son arrêt du 3 juin 2022 (n° 20-17.489) que...
```

## Limitations

- Ce n'est **qu'un biais, pas une garantie**. Whisper peut toujours rater un mot rare même présent dans le prompt.
- Un prompt trop **générique** dilue l'effet. Mieux vaut un prompt court et pertinent qu'un long mélange.
- Un prompt **mal aligné** avec l'audio réel peut dégrader la qualité (si tu mets du code dans le prompt mais dictes un mail, bizarre).
- Pas de mécanisme pour **forcer** un mot précis. Pour ça : post-traitement (regex, LLM de correction) ou fine-tuning.

## Différence avec le `dictionary` actuel de Voice Tool

Dans l'app, `dictionary: string[]` existe déjà dans les settings. Son usage le plus efficace est justement de **construire un initial prompt** à partir de ces mots (ex : `Vocabulaire : Ollama, Tauri, whisper-rs.`). À vérifier dans le code `transcription.rs` / `transcription_local.rs` si c'est bien fait ainsi ou pas.

## Implications design pour Voice Tool

Deux approches possibles (non exclusives) :

### A. Champ libre unique
- Un textarea dans les settings "Prompt de contexte"
- Max ~200 mots, compteur visible
- L'utilisateur y met ce qu'il veut

**Avantages** : simple, flexible, power-user friendly.
**Inconvénients** : débutants ne sauront pas quoi mettre → inefficace.

### B. Templates + édition
- Liste de templates prédéfinis : "Dev", "Mail pro", "Notes de réunion", "Médical", "Juridique", "Gaming"…
- Chaque template contient un prompt déjà optimisé
- L'utilisateur peut éditer / dupliquer / créer le sien
- Un switcher (un peu comme le `ProfileSwitcher`) pour basculer à la volée

**Avantages** : onboarding beaucoup plus simple, résultats immédiats.
**Inconvénients** : plus de code (CRUD, UI), gestion multi-templates.

### C. Hybride (recommandé)
- Templates prédéfinis comme point de départ
- Chaque template éditable
- Un template actif par défaut, switchable par raccourci ou menu
- Peut s'articuler avec les **profils** existants (chaque profil a son prompt)

## Références

- [Documentation OpenAI Whisper — Prompting](https://platform.openai.com/docs/guides/speech-to-text/prompting)
- [Whisper paper (arXiv 2212.04356)](https://arxiv.org/abs/2212.04356) — section sur le conditioning
- [whisper-rs API](https://docs.rs/whisper-rs/) — paramètre `initial_prompt` sur `FullParams`
