# Design : Onboarding IA & recommandation de modèle

**Date :** 2026-04-16  
**Statut :** Approuvé

---

## Contexte

L'application est inutilisable sans configuration IA : soit un modèle local téléchargé, soit une clé API. Actuellement, aucun onboarding n'existe. Le provider par défaut est "OpenAI" mais l'utilisateur voulait "Local". Les utilisateurs non-avertis ne comprennent pas pourquoi rien ne fonctionne. L'objectif est de guider chaque utilisateur vers une configuration fonctionnelle dès le premier lancement, avec une recommandation de modèle adaptée à leur machine.

---

## Changement du défaut

`DEFAULT_SETTINGS.transcription_provider` passe de `"OpenAI"` à `"Local"` dans `src/contexts/SettingsContext.tsx`.

---

## Condition de déclenchement

Au démarrage, après chargement des settings (`isLoaded === true`), un hook `useOnboardingCheck` vérifie :

```
SI (provider === "Local" ET check_local_model_exists(local_model_size) === false)
OU (provider === "OpenAI" ET settings.openai_api_key est vide)
OU (provider === "Google" ET settings.google_api_key est vide)
→ afficher <OnboardingWizard />
```

`check_local_model_exists` est la commande Tauri existante dans `src-tauri/src/commands/model.rs`.

La modale est **bloquante** (pas de bouton fermer/ignorer) et se referme uniquement quand la condition n'est plus remplie.

---

## Wizard : structure des écrans

### Écran 1 — Choix du mode *(toujours affiché)*

Deux cartes cliquables :

- **Local** — Gratuit, offline, tourne sur ton PC. Nécessite un modèle à télécharger (~244 Mo à 3 Go selon le modèle).
- **API OpenAI** — Qualité maximale, connexion internet requise, clé API payante.

---

### Écran 2a — Mode Local : détection & téléchargement

**Bloc détection (opt-in) :**

Bouton `"Détecter automatiquement le meilleur modèle"` → appelle `get_system_info` (Rust) → affiche :

> *"Ton PC a X Go de RAM [+ GPU discret détecté]. On recommande le modèle **large-v3-turbo** (1,6 Go)."*

**Logique de recommandation :**

| GPU | RAM | Modèle recommandé |
|-----|-----|-------------------|
| Discret (RTX, RX…) | — | `large-v3-turbo` |
| Intégré ou absent | < 8 Go | API conseillée |
| Intégré ou absent | 8–16 Go | `small` |
| Intégré ou absent | > 16 Go | `large-v3-turbo` |

**Encart avertissement (affiché après recommandation) :**

> *"Si les transcriptions sont trop lentes, essaie un modèle plus petit. Si ton PC tient la charge, monte d'un cran. À toi de trouver le bon équilibre qualité/vitesse."*

**Sélecteur manuel :** l'utilisateur peut ignorer la recommandation et choisir manuellement dans une liste déroulante (tous les modèles disponibles).

**Bouton Télécharger** : déclenche `download_local_model` (commande existante), affiche barre de progression. Quand terminé → fermeture automatique de la modale.

---

### Écran 2b — Mode API : saisie de clé

Champ texte pour la clé OpenAI. Bouton `"Valider"` → sauvegarde via `updateSetting` + fermeture automatique.

---

## Détection hardware (Rust)

Nouvelle commande Tauri `get_system_info` dans `src-tauri/src/commands/system.rs` :

```rust
#[tauri::command]
pub async fn get_system_info() -> SystemInfo {
    SystemInfo {
        total_ram_gb: ...,   // via sysinfo crate
        has_discrete_gpu: ..., // via wgpu adapter enumeration
    }
}
```

**Dépendances à ajouter dans `Cargo.toml` :**
- `sysinfo = "0.30"` — RAM totale
- `wgpu = "22"` — détection GPU discret vs intégré via `Adapter::request_adapter` + `AdapterInfo.device_type`

**Logique GPU :** énumération des adaptateurs wgpu (backends Vulkan + DX12), si au moins un adaptateur de type `DeviceType::DiscreteGpu` → `has_discrete_gpu = true`.

**Fallback si détection échoue :** `has_discrete_gpu = false`, `total_ram_gb = 0.0` → afficher un message "Détection impossible, choisis manuellement" à la place de la recommandation.

---

## Fichiers à créer / modifier

### Frontend
| Fichier | Action |
|---------|--------|
| `src/components/OnboardingWizard.tsx` | Créer — wizard 2 écrans |
| `src/hooks/useOnboardingCheck.ts` | Créer — vérifie condition de déclenchement |
| `src/components/Dashboard.tsx` | Modifier — render `<OnboardingWizard />` conditionnel |
| `src/contexts/SettingsContext.tsx` | Modifier — changer default provider à `"Local"` |

### Rust
| Fichier | Action |
|---------|--------|
| `src-tauri/src/commands/system.rs` | Créer — commande `get_system_info` |
| `src-tauri/src/lib.rs` | Modifier — enregistrer la commande + `mod commands::system` |
| `src-tauri/Cargo.toml` | Modifier — ajouter `sysinfo`, `wgpu` |
| `src-tauri/capabilities/default.json` | Modifier — ajouter permission `get_system_info` |

---

## Vérification / test end-to-end

1. **Test onboarding Local :** réinitialiser les settings (supprimer le store), lancer l'app → la modale doit s'ouvrir sur l'écran 1.
2. **Test détection :** cliquer "Détecter" → vérifier que le résultat est cohérent avec la machine (RAM, GPU).
3. **Test téléchargement :** choisir un modèle → cliquer Télécharger → barre de progression → modale se ferme → app utilisable.
4. **Test API :** choisir mode API → saisir une fausse clé → valider → modale se ferme → vérifier que l'app utilise bien l'API.
5. **Test re-déclenchement :** supprimer le modèle téléchargé → relancer → modale doit réapparaître.
6. **Test skip :** avec un modèle déjà téléchargé → lancer → modale ne doit PAS apparaître.
