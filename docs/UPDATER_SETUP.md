# Configuration du système de mise à jour automatique

Ce document explique comment configurer le système de mise à jour automatique de Voice Tool.

## Vue d'ensemble

Voice Tool utilise le plugin `tauri-plugin-updater` pour offrir des mises à jour automatiques sécurisées. Le système fonctionne comme suit :

1. **Au démarrage** : L'application vérifie automatiquement les mises à jour (après 10 secondes)
2. **Notification** : Si une mise à jour est disponible, un bouton apparaît dans le header
3. **Installation** : L'utilisateur peut télécharger et installer la mise à jour en un clic
4. **Sécurité** : Toutes les mises à jour sont signées cryptographiquement

## Configuration requise (une seule fois)

### 1. Ajouter la clé privée dans GitHub Secrets

La clé privée a été générée localement dans `src-tauri/private.key` (**NE PAS committer ce fichier !**).

#### Étapes :

1. Lire le contenu de la clé privée :
   ```bash
   cat src-tauri/private.key
   ```

2. Copier TOUT le contenu (y compris les lignes BEGIN/END)

3. Aller sur GitHub : `https://github.com/Nolyo/voice-tool/settings/secrets/actions`

4. Cliquer sur "New repository secret"

5. Créer un secret nommé : `TAURI_SIGNING_PRIVATE_KEY`

6. Coller le contenu de la clé privée

7. Cliquer sur "Add secret"

### 2. Vérifier la clé publique

La clé publique est déjà configurée dans `src-tauri/tauri.conf.json` :

```json
{
  "plugins": {
    "updater": {
      "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEEyQkRFNkUyRjA1MTlGODMKUldTRG4xSHc0dWE5b29ZSDE4Q1V1NzhVVmFuL1hDRlhoQ3p1RnJQMy9DNUlodXlKZmdNRURBU3oK",
      "endpoints": [
        "https://github.com/Nolyo/voice-tool/releases/latest/download/latest.json"
      ]
    }
  }
}
```

**⚠️ IMPORTANT** : Ne modifiez jamais cette clé publique. Elle correspond à la clé privée générée.

## Processus de release

Une fois la clé privée configurée dans GitHub Secrets, le workflow CI/CD s'occupe de tout automatiquement :

### Lors d'un push de tag (ex: `v2.0.2`) :

1. **Build des installateurs** : NSIS, MSI, portable
2. **Signature automatique** : Chaque installateur est signé avec la clé privée
3. **Génération de `latest.json`** : Contient les URLs et signatures
4. **Upload sur GitHub Release** : Tous les fichiers sont publiés

### Fichiers générés :

```
Release v2.0.2/
├── voice-tool-v2.0.2-portable.exe
├── voice-tool-v2.0.2-setup.exe
├── voice-tool-v2.0.2-setup.exe.sig         ← Signature NSIS
├── voice-tool-v2.0.2-setup.msi
├── voice-tool-v2.0.2-setup.msi.sig         ← Signature MSI
├── checksums-v2.0.2.txt
├── latest.json                             ← Manifeste pour l'updater
└── releases.json                           ← Pour le site web
```

## Utilisation côté utilisateur

### Vérification manuelle

1. Ouvrir Voice Tool
2. Aller dans l'onglet **"Mises à jour"**
3. Cliquer sur **"Vérifier les mises à jour"**

### Vérification automatique

L'application vérifie automatiquement au démarrage (si activé dans les paramètres).

### Installation d'une mise à jour

1. Quand une mise à jour est disponible :
   - Un bouton bleu apparaît dans le header : **"Nouvelle version disponible"**
   - OU voir les détails dans l'onglet "Mises à jour"

2. Cliquer sur **"Télécharger et installer"**

3. Une barre de progression s'affiche pendant le téléchargement

4. L'application se ferme et se relance automatiquement avec la nouvelle version

## Paramètres

Dans l'onglet **"Mises à jour"** :

- ✅ **Vérifier automatiquement les mises à jour au démarrage**
  - Si activé : vérification 10 secondes après le lancement
  - Si désactivé : vérification manuelle uniquement

## Sécurité

### Vérification de signature

Chaque mise à jour est vérifiée cryptographiquement AVANT installation :

1. Le client télécharge l'installateur + signature (`.sig`)
2. La signature est vérifiée avec la clé publique intégrée
3. Si la signature est invalide → Installation REFUSÉE
4. Si la signature est valide → Installation autorisée

**Résultat** : Impossible d'installer une mise à jour falsifiée ou modifiée.

### Protocole HTTPS

Tous les téléchargements s'effectuent via HTTPS depuis GitHub Releases.

### Avertissement Windows SmartScreen

⚠️ **Note importante** : L'avertissement Windows SmartScreen lors de la première installation manuelle **persiste** (car Voice Tool n'a pas de certificat de signature de code Windows payant).

**MAIS** : Les mises à jour automatiques depuis l'application fonctionnent **sans avertissement** (car l'app est déjà installée et de confiance).

## Dépannage

### L'application ne trouve pas de mise à jour

- Vérifier que la release GitHub est publiée (pas en draft)
- Vérifier que `latest.json` existe dans la release
- Regarder les logs dans l'onglet "Logs" pour plus de détails

### Erreur de signature

- La clé publique dans `tauri.conf.json` ne correspond pas à la clé privée
- Ou la clé privée dans GitHub Secrets est incorrecte

### Téléchargement échoue

- Vérifier la connexion internet
- Vérifier que l'URL de la release est accessible
- Regarder les logs dans l'onglet "Logs"

## Architecture technique

### Backend (Rust)

- **Module** : `src-tauri/src/updater.rs`
- **Commandes Tauri** :
  - `check_for_updates()` : Vérifie si une nouvelle version existe
  - `download_and_install_update()` : Télécharge et installe

### Frontend (React)

- **Hook** : `src/hooks/useUpdater.ts`
- **Contexte** : `src/contexts/UpdaterContext.tsx` (vérification auto au démarrage)
- **Composant** : `src/components/updater-tab.tsx` (onglet UI)
- **Header** : `src/components/dashboard-header.tsx` (notification)

### Configuration

- **Tauri** : `src-tauri/tauri.conf.json`
- **CI/CD** : `.github/workflows/release.yml`
- **Clés** :
  - Privée : `src-tauri/private.key` (gitignored, secret GitHub)
  - Publique : `src-tauri/private.key.pub` (commitée)

## Commandes utiles

```bash
# Générer une nouvelle paire de clés (NE PAS FAIRE sauf si nécessaire)
pnpm tauri signer generate --write-keys src-tauri/private.key --ci -p ""

# Vérifier que le plugin updater est bien installé
cd src-tauri && cargo tree | grep tauri-plugin-updater

# Tester la compilation
pnpm build
cd src-tauri && cargo check

# Créer une release de test (local)
git tag v2.0.2-test
git push origin v2.0.2-test
```

## Ressources

- [Documentation Tauri Updater](https://v2.tauri.app/plugin/updater/)
- [API Rust](https://docs.rs/tauri-plugin-updater/)
- [GitHub Releases](https://github.com/Nolyo/voice-tool/releases)

---

**Mise à jour** : 24 octobre 2025
