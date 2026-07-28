# Version et canal sur l'accueil — Design

**Date** : 2026-07-28
**Statut** : validé, prêt à implémenter sur `feat/home-version-channel-badge`
**Périmètre** : afficher la version installée et son canal (bêta ou stable) sur l'écran
d'accueil, sous forme d'un badge cliquable menant à Settings → À propos.

## 1. Contexte et objectif

La version de l'application n'est aujourd'hui visible qu'après trois clics : Paramètres →
À propos (`AboutSection.tsx`, qui la lit via `getVersion()`), ou Paramètres → Mises à jour
(`UpdaterSection.tsx`, même lecture). Rien sur l'accueil ne dit sur quel binaire on tourne.

Avec un cycle de release qui alterne bêtas (`3.2.0-beta.3`) et stables (`3.2.0`), savoir
d'un coup d'œil laquelle des deux est installée a une valeur directe pour le triage de bug
et la vérification post-mise-à-jour.

L'objectif est donc un affichage permanent, à faible poids visuel, en haut de l'accueil.

## 2. Décision : quel « canal » ?

Le projet porte **deux** notions de canal qui peuvent diverger :

1. **Le canal de la version installée** — dérivé du numéro de version lui-même. Un fait sur
   le binaire en cours d'exécution.
2. **La préférence `update_channel`** (`src/lib/settings.ts:42`, `"stable" | "beta"`) — le
   réglage Settings → Mises à jour, qui décide quelles mises à jour seront proposées.

Elles divergent dès qu'une bêta est installée à la main alors que la préférence est restée
sur `stable`, ou inversement quand la préférence passe sur `beta` avant qu'une bêta ne soit
effectivement installée.

**Décision : on affiche (1), le canal de la version installée.** Le badge répond à « sur
quoi je tourne ? », pas à « qu'est-ce que je recevrai ? ». C'est la seule des deux qui soit
vérifiable depuis l'écran lui-même — le numéro de version affiché juste à côté la démontre.

**Hors périmètre** : signaler la divergence entre (1) et (2). Retenu comme évolution
possible, pas implémenté ici.

## 3. Règle de dérivation du canal

Nouveau module pur `src/lib/version-channel.ts` :

```ts
export type ReleaseChannel = "stable" | "beta";
export function resolveChannel(version: string): ReleaseChannel;
```

**Règle** : si le numéro de version porte un suffixe de pré-version SemVer non vide — tout
ce qui suit le premier `-`, en ignorant un éventuel `+build` — alors `"beta"`, sinon
`"stable"`.

Cette règle unique couvre les quatre suffixes que `.github/workflows/release.yml` traite
déjà comme des prereleases : `-beta`, `-alpha`, `-rc`, `-test`. Ajouter un cinquième
suffixe au workflow ne demandera aucune modification ici.

Le badge reste **binaire** (bêta ou stable), conformément à la demande. Le détail fin n'est
pas perdu : le numéro complet (`v3.2.0-beta.3`) est affiché juste à côté.

**Cas dégradés** : une chaîne vide ou un numéro malformé sans `-` renvoie `"stable"`. C'est
le défaut sûr — l'ambiguïté résiduelle est visible dans le numéro affiché, et la seule
conséquence d'une erreur ici est un badge trompeur, pas un comportement applicatif.

## 4. Composant

Nouveau fichier `src/components/dashboard/home/VersionBadge.tsx`.

**Props** : `{ onOpenAboutPage: () => void }`.

**Chargement de la version** : `getVersion()` de `@tauri-apps/api/app`, via import
dynamique dans un `useEffect` avec flag `cancelled` — le pattern déjà utilisé par
`AboutSection.tsx:19-36` et `UpdaterSection.tsx:34-49`.

**Rendu** : un `<button type="button">` contenant le numéro `v{version}` en classe
`vt-mono`, suivi d'une pastille portant le libellé du canal.

**Couleurs** :

- Stable → neutre : texte `--vt-fg-3` sur fond `--vt-surface-hi`, comme la pastille de
  version déjà présente dans `AboutSection.tsx:71-80`.
- Bêta → `--vt-warn` (l'ambre du design system, `oklch(0.78 0.14 75)` en sombre,
  `oklch(0.58 0.16 75)` en clair), cohérent avec les autres signaux d'attention de l'app.

**Gestion d'erreur** : si `getVersion()` échoue, le composant ne rend rien (`null`) après
avoir loggé en console. Un `Callout` d'erreur n'a pas sa place en tête de l'écran d'accueil,
et `AboutSection` affiche déjà un message d'erreur dédié pour ce cas précis.

**État de chargement** : rien non plus tant que la version n'est pas résolue. L'appel est
local et quasi instantané ; un squelette introduirait un flash pour aucun gain.

## 5. Intégration dans le greeting

`src/components/dashboard/home/GreetingHeader.tsx` reçoit une nouvelle prop
`onOpenAboutPage: () => void`.

La ligne « eyebrow » existante (`GreetingHeader.tsx:37-40`, le point pulsant + le label
`home.heroEyebrow`) passe de `flex items-center gap-2` à un conteneur
`flex items-center justify-between gap-2` : l'eyebrow reste à gauche, le `VersionBadge`
s'aligne à droite. Le titre et la tagline sont inchangés.

Ce placement a été retenu contre un pied de page d'accueil (invisible sans scroll) et
contre une ligne dans `QuickActionsCard` (mélange un état à des actions).

## 6. Câblage

`AccueilTab.tsx` reçoit `onOpenAboutPage` dans ses props et le passe à `GreetingHeader`.

`Dashboard.tsx` fournit, au même endroit que le `onOpenAccountPage` existant
(`Dashboard.tsx:504`) :

```ts
onOpenAboutPage={() => {
  setActiveTab("parametres");
  setActiveSettingsSection("section-a-propos");
}}
```

C'est exactement le mécanisme déjà employé par `onOpenAccountPage` (`Dashboard.tsx:408-411`)
et par `UpdateModal.onViewDetails` (`Dashboard.tsx:539-543`). Aucune nouvelle surface de
navigation n'est introduite.

## 7. i18n

Nouvelles clés sous `home.version.*`, dans `src/locales/fr.json` **et** `src/locales/en.json` :

| Clé | fr | en |
| --- | --- | --- |
| `home.version.channelStable` | `Stable` | `Stable` |
| `home.version.channelBeta` | `Bêta` | `Beta` |
| `home.version.openAbout` | `Version {{version}} — canal {{channel}}. Ouvrir À propos.` | `Version {{version}} — {{channel}} channel. Open About.` |

`openAbout` sert de `title` et d'`aria-label` au bouton.

Les clés existantes `updater.channelStable` / `updater.channelBeta` ne sont **pas**
réutilisées : elles valent « Stable (Production) » et « Beta (Accès anticipé) », des
libellés de sélecteur de réglage, trop longs pour un badge et sémantiquement liés à la
préférence de mise à jour — pas au binaire installé.

Aucune chaîne en dur : tout passe par `useTranslation()`.

## 8. Tests

Vitest sur `src/lib/version-channel.test.ts` :

- `3.2.0` → `stable`
- `3.2.0-beta.3` → `beta`
- `3.2.0-rc.1` → `beta`
- `3.2.0-alpha` → `beta`
- `3.2.0-test.1` → `beta`
- `3.2.0+build.7` → `stable` (métadonnée de build, pas une pré-version)
- `""` → `stable`

La logique décidable est entièrement dans `resolveChannel`. `VersionBadge` n'est que du
câblage (un appel Tauri, un `onClick` déjà couvert par le même pattern ailleurs) et ne
justifie pas de test de rendu dédié.

## 9. Fichiers touchés

**Nouveaux**

- `src/lib/version-channel.ts`
- `src/lib/version-channel.test.ts`
- `src/components/dashboard/home/VersionBadge.tsx`

**Modifiés**

- `src/components/dashboard/home/GreetingHeader.tsx` — prop + layout de la ligne eyebrow
- `src/components/dashboard/tabs/AccueilTab.tsx` — prop relayée
- `src/components/Dashboard.tsx` — handler `onOpenAboutPage`
- `src/locales/fr.json`, `src/locales/en.json` — bloc `home.version`

Aucune modification côté Rust, aucune migration, aucun nouveau réglage persisté.

## 10. Hors périmètre

- Afficher la préférence `update_channel` quand elle diverge du canal installé (§2).
- Un indicateur « mise à jour disponible » sur ce badge — `UpdateAvailableBanner` et le
  bouton de notification du header remplissent déjà ce rôle.
- Distinguer alpha / rc / beta dans le libellé du badge (§3).
