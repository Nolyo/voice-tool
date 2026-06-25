# Contrat — Page publique `lexena.app/s/:slug`

> **Pour le repo marketing-site (Cloudflare Pages).** Ce document décrit l'interface
> exacte que le repo `voice-tool` expose pour la page publique de partage de notes.
> L'équipe marketing-site doit l'implémenter telle quelle ; toute déviation sur la
> sanitization ou le CSP introduit un risque XSS.

---

## 1. Route

```
https://lexena.app/s/:slug
```

- Le paramètre `:slug` est une chaîne base62 de 16 caractères (charset `[A-Za-z0-9]`).
- Un slug plus court ou plus long, ou contenant un caractère hors base62, doit être
  traité comme une 404 côté page (l'Edge Function renverra de toute façon 400 ou 404).

---

## 2. Endpoint `share-view`

### Requête

```
GET https://<project-ref>.supabase.co/functions/v1/share-view?s=<slug>
```

En-têtes obligatoires :

| En-tête      | Valeur                              |
|--------------|-------------------------------------|
| `apikey`     | `<VITE_SUPABASE_PUBLISHABLE_KEY>`   |

> La clé publique (`publishable key`) est suffisante — l'endpoint est anonyme
> (`verify_jwt = false`). Ne jamais exposer la clé service role ici.

### Réponses

| Code | Corps JSON                                      | Signification                                               |
|------|-------------------------------------------------|-------------------------------------------------------------|
| 200  | `{ title: string, contentHtml: string, updatedAt: string }` | Note partagée active trouvée. `updatedAt` est une chaîne ISO 8601. |
| 400  | `{ error: "invalid_slug" }`                     | Le slug ne respecte pas le format base62 / longueur attendue. |
| 404  | `{ error: "not_found" }`                        | Slug inconnu, révoqué, ou note supprimée (message neutre — pas de distinction pour éviter l'oracle d'énumération). |
| 500  | `{ error: "internal" }`                         | Erreur serveur inattendue.                                  |

> `contentHtml` est le HTML brut TipTap tel que stocké côté serveur. Il **n'est pas
> pré-sanitisé** — la sanitization est une responsabilité de la page publique (§4).

---

## 3. CORS

L'Edge Function autorise exactement les origines suivantes (définies dans
`supabase/functions/_shared/cors-public.ts`) :

- `https://lexena.app`
- `https://www.lexena.app`
- `http://localhost:5173`
- `http://localhost:1420`

Aucun autre domaine ni port n'est autorisé. Un serveur de dev marketing-site
tournant sur un port différent (ex. `:3000`) doit être ajouté dans `cors-public.ts`
avant de tester localement. Si la page publique est hébergée sous un autre domaine
ou sous-domaine, contacter l'équipe `voice-tool` pour ajuster la liste.

---

## 4. Sanitization et aplatissement — OBLIGATOIRE

**Ne jamais rendre `contentHtml` brut dans le DOM.** Le contenu est du HTML arbitraire
produit par l'éditeur TipTap de l'utilisateur et peut contenir des payloads XSS.

### 4.1 Copier `render-html.ts` et son test

Copier dans le repo marketing-site les deux fichiers suivants tels quels :

- **Implémentation** : `src/lib/sharing/render-html.ts` (ce repo)
- **Tests Vitest** : `src/lib/sharing/render-html.test.ts` (ce repo)

Ne pas réécrire la logique : la liste blanche, le hook `afterSanitizeAttributes` et
la regex `ALLOWED_URI_REGEXP` sont les seuls paramètres validés par les tests de
sécurité.

### 4.2 Comportement de `renderSharedNoteHtml(rawHtml)`

La fonction effectue deux passes dans l'ordre suivant :

1. **Aplatissement des wiki-links** : les éléments `<a data-note-link>` sont remplacés
   par leur texte brut (`textContent`). La note cible n'est pas partagée ; le lien
   ne doit pas être cliquable ni laisser fuiter un UUID de note.

2. **Sanitization DOMPurify** avec :
   - `ALLOWED_URI_REGEXP` : autorise `https:`, `mailto:`, `data:image/<raster>;base64,`
     uniquement.
   - `FORBID_TAGS` : `style`, `script`, `iframe`, `object`, `embed`.
   - Hook `afterSanitizeAttributes` : supprime tout attribut `src` commençant par
     `data:` qui ne correspond pas à `ALLOWED_URI_REGEXP` (bloque `data:image/svg+xml`
     et autres vecteurs de contournement DOMPurify ≤ 3.x).

> Cette fonction est **browser-only** (requiert `DOMParser` et `DOMPurify`). Ne pas
> l'appeler dans un contexte SSR/Node sans DOM.

---

## 5. En-tête CSP

La page publique doit définir le `Content-Security-Policy` suivant :

```
default-src 'self'; script-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'
```

Justification de chaque directive :

| Directive               | Valeur              | Raison                                                                 |
|-------------------------|---------------------|------------------------------------------------------------------------|
| `default-src`           | `'self'`            | Interdit par défaut toute ressource externe.                           |
| `script-src`            | `'self'`            | Bloque tout script inline ou externe issu du contenu de la note.       |
| `img-src`               | `'self' data:`      | Autorise les images base64 inline (usage normal de l'éditeur TipTap).  |
| `style-src`             | `'self' 'unsafe-inline'` | Permet les styles inline du rendu HTML (TipTap peut en émettre). |

---

## 6. États de la page

### 6.1 Chargement

Afficher un état de chargement neutre (spinner ou squelette) pendant la requête `share-view`.

### 6.2 Succès (200)

- Afficher `title` dans un `<h1>` ou équivalent sémantique.
- Afficher `renderSharedNoteHtml(contentHtml)` dans un conteneur `<div>` avec
  `innerHTML` (après sanitization — ne pas oublier le passage par `render-html.ts`).
- Afficher `updatedAt` formatée en texte lisible (ex. : « Dernière mise à jour le 12 juin 2026 »).
- Inclure un CTA discret « Créé avec Lexena » pointant vers `https://lexena.app`.

### 6.3 Lien révoqué ou inexistant (404)

Afficher le message :

> **Ce lien n'existe plus ou a été désactivé.**

Pas de redirection. Pas de suggestion de lien alternatif.

### 6.4 Erreur réseau ou 500

Afficher un message d'erreur générique (ex. : « Impossible de charger ce contenu. Réessayez plus tard. »). Logger l'erreur en console pour diagnostic.

---

## 7. Exemple d'intégration (pseudo-code)

```ts
import { renderSharedNoteHtml } from "@/lib/sharing/render-html";

const res = await fetch(
  `https://${SUPABASE_PROJECT_REF}.supabase.co/functions/v1/share-view?s=${slug}`,
  { headers: { apikey: SUPABASE_PUBLISHABLE_KEY } }
);

if (res.status === 404) {
  showNotFound(); // "Ce lien n'existe plus ou a été désactivé."
  return;
}
if (!res.ok) {
  showError();
  return;
}

const { title, contentHtml, updatedAt } = await res.json();
document.querySelector("h1").textContent = title;
document.querySelector("#note-body").innerHTML = renderSharedNoteHtml(contentHtml);
```

---

## 8. Variables d'environnement requises

| Variable                      | Description                                                |
|-------------------------------|------------------------------------------------------------|
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Clé publishable du projet Supabase Lexena (pas la service role key). |
| `SUPABASE_PROJECT_REF`        | Identifiant du projet Supabase (ex. : `abcdefghijklmnop`). |

---

## 9. Sécurité — rappels

- **Ne jamais** utiliser la `service_role` key côté navigateur.
- **Ne jamais** sauter l'étape `renderSharedNoteHtml` : c'est la barrière XSS.
- Le slug est opaque (~95 bits d'entropie). Ne pas construire de répertoire ou de
  sitemap basé sur les slugs (énumération rendue difficile ; ne pas l'aider).
- Les URLs révoquées sont **définitivement mortes** (nouveau slug au re-partage).
  Ne pas mettre en cache agressivement côté CDN (recommandé : `Cache-Control: no-store`
  ou TTL court ≤ 60s pour éviter de servir du contenu révoqué).

---

## Liens croisés

- Design : [`docs/superpowers/specs/2026-06-25-note-public-sharing-design.md`](../superpowers/specs/2026-06-25-note-public-sharing-design.md)
- ADR : [`docs/v3/decisions/0018-note-public-sharing.md`](./decisions/0018-note-public-sharing.md)
- Fichier source à copier : `src/lib/sharing/render-html.ts`
