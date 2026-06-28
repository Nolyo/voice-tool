# POC LemonSqueezy (NOL-32)

Preuve de concept pour la sous-tâche 3 du spike v3 ([NOL-29](/NOL/issues/NOL-29)).

Objectif : valider bout-en-bout que l'on peut ouvrir un checkout LemonSqueezy depuis Tauri, recevoir le webhook, et mettre à jour une table `subscriptions` en Supabase.

## Arborescence

```
lemonsqueezy-poc/
├── QUICKSTART.md                               # comment rejouer le test en local
├── README.md
├── supabase/
│   ├── migrations/0001_subscriptions.sql       # schéma + RLS
│   └── functions/lemonsqueezy-webhook/
│       └── index.ts                            # Edge Function (Deno) + HMAC
├── tauri-snippets/
│   └── lemonsqueezy_checkout.rs                # commande Tauri open_checkout
├── frontend-snippets/
│   └── SubscribeButton.tsx                     # bouton React qui invoke la cmd
└── tests/
    ├── fixtures/subscription_created.json      # payload LS pour test local
    └── sign-fixture.sh                         # signe + POST sur le webhook
```

## À lire en premier

`QUICKSTART.md` — procédure complète pour refaire tourner le test.

## Dépendances externes (non fournies par le POC)

- Compte LemonSqueezy en mode Test + webhook secret partagé
- Projet Supabase EU (voir [NOL-30](/NOL/issues/NOL-30))
- Supabase auth pour disposer d'un `user_id` à passer en `custom_data`

## Décisions retenues (à challenger lors du Go/No-Go v3)

- **Webhook côté Supabase Edge Function** (Deno) plutôt qu'une route Next.js : cohérent avec la stack du POC (Supabase EU, pas de backend Node séparé).
- **Ouverture navigateur système** via `tauri-plugin-opener` : l'embed WebView LS ne supporte pas le checkout dans un iframe Tauri, et le flow 3DSecure / Apple Pay / Google Pay exige un vrai navigateur.
- **`user_id` transporté en `custom_data`** : pas de dépendance LS ↔ Supabase (pas d'appel LS API depuis l'Edge Function).
- **Upsert idempotent** sur `provider_subscription_id` : tolère les retries webhook sans double-compter.
