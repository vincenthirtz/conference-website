# ADR 0001 — Modules admin par domaine (`features/admin/<domaine>/`)

- **Statut** : accepté, 2026-09-29
- **Plan** : [PLAN-industrialisation-admin.md](../PLAN-industrialisation-admin.md), lots L2 et L3
- **Pilote** : [`features/admin/free-players/`](../../features/admin/free-players/)

## Contexte

L'admin fait ~210 000 lignes. Il n'existait aucun endroit « normal » pour la logique d'un domaine :
elle finissait dans la page (UI + fetch + état), dans la route API (auth + validation + requêtes
+ règles + journal + réponse) ou dans `utils/` (188 fichiers à plat). 281 routes sur 322
importaient `supabaseAdmin` directement ; les mêmes règles métier étaient réécrites dans
l'admin, le bot et le public.

## Décision

Chaque domaine admin devient un module :

```
features/admin/<domaine>/
├── schemas.ts     zod + types : entrées, sorties (source unique client + serveur)
├── repository.ts  accès base, tenantId OBLIGATOIRE en paramètre, colonnes explicites
├── service.ts     règles métier ; reçoit un ServiceContext { db, tenantId, actor, logger }
├── routes.ts      defineAdminRoute(…) ; ne fait que brancher schémas → service
├── client.ts      appels typés côté navigateur                  (lot L10)
├── hooks/         requêtes / mutations avec cache               (lot L10)
├── ui/            panneaux présentationnels, sans fetch
└── module.ts      nav, permission, fil d'Ariane, palette        (lot L14)
```

`pages/api/admin/**` ne fait que réexporter `routes.ts` ; `pages/admin/**` ne fait que câbler
le module. Next garde son routage par fichiers ; la logique vit dans le module.

### Règles de frontière

Vérifiées par [`tests/unit/adminBoundariesGuard.test.ts`](../../tests/unit/adminBoundariesGuard.test.ts) :

1. `ui/` n'importe ni `utils/supabase`, ni un service, ni un repository, et n'appelle pas `fetch`.
2. `service` et `repository` n'importent pas `next` et ne mentionnent pas `NextApiRequest/Response`.
3. La base est **reçue** (`ctx.db`), jamais importée, hors `ui/`.
4. Un module n'importe pas l'`ui/` ni le `repository` d'un autre module (son `service`, oui).
   Exception : `features/admin/_shared/` (coquille, briques d'archétype Le Ruban, cache de
   requêtes) est le kit commun, importable par tous.
5. Seul le service d'un module lit son repository.
6. Une route `pages/api/admin` migrée tient en ≤ 5 lignes de code (réexport).

### La route déclarative

[`utils/admin/defineAdminRoute.ts`](../../utils/admin/defineAdminRoute.ts) exécute, pour toutes
les routes, dans cet ordre : méthode déclarée (sinon 405 + `Allow`) → CSRF → garde staff (par
route ou par méthode) → rate-limit (préréglages `read`/`write`/`heavy`) → idempotence (par défaut
sur les mutations) → validation zod de `query`/`body` → handler → réponse → journal staff.

- Le handler **retourne** sa réponse ; `RESPONSE_SENT` est l'échappatoire (CSV, flux).
- Une mutation **déclare** son slug de journal (`audit: 'slug'` ou `audit: false`) : l'oubli ne
  compile pas. Le détail vient du handler via `ctx.audit({...})`, écrit **seulement** si le
  handler réussit.
- Les erreurs sont des [`AdminError`](../../utils/admin/errors.ts) levées par le service :
  `{ error, code, fields?, reason?, requestId }`. `error` reste une chaîne — compatibilité avec
  les écrans existants.
- `read({...})` / `mutate({...})` servent à l'inférence : sans eux, `query` et `body` seraient
  `any` dans le handler.
- `handler.adminRoute` expose les métadonnées : la matrice de permissions
  ([`adminRoutePermissionMatrix.test.ts`](../../tests/unit/adminRoutePermissionMatrix.test.ts))
  teste chaque méthode × chaque rôle hors garde sans test écrit à la main ; l'OpenAPI (L9) s'en
  nourrira.

### Tenant

Le service reçoit `ctx.tenantId` = tenant **actif du staff** (résolu par la garde). Le pilote
lisait auparavant le tenant par l'appartenance du staff à une équipe
(`resolveTenantIdForUserRequestAsync`), ce qui n'a pas de sens pour un compte staff ; identique
en mono-tenant, correct en multi-tenant.

## Migration : étrangleur

Pas de big-bang. Le cliquet [`adminDebtRatchet.test.ts`](../../tests/unit/adminDebtRatchet.test.ts)
gèle les compteurs de l'ancien chemin (routes hors `defineAdminRoute`, `supabaseAdmin` direct,
`select('*')`, `req.body as`…) : ils ne peuvent que baisser. Chaque migration regèle
(`npm run admin:metrics -- --write`).

## Conséquences

- (+) Une route migrée obtient auth, CSRF, rate-limit, idempotence, validation, erreurs typées,
  journal et test de permissions sans les écrire.
- (+) Les services sont testables sans HTTP et réutilisables par les routes bot / cron.
- (−) Deux façons de faire coexistent pendant la migration — borné par le cliquet.
- (−) `read()`/`mutate()` sont un détail de typage à connaître.
