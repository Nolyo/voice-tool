# EPIC v3 — Comptes utilisateurs, sync & service managé

> Document chapeau de l'épique v3. Index navigable.
> Démarré le 2026-04-19 lors d'une session de brainstorming dédiée.

---

## Contexte

Voice Tool est aujourd'hui une app desktop **100% locale**: tout (settings, notes, transcriptions, audio) vit sur la machine de l'utilisateur. Cette posture est la principale promesse de confiance du produit.

La v3 introduit deux changements majeurs qui remettent en cause cette posture:

1. **Comptes utilisateurs + sync cloud** des settings et notes — pour qu'un utilisateur retrouve son setup en changeant de machine.
2. **Service managé optionnel** (transcription via une API maison, abonnement payant) — pour offrir une voie monétisable à ceux qui ne veulent pas gérer leurs propres clés API ni leur propre modèle local.

**Le piège**: dès qu'on synchronise quoi que ce soit, on ouvre une faille potentielle. Une fuite côté serveur peut compromettre des données sensibles. C'est précisément le point flagué comme "à ne pas sous-estimer".

**Objectif**: livrer la v3 sans trahir la promesse de confiance, en documentant chaque décision, en gardant l'usage 100% gratuit/local toujours possible, et en ajoutant un volet premium qui finance la maintenance.

---

## État de l'existant

- **`docs/BACKLOG.md`** définit déjà EPIC-07 (audit sécurité, **bloquant** pour v3) et EPIC-08 (comptes + service payant, v3.0).
- **`docs/research/lemonsqueezy-poc/`** contient un POC technique fonctionnel (HMAC, idempotence, RLS) prouvant que Lemon Squeezy + Supabase peut marcher. Le POC ne couvre **que** le flow billing — pas le sync, pas le chiffrement, pas le proxy.
- **`docs/IDEES_AMELIORATION_2026-04-17.md` section 16** liste les pistes monétisation (crédits transcription, modèles premium, sync, partage, team/enterprise).

---

## Décisions actées (session du 2026-04-19)

Chaque décision est tracée dans un ADR dédié sous [`decisions/`](decisions/).

| # | Décision | ADR |
|---|---|---|
| 1 | Billing: **Lemon Squeezy** (Merchant of Record) | [0001](decisions/0001-lemonsqueezy-vs-stripe.md) |
| 2 | Périmètre sync v3.0: **Settings + notes texte** (pas d'audio, pas d'historique transcriptions) | _(intégré à 02 et 03)_ |
| 3 | Posture chiffrement: **server-side, style Notion** | [0002](decisions/0002-server-side-encryption.md) |
| 4 | Clés API: **jamais syncées** (device-local uniquement) | [0003](decisions/0003-api-keys-device-local.md) |
| 5 | Auth: **Email/password + Magic link + Google OAuth** | [0004](decisions/0004-auth-methods.md) |
| 6 | Flow callback: **page web + deep link** `voice-tool://` | [0005](decisions/0005-callback-flow-web-page.md) |

---

## Découpage en sous-épiques

```
EPIC v3 — Comptes & service managé
│
├── 00 — Threat model & sécurité fondations    ← bloquant, démarrer EN PREMIER
├── 01 — Auth & comptes
├── 02 — Sync settings (sans clés API)
├── 03 — Sync notes
├── 04 — Billing & gating premium
├── 05 — Service managé transcription           ← v3.1+
└── 06 — Onboarding & marketing premium
```

Voir chaque fichier `XX-*.md` pour le détail.

---

## Phasage cible

| Version | Contenu | Promesse marketing |
|---|---|---|
| **v2.x → v2.y** | EPIC-07 audit sécurité (remédiation findings critiques/majeurs) | "On consolide avant d'ouvrir" |
| **v3.0** | 00 + 01 + 02 + 04 (auth + sync settings + billing minimal) | "Crée ton compte, sync tes settings, soutien le projet" |
| **v3.1** | 03 + 06 v1 (sync notes + onboarding) | "Tes notes te suivent partout" |
| **v3.2** | 05 (service managé transcription) | "Plus besoin de gérer une clé OpenAI" |

Rationale: livrer du valeur tôt (settings sync seuls = déjà utile), garder le sujet le plus complexe (proxy modèles) pour quand le reste est stable.

---

## Décisions encore à prendre

| Sujet | Sous-épique | Pourquoi c'est critique |
|---|---|---|
| **Définition de l'offre premium** (quoi est gratuit, quoi est payant) | 04 | Détermine le gating, le pricing, la story marketing. **Premier sujet à brainstormer.** |
| **Threat model formel** (qui on défend contre quoi) | 00 | Doit cadrer toutes les décisions sécu en aval. |
| **Account recovery** (reset email basique? recovery codes? 2FA?) | 01 | UX vs sécu, acceptation du compromis. |
| **Conflict resolution multi-device** | 02 / 03 | Last-write-wins simple vs CRDT (Yjs) costaud. Risque perte de données. |
| **Stack backend confirmé** | transverse | Supabase EU dans le POC mais pas formellement validé. Vendor lock-in à acter. |
| **Migration des données locales existantes** vers cloud à l'opt-in | 02 / 03 | Risque perte. Backup pre-migration obligatoire. |
| **Architecture du proxy modèles** | 05 | Audio = gros payload, latence-sensible. Supabase Edge Functions Deno probablement pas adapté. |

---

## Risques majeurs

1. **Sécurité backend**: dev solo, expertise sécu limitée. Recommandation: **budget audit externe avant la sortie publique de v3.0**.
2. **Account takeover** (password leak) = accès données privées + paiement. **2FA optionnel dès v3.0** probablement non-négociable.
3. **Coûts opérationnels** (Supabase EU + Lemon Squeezy fees + futur infra proxy) peuvent dépasser revenus si peu d'abonnés. À modéliser avant le lancement.
4. **Conflict resolution sync multi-device**: si traité naïvement, perte de données utilisateur silencieuse. Sujet sous-estimé à risque haut.
5. **Migration données locales** vers cloud à l'opt-in: backup automatique pre-migration **obligatoire**.
6. **Vendor lock-in Supabase**: migration future = réécriture conséquente. Acceptable consciemment, à documenter.
7. **GDPR**: registre des traitements, mentions légales, DPA Lemon Squeezy/Supabase, droit à l'oubli effectif (delete account doit purger réellement).

---

## Liens

- [Backlog général](../BACKLOG.md) — EPIC-07 et EPIC-08 macro
- [Idées d'amélioration 2026-04-17](../IDEES_AMELIORATION_2026-04-17.md) — section 16 pour pistes monétisation
- [POC Lemon Squeezy](../research/lemonsqueezy-poc/) — preuve technique existante
- [README de l'épique](README.md) — convention de travail
