# Harmonisation du feedback des boutons "Copier"

## Contexte

L'app a 4 points de copie dans le presse-papiers avec 3 comportements différents :

| # | Emplacement | Feedback actuel |
|---|---|---|
| 1 | `NotesEditorFooter.tsx` — footer notes | Icon swap Copy→Check + label "Copier"→"Copié" (1.5s) + toast sonner |
| 2 | `LogsTab.tsx` — icône copie par ligne | Toast custom `fixed bottom-5` (vt-fade-up, 1.6s) |
| 3 | `TranscriptionDetails.tsx` — bouton primary | **Aucun** |
| 4 | `TranscriptionList.tsx` — icône par ligne | **Aucun** |

Cause racine pour #3 et #4 : ils passent par `Dashboard.handleCopy` (`src/components/Dashboard.tsx:160`) qui n'émet aucun retour visuel.

L'utilisateur rapporte que cliquer sur ces boutons ne donne pas confiance que la copie a eu lieu.

## Objectif

Un seul pattern de feedback, moderne et cohérent, pour toutes les actions de copie.

## Design

### Hook `useCopyToClipboard`

Nouveau fichier `src/hooks/useCopyToClipboard.ts` :

```ts
export function useCopyToClipboard() {
  const { t } = useTranslation();
  const [justCopied, setJustCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const copy = useCallback(async (text: string, opts?: { html?: string }) => {
    try {
      if (opts?.html) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([opts.html], { type: "text/html" }),
            "text/plain": new Blob([text], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      toast.success(t("common.copied"));
      setJustCopied(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setJustCopied(false), 1500);
      return true;
    } catch {
      toast.error(t("common.copyFailed"));
      return false;
    }
  }, [t]);

  return { copy, justCopied };
}
```

### Application

**Pattern visuel unifié** :
- **Toast sonner** `t("common.copied")` = "Copié" pour chaque copie réussie (bottom-right, déjà configuré dans `App.tsx`).
- **Feedback inline** *additionnel* 1.5s :
  - Boutons avec label (`TranscriptionDetails` primary, `NotesEditorFooter`) : icône Copy→Check (`color: var(--vt-ok)`) + label "Copier"→"Copié"
  - Boutons icon-only (`TranscriptionList` row, `LogsTab` row) : icône Copy→Check uniquement

**Chaque composant possède son copy** (plus de prop `onCopy` remontant à Dashboard) :

1. `src/components/Dashboard.tsx` — supprimer `handleCopy` (ligne 160) et ne plus passer `onCopy`/`onCopyContent` aux enfants.
2. `src/components/dashboard/transcription/TranscriptionDetails.tsx` — enlever la prop `onCopy`, utiliser le hook localement pour le bouton primary "Copier".
3. `src/components/dashboard/transcription/TranscriptionList.tsx` — `TimelineRow` utilise le hook pour son icône ; la prop `onCopy` devient inutile côté parent.
4. `src/components/dashboard/tabs/HistoriqueTab.tsx` — enlever la prop `onCopy` qu'elle ne fait que forwarder.
5. `src/components/logs/LogsTab.tsx` — utiliser le hook, supprimer l'état local `copied`, le `setTimeout`, et le `<div>` custom toast (lignes 543–562). Ceci supprime aussi la clé i18n `logs.copiedToast`.
6. `src/components/notes/NotesEditor/NotesEditorFooter.tsx` — utiliser le hook (variante HTML). Supprime la key `notes.editor.copiedToClipboard` (remplacée par `common.copied`).
7. `src/components/notes/NotesEditor/NotesEditor.tsx` — enlever la prop `onCopyContent`.

### i18n

- `common.copy` — "Copier" / "Copy" (existe déjà)
- `common.copied` — "Copié" / "Copied" (existe déjà)
- **Nouveau** `common.copyFailed` — "Impossible de copier" / "Copy failed"
- **Supprimés** (redondants) : `logs.copiedToast`, `notes.editor.copiedToClipboard`

## Tests manuels

1. Ouvrir l'app, créer une transcription, cliquer sur l'icône copier dans la timeline → toast "Copié" apparaît + icône verte 1.5s.
2. Sélectionner une transcription, cliquer sur le bouton primary "Copier" → toast + label "Copier"→"Copié" + icône verte 1.5s.
3. Ouvrir les logs (settings > logs), cliquer icône copier sur une ligne → toast "Copié" + icône verte 1.5s (plus de toast custom centré).
4. Ouvrir une note, cliquer "Copier" dans le footer → toast + label+icône swappés 1.5s ; contenu HTML collé avec formatage dans un éditeur riche.
5. Ctrl+V dans un champ externe → texte effectivement collé.
6. Couper clipboard (navigateur sans permission) → toast d'erreur "Impossible de copier".

## YAGNI

- Pas de mutualisation du `toast.success` via un wrapper : `sonner` est déjà global.
- Pas de variante "copy icon-only" helper composant : le duo `{ copy, justCopied }` suffit, le JSX reste sur place.
- Pas d'animations au-delà du swap d'icône : la toast sonner offre déjà la micro-animation.
