# Badge version + canal sur l'accueil — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher la version installée et son canal (bêta ou stable) dans la ligne « eyebrow » de l'écran d'accueil, sous forme d'un badge cliquable menant à Paramètres → À propos.

**Architecture:** Un module pur `resolveChannel(version)` dérive le canal du numéro de version (suffixe SemVer de pré-version → `beta`, sinon `stable`). Un composant `VersionBadge` lit la version via `getVersion()` de Tauri, appelle ce module, et rend un bouton. Le badge est monté dans `GreetingHeader`, qui reçoit un callback relayé depuis `Dashboard` via `AccueilTab`.

**Tech Stack:** React 19 + TypeScript, Tailwind CSS v4 avec tokens CSS `--vt-*`, react-i18next, `@tauri-apps/api/app`, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-28-home-version-channel-badge-design.md`

## Global Constraints

- **Aucune chaîne UI en dur.** Tout texte affiché — y compris `title` et `aria-label` — passe par `useTranslation()`. Toute clé ajoutée à `src/locales/fr.json` doit l'être aussi à `src/locales/en.json`.
- **Commits conventionnels en anglais**, courts et précis : `<type>: <message>` (`feat`, `fix`, `docs`, `refactor`, `test`, `chore`).
- **Branche de travail** : `feat/home-version-channel-badge` (déjà créée, la spec y est commitée). Ne jamais committer directement sur `main`.
- **Couleurs** : uniquement les tokens `--vt-*` existants de `src/App.css`. Le mélange de teintes suit le pattern déjà en place dans `src/components/dashboard/home/` : `color-mix(in oklab, var(--vt-X) N%, transparent)`.
- **Suite de tests** : `pnpm test` (= `vitest run`). Elle doit rester verte à la fin de chaque tâche.
- **Ne pas lancer `pnpm tauri dev`** — c'est à l'utilisateur de le faire.

---

### Task 1: Dérivation du canal depuis le numéro de version

Module pur, sans dépendance React ni Tauri. C'est la seule logique décidable de la feature, donc elle est isolée et testée à part.

**Files:**
- Create: `src/lib/version-channel.ts`
- Test: `src/lib/version-channel.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `export type ReleaseChannel = "stable" | "beta"` et `export function resolveChannel(version: string): ReleaseChannel`. La Task 2 importe les deux depuis `@/lib/version-channel`.

- [ ] **Step 1: Écrire le test qui échoue**

Créer `src/lib/version-channel.test.ts` :

```ts
import { describe, it, expect } from "vitest";
import { resolveChannel } from "./version-channel";

describe("resolveChannel", () => {
  it("reports a plain release as stable", () => {
    expect(resolveChannel("3.2.0")).toBe("stable");
  });

  it("reports every pre-release suffix we publish as beta", () => {
    // release.yml publishes -beta / -alpha / -rc / -test as GitHub
    // prereleases. The badge collapses all four into one "beta" label; the
    // full version number shown next to it carries the fine detail.
    expect(resolveChannel("3.2.0-beta.3")).toBe("beta");
    expect(resolveChannel("3.2.0-rc.1")).toBe("beta");
    expect(resolveChannel("3.2.0-alpha")).toBe("beta");
    expect(resolveChannel("3.2.0-test.1")).toBe("beta");
  });

  it("ignores SemVer build metadata", () => {
    // `+build.7` is not a pre-release: 3.2.0+build.7 IS the stable 3.2.0.
    // Stripping it first also protects against a dash inside the metadata.
    expect(resolveChannel("3.2.0+build.7")).toBe("stable");
    expect(resolveChannel("3.2.0+build-7")).toBe("stable");
    expect(resolveChannel("3.2.0-beta.3+build.7")).toBe("beta");
  });

  it("falls back to stable on empty or malformed input", () => {
    // Safe default: the badge sits next to the version number, so a wrong
    // guess is visible, and nothing in the app branches on the channel.
    expect(resolveChannel("")).toBe("stable");
    expect(resolveChannel("3.2.0-")).toBe("stable");
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
pnpm exec vitest run src/lib/version-channel.test.ts
```

Attendu : ÉCHEC, avec une erreur de résolution du type `Failed to resolve import "./version-channel"` — le module n'existe pas encore.

- [ ] **Step 3: Écrire l'implémentation minimale**

Créer `src/lib/version-channel.ts` :

```ts
export type ReleaseChannel = "stable" | "beta";

/**
 * Derives the release channel from the installed version string.
 *
 * A non-empty SemVer pre-release suffix — anything after the first `-`, once
 * `+build` metadata is stripped — means we are running a pre-release build.
 * This single rule covers the four suffixes release.yml already publishes as
 * GitHub prereleases (-beta, -alpha, -rc, -test), and any fifth one added
 * later, without touching this file.
 *
 * Note this is the channel of the *installed binary*, not the `update_channel`
 * setting. The two can diverge (a beta installed by hand while the preference
 * stays on stable); this answers "what am I running?".
 */
export function resolveChannel(version: string): ReleaseChannel {
  const withoutBuild = version.split("+")[0];
  const dash = withoutBuild.indexOf("-");
  if (dash === -1) return "stable";
  return withoutBuild.slice(dash + 1).length > 0 ? "beta" : "stable";
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
pnpm exec vitest run src/lib/version-channel.test.ts
```

Attendu : PASS — 4 tests.

- [ ] **Step 5: Vérifier que la suite complète reste verte**

```bash
pnpm test
```

Attendu : aucun test en échec.

- [ ] **Step 6: Commit**

```bash
git add src/lib/version-channel.ts src/lib/version-channel.test.ts
git commit -m "feat: derive release channel from version string"
```

---

### Task 2: Composant VersionBadge et clés i18n

Le badge lui-même, autonome et testable visuellement une fois monté (Task 3). Les clés i18n sont dans cette tâche parce que le composant ne compile pas utilement sans elles.

**Files:**
- Create: `src/components/dashboard/home/VersionBadge.tsx`
- Modify: `src/locales/fr.json` (bloc `home`, après `heroSubtitle`)
- Modify: `src/locales/en.json` (bloc `home`, après `heroSubtitle`)

**Interfaces:**
- Consumes: `resolveChannel` de `@/lib/version-channel` (Task 1). Le type `ReleaseChannel` n'a pas besoin d'être importé : la valeur de retour est comparée en ligne à `"beta"`.
- Produces: `export function VersionBadge(props: { onOpenAboutPage: () => void })`. La Task 3 l'importe depuis `@/components/dashboard/home/VersionBadge`.

- [ ] **Step 1: Ajouter les clés i18n françaises**

Dans `src/locales/fr.json`, le bloc `"home"` commence par `heroEyebrow`, `heroTitle`, `heroSubtitle`, puis `"account"`. Insérer le bloc `"version"` entre `heroSubtitle` et `"account"` :

```json
    "heroSubtitle": "Un coup d'œil sur ton compte, ta synchronisation et tes dernières notes.",
    "version": {
      "channelStable": "Stable",
      "channelBeta": "Bêta",
      "openAbout": "Version {{version}} — canal {{channel}}. Ouvrir À propos."
    },
    "account": {
```

Les clés existantes `updater.channelStable` / `updater.channelBeta` ne sont pas réutilisées : elles valent « Stable (Production) » et « Beta (Accès anticipé) », trop longues pour un badge et liées à la préférence de mise à jour, pas au binaire installé.

- [ ] **Step 2: Ajouter les clés i18n anglaises**

Dans `src/locales/en.json`, au même endroit du bloc `"home"` :

```json
    "heroSubtitle": "A glance at your account, your sync status and your latest notes.",
    "version": {
      "channelStable": "Stable",
      "channelBeta": "Beta",
      "openAbout": "Version {{version}} — {{channel}} channel. Open About."
    },
    "account": {
```

- [ ] **Step 3: Vérifier que les deux fichiers de locale sont du JSON valide**

```bash
node -e "const fr=require('./src/locales/fr.json'),en=require('./src/locales/en.json');console.log(JSON.stringify(fr.home.version),JSON.stringify(en.home.version))"
```

Attendu : les deux objets `version` s'affichent (3 clés chacun), sans erreur de parsing. Une virgule manquante ou en trop dans le JSON fait échouer cette commande.

- [ ] **Step 4: Écrire le composant**

Créer `src/components/dashboard/home/VersionBadge.tsx` :

```tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { resolveChannel } from "@/lib/version-channel";

interface VersionBadgeProps {
  /** Opens Settings → About, where the full version and the updater live. */
  onOpenAboutPage: () => void;
}

/**
 * Installed version and its channel, in the home screen's eyebrow row.
 *
 * The channel comes from the version string itself, not from the
 * `update_channel` setting: this answers "what am I running?", and the number
 * displayed right next to it is the proof. Renders nothing until the version
 * resolves — and nothing at all if it fails, since Settings → About already
 * owns the loud error path for that exact failure.
 */
export function VersionBadge({ onOpenAboutPage }: VersionBadgeProps) {
  const { t } = useTranslation();
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { getVersion } = await import("@tauri-apps/api/app");
        const v = await getVersion();
        if (!cancelled) setVersion(v);
      } catch (err) {
        console.error("Failed to get app version:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!version) return null;

  const channel = resolveChannel(version);
  const channelLabel =
    channel === "beta"
      ? t("home.version.channelBeta")
      : t("home.version.channelStable");
  const label = t("home.version.openAbout", {
    version,
    channel: channelLabel,
  });

  return (
    <button
      type="button"
      onClick={onOpenAboutPage}
      title={label}
      aria-label={label}
      className="flex items-center gap-1.5 shrink-0 rounded px-1 py-0.5 transition-opacity hover:opacity-75"
    >
      <span className="vt-mono text-[10.5px] tracking-normal text-[var(--vt-fg-4)]">
        v{version}
      </span>
      <span
        className="text-[9.5px] font-semibold uppercase tracking-[0.1em] rounded px-1.5 py-0.5"
        style={
          channel === "beta"
            ? {
                background:
                  "color-mix(in oklab, var(--vt-warn) 18%, transparent)",
                color: "var(--vt-warn)",
              }
            : { background: "var(--vt-surface-hi)", color: "var(--vt-fg-3)" }
        }
      >
        {channelLabel}
      </span>
    </button>
  );
}
```

Notes sur les choix de style, à ne pas modifier sans raison :
- `tracking-normal` sur le numéro annule le `tracking-[0.16em]` hérité de la ligne eyebrow, qui rendrait le monospace illisible.
- `shrink-0` empêche le badge d'être écrasé par le label eyebrow sur fenêtre étroite.
- Le pattern `color-mix(in oklab, var(--vt-X) N%, transparent)` est celui déjà utilisé dans `HeroDictationCard.tsx:103`, `QuickActionsCard.tsx:79` et `SubscriptionCard.tsx:207`.

- [ ] **Step 5: Vérifier que TypeScript compile**

```bash
pnpm exec tsc --noEmit
```

Attendu : aucune erreur. Le composant n'est pas encore monté — c'est normal, il n'est pas signalé comme inutilisé (`noUnusedLocals` ne s'applique pas aux exports).

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/home/VersionBadge.tsx src/locales/fr.json src/locales/en.json
git commit -m "feat: add version and channel badge component"
```

---

### Task 3: Monter le badge dans l'accueil et le câbler vers À propos

Fait apparaître le badge à l'écran et rend le clic fonctionnel. C'est la tâche qui produit le résultat visible.

**Files:**
- Modify: `src/components/dashboard/home/GreetingHeader.tsx:35-52` (le JSX retourné)
- Modify: `src/components/dashboard/tabs/AccueilTab.tsx:11-53` (props + appel de `GreetingHeader`)
- Modify: `src/components/Dashboard.tsx:491-508` (props passées à `AccueilTab`)

**Interfaces:**
- Consumes: `VersionBadge` de `@/components/dashboard/home/VersionBadge` (Task 2).
- Produces: la prop `onOpenAboutPage: () => void` sur `GreetingHeader` et sur `AccueilTab`.

- [ ] **Step 1: Ajouter la prop et le badge à GreetingHeader**

Dans `src/components/dashboard/home/GreetingHeader.tsx`, ajouter l'import en tête de fichier, à la suite des imports existants :

```tsx
import { VersionBadge } from "@/components/dashboard/home/VersionBadge";
```

Remplacer la signature `export function GreetingHeader() {` par :

```tsx
interface GreetingHeaderProps {
  /** Opens Settings → About from the version badge. */
  onOpenAboutPage: () => void;
}

export function GreetingHeader({ onOpenAboutPage }: GreetingHeaderProps) {
```

Puis remplacer le bloc de la ligne eyebrow — actuellement :

```tsx
      <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[var(--vt-fg-4)]">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--vt-accent)] vt-anim-pulse-dot" />
        {t("home.heroEyebrow")}
      </div>
```

par :

```tsx
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[var(--vt-fg-4)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--vt-accent)] vt-anim-pulse-dot" />
          {t("home.heroEyebrow")}
        </div>
        <VersionBadge onOpenAboutPage={onOpenAboutPage} />
      </div>
```

Le titre `<h1>` et la tagline `<p>` qui suivent sont inchangés.

- [ ] **Step 2: Relayer la prop dans AccueilTab**

Dans `src/components/dashboard/tabs/AccueilTab.tsx`, ajouter à l'interface `AccueilTabProps`, juste après `onOpenAccountPage: () => void;` :

```tsx
  onOpenAboutPage: () => void;
```

Ajouter `onOpenAboutPage,` à la déstructuration des paramètres, après `onOpenAccountPage,`.

Puis remplacer `<GreetingHeader />` par :

```tsx
      <GreetingHeader onOpenAboutPage={onOpenAboutPage} />
```

- [ ] **Step 3: Fournir le handler depuis Dashboard**

Dans `src/components/Dashboard.tsx`, dans le rendu de `<AccueilTab .../>`, ajouter après le bloc `onOpenAccountPage` :

```tsx
                      onOpenAboutPage={() => {
                        setActiveTab("parametres");
                        setActiveSettingsSection("section-a-propos");
                      }}
```

C'est le mécanisme déjà utilisé par `onOpenAccountPage` juste au-dessus (avec `"section-compte"`) et par `UpdateModal.onViewDetails` plus bas dans le même fichier.

- [ ] **Step 4: Vérifier que TypeScript compile**

```bash
pnpm exec tsc --noEmit
```

Attendu : aucune erreur. Si `GreetingHeader` est rendu ailleurs que dans `AccueilTab`, la compilation le signalera ici comme prop manquante — dans ce cas, fournir le même handler à cet appelant.

- [ ] **Step 5: Vérifier que la suite de tests reste verte**

```bash
pnpm test
```

Attendu : aucun test en échec.

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/home/GreetingHeader.tsx src/components/dashboard/tabs/AccueilTab.tsx src/components/Dashboard.tsx
git commit -m "feat: show version and channel badge on home screen"
```

- [ ] **Step 7: Vérification visuelle par l'utilisateur**

Demander à l'utilisateur de lancer `pnpm tauri dev` et de confirmer sur l'écran d'accueil :

1. Le badge apparaît à droite de la ligne « ACCUEIL », aligné avec elle.
2. Il affiche `v3.2.0` suivi de la pastille `STABLE` en gris neutre (la version courante de `tauri.conf.json` est `3.2.0`).
3. Un clic ouvre Paramètres → À propos.
4. Le badge reste lisible en thème clair comme en thème sombre.
5. En réduisant la largeur de la fenêtre, le badge n'est ni tronqué ni superposé au label eyebrow.

Le rendu bêta ne peut pas être vérifié sans build de pré-version ; il est couvert par les tests unitaires de la Task 1. Ne pas lancer `pnpm tauri dev` soi-même — c'est à l'utilisateur.

---

## Après le plan

Une fois les trois tâches terminées et la vérification visuelle validée, la branche `feat/home-version-channel-badge` est prête pour une PR vers `main` (la branche `main` est protégée : jamais de push direct).
