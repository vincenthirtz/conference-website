# Plan — industrialisation de l'espace admin (20 lots)

> Établi le 2026-09-29. Périmètre : `pages/admin/*`, `components/admin/*`, `pages/api/admin/*`,
> les hooks admin (`hooks/useAdmin*`) et les utils serveur qu'ils appellent.
>
> Ce plan **succède** à [PLAN-espace-admin.md](./PLAN-espace-admin.md) (A1–A8, fonctionnel, livré)
> et à [ADMIN_CONSOLIDATION.md](./ADMIN_CONSOLIDATION.md) (navigation / hubs, livré). Ceux-là
> ont ajouté ce qui manquait au staff ; celui-ci traite **la manière dont l'admin est construit** :
> aujourd'hui chaque écran et chaque route réinvente sa plomberie, et c'est ce qui rend chaque
> correctif de soir de match lent et risqué.
>
> Légende — **Impact** : 🟥 élevé · 🟧 moyen · 🟩 faible · **Effort** : S (< 1 h) · M (qq h) ·
> L (1–2 j) · XL (plusieurs sessions).

---

## 1. Diagnostic chiffré (2026-09-29)

### Taille

| Zone | Fichiers | LOC | Au-dessus du seuil |
|---|---|---|---|
| `pages/admin` | 133 | ~60 700 | **20 pages > 800** |
| `components/admin` | 312 | ~77 300 | **26 composants > 600** |
| `pages/api/admin` | 322 | ~70 600 | **14 routes > 500** |
| **Total** | 767 | **~208 600** | |

Les dix plus lourds, là où se concentre le risque :

| Fichier | LOC | `useState` |
|---|---|---|
| [`tasks/index.tsx`](../pages/admin/tasks/index.tsx) | 2 683 | **61** |
| [`tournament-simulator.tsx`](../pages/admin/tournament-simulator.tsx) | 2 433 | 24 |
| [`users/manage.tsx`](../pages/admin/users/manage.tsx) | 2 379 | 33 |
| [`tournament/[id]/matches.tsx`](../pages/admin/tournament/[id]/matches.tsx) | 2 246 | 38 |
| [`teams/my.tsx`](../pages/admin/teams/my.tsx) | 1 751 | 28 |
| [`tournament/[id]/dashboard.tsx`](../pages/admin/tournament/[id]/dashboard.tsx) | 1 614 | 23 |
| [`demandes/index.tsx`](../pages/admin/demandes/index.tsx) | 1 614 | — |
| [`teams/[teamId]/edit.tsx`](../pages/admin/teams/[teamId]/edit.tsx) | 1 497 | **45** |
| [`matches/[matchId]/edit.tsx`](../pages/admin/matches/[matchId]/edit.tsx) | 1 312 | 28 |
| [`events/[runId]/director.tsx`](../pages/admin/events/[runId]/director.tsx) | 1 262 | — |

Côté API : [`demandes/index.ts`](../pages/api/admin/demandes/index.ts) (1 355),
[`users/manage.ts`](../pages/api/admin/users/manage.ts) (1 085),
[`tcg/overview.ts`](../pages/api/admin/tcg/overview.ts) (874),
[`matches/[matchId].ts`](../pages/api/admin/matches/[matchId].ts) (871).

### Ce qui fait « monolithe » — les symptômes, pas la taille

| Symptôme | Mesure | Conséquence |
|---|---|---|
| Aiguillage par méthode fait à la main | **322 / 322** routes testent `req.method` | chaque route recâble auth, rate-limit, idempotence, validation, log, réponse |
| Logique métier dans le handler | **281 / 322** routes importent `supabaseAdmin` directement | rien n'est réutilisable entre admin, bot et public ; rien n'est testable sans mocker HTTP |
| Validation d'entrée hétérogène | zod dans **72** routes, `req.body as …` à **90** endroits | le reste valide à la main, ou pas |
| Idempotence opt-in | **74** routes sur 322 | un double clic sur les autres = double écriture |
| Lectures non typées | `select('*')` × **101**, aucun type Supabase généré | une colonne renommée casse en prod, pas au typecheck (cf. mémoire « mock sans validation de colonne ») |
| Forme d'erreur libre | `{ error: '…' }` × **1 955**, texte français libre | le client ne peut pas réagir à une erreur autrement qu'en l'affichant |
| Import relatif du logger | **130** routes `../../../../utils/logger` | bruit, déplacements de fichiers cassants |
| Contrat admin non documenté | **24** routes admin dans `docs/openapi` sur 322 | le drift test ne voit pas l'admin |
| État local éclaté | 12 écrans > 20 `useState` | états incohérents (chargé ≠ édité ≠ sauvé), bugs de brouillon |
| Kit partagé peu adopté | `DataTable` 12 · `AdminListShell` 9 · `useAdminResource` 25 · `useTableQueryState` **1** | chaque liste refait tri / filtre / pagination |
| Accès base depuis les pages | **14** pages importent `@/utils/supabase` (SSR) | la page est à la fois vue, contrôleur et repository |
| Styles inline | **72** `style={{…}}` | pas de thème, pas de « Le Ruban » possible |
| Sources de vérité multiples | nav (`adminNav*.ts`), gating (`withStaffPage` × 192), fil d'Ariane, palette, quick-links | ajouter un écran = 5 endroits à toucher, oublis silencieux |

### Ce qui existe déjà et qu'on garde (on ne repart pas de zéro)

- `withStaffRoute` (319 routes) + catalogue `STAFF_PERMISSION_CATALOG` + `STAFF_ROLE_PERMISSIONS` (A2).
- `withStaffPage` (SSR), `useAdminFetch` / `useAdminResource` / `useIdempotentMutation` /
  `useConfirmDialog`, `useAutoSave`, `useUrlFilters`, `useTableQueryState`.
- `DataTable`, `AdminListShell`, `lazyPanel`, `Tabs`, `CommandPalette`, `EntityHistoryDrawer`.
- `logStaffAction` + `StaffLogAction` typé (188 slugs), `utils/adminIdempotency`, `utils/rateLimit`.
- Garde-fous par test de source : `adminFileSizeGuard`, `adminPageGuards`, `siteSettingsGuard`…
- Contrat OpenAPI par fragments + `x-zod` + drift test.

L'industrialisation consiste à **faire de ces pièces le chemin obligatoire** — et non une option
parmi d'autres — puis à découper les monolithes par domaine sur ce socle.

---

## 2. Architecture cible

```
features/admin/<domaine>/           ← un module par domaine métier
├── schemas.ts        zod : entrées, sorties, DTO  (source unique client + serveur)
├── service.ts        logique métier, pure de HTTP ; reçoit { db, tenantId, actor }
├── repository.ts     accès Supabase typé, colonnes explicites, jamais select('*')
├── routes.ts         defineAdminRoute(…) par méthode → consommé par pages/api/admin/*
├── client.ts         appels typés (généré/inféré depuis schemas + routes)
├── hooks/            useXxxQuery / useXxxMutation (cache + invalidation)
├── ui/               panneaux présentationnels, sans fetch
└── module.ts         déclaration : nav, permission, fil d'Ariane, commandes palette
```

`pages/admin/**` et `pages/api/admin/**` deviennent des **fichiers de 5 à 30 lignes** qui
branchent un module : Next garde son routage par fichiers, la logique vit ailleurs.

**Règles de frontière** (vérifiées par tests de source, § L2) :

1. `ui/` n'importe ni `supabase`, ni `fetch`, ni `service` — il reçoit des props.
2. `service.ts` n'importe ni `next`, ni `NextApiRequest` — il est appelable depuis un cron, le bot
   ou un test sans HTTP.
3. `pages/admin/**` n'importe pas `@/utils/supabase` (14 exceptions gelées puis résorbées).
4. Un module n'importe pas l'`ui/` ou le `repository` d'un autre module — seulement son
   `service` ou son `client`.

**Stratégie de migration : étrangleur, jamais big-bang.** Chaque socle (lots 3 à 13) arrive avec
un **cliquet** : le nouveau chemin devient obligatoire pour tout nouveau code, l'ancien est gelé à
son compte du jour et ne peut que décroître. Les lots 14 à 19 font descendre les compteurs domaine
par domaine. Aucune fonctionnalité n'est gelée pendant le chantier.

---

## 3. Séquencement

| # | Lot | Phase | Impact | Effort | Dépend de |
|---|---|---|---|---|---|
| **L1** | Tableau de bord de dette + cliquets | 0 · Garde-fous | 🟥 | M | — |
| **L2** | Architecture `features/admin` + règles de frontière | 0 · Garde-fous | 🟥 | M | L1 |
| **L3** | `defineAdminRoute` : la route déclarative | 1 · Serveur | 🟥 | L | L2 |
| **L4** | Erreurs typées et enveloppe de réponse | 1 · Serveur | 🟥 | M | L3 |
| **L5** | Types Supabase générés + fin du `select('*')` | 1 · Serveur | 🟥 | L | — |
| **L6** | Schémas zod partagés (DTO client ↔ serveur) | 1 · Serveur | 🟧 | M | L3, L5 |
| **L7** | Couche service / repository | 1 · Serveur | 🟥 | L | L5, L6 |
| **L8** | Journal staff déclaratif (audit avant/après) | 1 · Serveur | 🟧 | M | L3 |
| **L9** | Contrat OpenAPI admin généré | 1 · Serveur | 🟧 | M | L3, L6 |
| **L10** | Client API typé + couche de cache | 2 · Client | 🟥 | L | L6, L9 |
| **L11** | `useAdminForm` : formulaires sur schéma | 2 · Client | 🟥 | L | L6, L10 |
| **L12** | Kit UI admin + jetons « Le Ruban » | 2 · Client | 🟧 | L | — |
| **L13** | DataTable v2 : pagination serveur, vues, virtualisation | 2 · Client | 🟧 | L | L3, L10 |
| **L14** | Registre de modules (nav, gating, fil d'Ariane, palette) | 2 · Client | 🟥 | M | L2 |
| **L15** | Module Tâches | 3 · Découpe | 🟧 | L | L7, L10, L11 |
| **L16** | Module Tournoi (hub, matchs, simulateur) | 3 · Découpe | 🟥 | XL | L7, L10, L13 |
| **L17** | Module Équipes | 3 · Découpe | 🟥 | XL | L7, L11, L13 |
| **L18** | Module Utilisateurs & Demandes | 3 · Découpe | 🟧 | XL | L7, L11, L13 |
| **L19** | Module Matchs & Phases | 3 · Découpe | 🟥 | XL | L7, L11 |
| **L20** | Module Régie / Diffusion / Communication + recette finale | 3 · Découpe | 🟧 | XL | L7, L10, L12 |

Chemin critique : **L1 → L2 → L3 → L5 → L6 → L7 → L10 → L11**, puis les lots de découpe en
parallèle. L12 (UI) et L14 (registre) peuvent démarrer dès la phase 0.

**Fenêtre.** La Cup 2026 est en cours (round robin, mer/ven). Les phases 0–2 ne touchent aucun
écran de jour de match sans cliquet vert ; les lots L16 et L19 (tournoi, matchs, phases) se font
**hors soir de match** et chaque étape est déployable seule.

---

## Phase 0 — Garde-fous

### L1 · Tableau de bord de dette + cliquets — ✅ LIVRÉ (2026-09-29)

**Problème.** Les chiffres du § 1 ont été obtenus à la main aujourd'hui ; demain ils seront faux
et personne ne le saura. `adminFileSizeGuard` gèle la taille des fichiers, rien d'autre.

**Livrable.**
- `scripts/admin-metrics.ts` : produit un JSON + un tableau Markdown des indicateurs du § 1
  (LOC, fichiers > seuil, `useState` par fichier, routes sans zod, sans idempotence, `select('*')`,
  `req.body as`, `.json({ error` libres, imports relatifs du logger, adoption du kit).
- `tests/unit/adminDebtRatchet.test.ts` : un **cliquet** par indicateur, lu depuis
  `tests/unit/__fixtures__/admin-debt-baseline.json`. Un compteur qui monte = rouge ; un compteur
  qui descend = message « baisse la baseline à N » (même esprit que la regel des chiffres CI).
- `npm run admin:metrics` pour regeler la baseline après un lot.

**Critères d'acceptation**
- [x] 16 indicateurs gelés (13 symptômes + 3 seuils de taille) et 7 d'adoption affichés :
      [`scripts/admin-metrics.ts`](../scripts/admin-metrics.ts).
- [x] Le cliquet échoue si un compteur monte (nouvelle route hors `defineAdminRoute`,
      `select('*')`, `req.body as`…) **et** s'il descend sans regel.
- [x] Baseline initiale. Écarts avec le § 1, tous dus au comptage à la main : `.json({ error`
      = **2 558** (le grep manuel ratait les objets ouverts sur plusieurs lignes), `{ ok|success }`
      = 105, `logStaffAction(` = 362 appels (612 = mentions, imports compris), URLs
      `/api/admin/` en dur côté UI = **644** (non mesuré au § 1).
- [x] 0,6 s sur le Mac.

### L2 · Architecture `features/admin` + règles de frontière — 🟥 / M

**Problème.** Il n'existe aucun endroit « normal » pour mettre la logique d'un domaine admin :
elle finit dans la page (UI), dans la route (métier) ou dans `utils/` (188 fichiers à plat).

**Livrable.**
- ADR court `docs/adr/0001-admin-feature-modules.md` : l'arborescence du § 2, les 4 règles, la
  stratégie étrangleur, ce qui reste dans `utils/` (le pur transverse).
- Alias `@/features/*` dans `tsconfig.json`.
- `tests/unit/adminBoundariesGuard.test.ts` : vérifie les 4 règles par lecture de source (même
  famille que `siteSettingsGuard`) ; exceptions listées nommément et gelées.
- **Module pilote** minimal : `features/admin/free-players/` (petite liste, déjà sur `DataTable`)
  pour valider l'arborescence avant d'en faire la norme.

**Critères d'acceptation**
- [ ] Une violation de frontière dans un fichier non listé fait échouer le test.
- [ ] Le module pilote respecte les 4 règles et sa page fait < 40 lignes.
- [ ] `biome check` ne signale rien de nouveau (alias résolu).

---

## Phase 1 — Socle serveur

### L3 · `defineAdminRoute` : la route déclarative — 🟥 / L

**Problème.** 322 routes réécrivent le même squelette : `switch (req.method)`, `withStaffRoute`,
rate-limit (168 routes), idempotence (74), parse du corps, `try/catch`, log, `res.status().json()`.
Chaque oubli est un bug : route mutante sans idempotence, validation absente, 405 non renvoyé.

**Livrable.** `utils/admin/defineAdminRoute.ts` :

```ts
export default defineAdminRoute({
  GET: {
    permission: 'teams.read',
    query: TeamQuerySchema,
    handler: ({ query, ctx }) => teamService.get(ctx, query.teamId),
  },
  PATCH: {
    permission: 'teams.write',
    body: TeamPatchSchema,
    idempotent: true,          // défaut true pour POST/PATCH/PUT/DELETE
    rateLimit: 'admin-write',  // préréglages nommés, pas de nombres magiques
    audit: 'update_team',      // cf. L8
    handler: ({ body, query, ctx }) => teamService.update(ctx, query.teamId, body),
  },
});
```

- 405 + en-tête `Allow` automatiques ; CSRF (`csrfCheck`) automatique sur les méthodes mutantes.
- `ctx` = `{ staff, tenantId, permissions, db, logger, requestId }` : plus aucun handler ne lit
  le tenant lui-même.
- Idempotence **par défaut** sur les méthodes mutantes (opt-out explicite et justifié).
- Le handler **retourne** une valeur ; c'est `defineAdminRoute` qui sérialise.
- Test **matrice de permissions** générée : pour chaque route déclarée × chaque rôle staff, un
  appel sans la permission renvoie 403 — sans écrire un test par route.

**Migration.** Les nouvelles routes passent par `defineAdminRoute` (cliquet L1 :
« routes admin hors `defineAdminRoute` » ne peut que baisser). Premières migrées : 10 petites
routes de lecture pour éprouver l'API, puis domaine par domaine (lots 15–20).

**Critères d'acceptation**
- [ ] Une méthode non déclarée renvoie 405 avec `Allow`.
- [ ] Une mutation rejouée avec la même clé d'idempotence ne réécrit pas.
- [ ] La matrice de permissions couvre 100 % des routes migrées.
- [ ] Temps de réponse inchangé (± 5 ms) sur les 10 routes pilotes.

### L4 · Erreurs typées et enveloppe de réponse — 🟥 / M

**Problème.** 1 955 `res.json({ error: '…' })` en français libre, plus 46 `{ success }` et
13 `{ ok }`. Le client ne peut ni distinguer un conflit d'une validation, ni surligner le champ
fautif, ni traduire.

**Livrable.**
- `utils/admin/errors.ts` : `AdminError` + sous-classes `ValidationError(fields)`,
  `NotFoundError`, `ConflictError`, `ForbiddenError`, `PreconditionError(code)`.
- Enveloppe unique : succès = le corps (pas d'emballage, compatible avec l'existant) ; erreur =
  `{ error: string, code: AdminErrorCode, fields?: Record<string, string> , requestId }`.
  **`error` reste une chaîne** : les 200+ écrans qui affichent `res.error` continuent de marcher.
- Catalogue `AdminErrorCode` (union typée) + libellés dans `useAdminT` ; `defineAdminRoute`
  traduit une `ZodError` en `ValidationError` avec `fields`.
- Toute exception non typée → 500 avec `requestId`, message générique, stack dans le logger.

**Critères d'acceptation**
- [ ] Aucune route migrée n'écrit `res.status(…).json(…)` à la main.
- [ ] Un 422 renvoie `fields` et le formulaire (L11) surligne le champ.
- [ ] Le `requestId` visible dans le toast d'erreur se retrouve dans les logs.

### L5 · Types Supabase générés + fin du `select('*')` — 🟥 / L

**Problème.** Aucun type de base généré : les lignes sont typées à la main (`types/admin.ts`,
408 lignes) ou pas du tout. 101 `select('*')` en admin. Une colonne renommée casse en prod — et le
mock Supabase des tests ne valide pas les colonnes (mémoire « cas mvp-leaderboard »).

**Déjà en place (constaté au démarrage du chantier)** : `database/schema-snapshot.json`
(`scripts/refresh-schema-snapshot.mjs`) et `tests/unit/supabaseSelectSchema.test.ts` vérifient
déjà que chaque colonne citée dans un `.select()` existe. Ce qui manque : le **typage** des lignes
et la validation des colonnes par le mock.

**Livrable.**
- `types/database.generated.ts` via `generate_typescript_types` (projet `owwomenscup`) +
  `npm run db:types` ; `createClient<Database>` dans `utils/supabase`.
- Test de fraîcheur : échoue si une migration de `database/migrations/` est plus récente que le
  fichier généré (message : relancer `db:types`).
- Remplacement des `select('*')` par des listes de colonnes **constantes et typées**
  (`const TEAM_COLUMNS = 'id,name,slug,…' as const`), domaine par domaine.
- Le mock Supabase des tests valide les colonnes demandées contre `Database` — ferme enfin le
  trou « colonne inexistante verte en test ».

**Critères d'acceptation**
- [ ] `tsc --noEmit` détecte une colonne inexistante dans un `.select()` d'une route migrée.
- [ ] Le mock rejette un `select` sur une colonne absente du schéma généré.
- [ ] Cliquet `select('*')` en admin : 101 → 0 à la fin du plan.

### L6 · Schémas zod partagés (DTO client ↔ serveur) — 🟧 / M

**Problème.** Les formes d'entrée/sortie sont décrites deux fois (type TS côté page, parse à la
main côté route) et divergent. 90 `req.body as`.

**Livrable.**
- Convention `features/admin/<domaine>/schemas.ts` : `XxxCreateSchema`, `XxxPatchSchema`,
  `XxxQuerySchema`, `XxxDto` ; types inférés `z.infer`.
- Schémas **dérivés** des types générés (L5) quand c'est possible, pour que la base reste la
  source.
- Les schémas existants (`utils/taskBoardSchemas.ts`, `campaignSchema.ts`, `utils/validation.ts`)
  déplacés dans leur module, réexportés le temps de la migration.

**Critères d'acceptation**
- [ ] Une page migrée n'a aucun type de payload écrit à la main.
- [ ] Cliquet `req.body as` en admin : 90 → 0.

### L7 · Couche service / repository — 🟥 / L

**Problème.** 281 routes sur 322 font elles-mêmes leurs requêtes. Les mêmes règles
(« une équipe désactivée ne peut pas… », « un match résolu ne peut plus… ») sont réécrites dans
l'admin, le bot (`/api/bot/v1/*`) et le public — et elles divergent.

**Livrable.**
- Par domaine : `repository.ts` (requêtes typées, filtre `tenant_id` **obligatoire** en
  paramètre, pas en option) et `service.ts` (règles, orchestration, émission d'événements
  `emitBotEvent`, pas de HTTP).
- Signature commune : `service.fn(ctx: ServiceContext, …)` avec
  `ServiceContext = { db, tenantId, actor, logger }` — `actor` = staff, bot ou système, ce qui
  prépare l'acteur bot/system absent de `logStaffAction`.
- Les routes **bot** du même domaine réutilisent le même service (sans changer leur contrat).
- Tests unitaires du service sans mock HTTP.

**Critères d'acceptation**
- [ ] Sur un domaine migré, admin et bot appellent la même fonction de service.
- [ ] Un repository sans `tenantId` ne compile pas.
- [ ] Cliquet « routes admin qui importent `supabaseAdmin` » : 281 → 0.

### L8 · Journal staff déclaratif (audit avant/après) — 🟧 / M

**Problème.** `logStaffAction` est appelé à la main 612 fois dans l'admin ; un quart du journal
était `other` (A6 l'a réduit, mais rien n'empêche la rechute). Le journal dit *qui* et *quoi*,
rarement *de quoi à quoi*.

**Livrable.**
- Option `audit` de `defineAdminRoute` : slug typé obligatoire sur toute méthode mutante,
  `entity` (type + id) déduit, **diff avant/après** calculé par le service (`{ before, after }`
  retourné), écrit dans `staff_logs.payload`.
- `EntityHistoryDrawer` affiche le diff champ par champ.
- Test : une route mutante migrée sans `audit` ne compile pas (type conditionnel).

**Critères d'acceptation**
- [ ] 0 appel manuel à `logStaffAction` dans les routes migrées.
- [ ] Le slug `other` est refusé par le type.
- [ ] L'historique d'une équipe montre « nom : A → B » et non « équipe mise à jour ».

### L9 · Contrat OpenAPI admin généré — 🟧 / M

**Problème.** 24 routes admin documentées sur 322. Le drift test ne protège donc pas l'admin, et
aucun client typé n'est possible.

**Livrable.**
- Générateur qui lit les déclarations `defineAdminRoute` (méthodes, permission, schémas zod) et
  produit les fragments `docs/openapi/admin/*` — même chaîne que `x-zod` / `openapi:responses`.
- Spec admin **interne** (non publiée sur `/developpeurs/reference`).
- Le test de drift couvre les routes admin migrées.

**Critères d'acceptation**
- [ ] Toute route migrée apparaît dans la spec sans écriture manuelle.
- [ ] Modifier un schéma sans regénérer fait échouer `npx vitest run tests/unit/openapi`.

---

## Phase 2 — Socle client

### L10 · Client API typé + couche de cache — 🟥 / L

**Problème.** Les pages appellent `useAdminFetch('/api/admin/…')` avec des chaînes, 24 appels
seulement sont typés. Après une mutation, chaque écran recharge « à la main » ce qu'il pense
concerné — d'où les listes périmées après une édition dans un tiroir.

**Livrable.**
- `features/admin/<domaine>/client.ts` : fonctions typées dérivées des schémas
  (`teamsClient.update(id, patch)`), construites sur `adminFetchJson` (Bearer, 401 → login).
- Couche de requêtes à **clés** (`['teams', tenantId, id]`) avec déduplication, cache,
  invalidation ciblée après mutation, mises à jour optimistes (reprend `useIdempotentMutation`).
- **TanStack Query** (~13 ko gz), limité au bundle admin. Exception à la politique zéro
  dépendance **validée le 2026-09-29** : réécrire l'invalidation et la déduplication est
  exactement la plomberie que ce plan cherche à arrêter de maintenir.
- `useAdminFetch` / `useAdminResource` deviennent des adaptateurs puis sont dépréciés (cliquet).

**Critères d'acceptation**
- [ ] Éditer une équipe dans un tiroir met à jour la liste sans rechargement.
- [ ] Deux panneaux qui lisent la même ressource ne déclenchent qu'une requête.
- [ ] Aucune URL `/api/admin/…` en dur dans un module migré.
- [ ] Le bundle public n'embarque pas la librairie (vérifié au build).

### L11 · `useAdminForm` : formulaires sur schéma — 🟥 / L

**Problème.** Les gros formulaires sont des sacs de `useState` : 45 dans l'édition d'équipe, 28
dans l'édition de match, 33 dans la gestion des utilisateurs. Brouillon, dirty-check, autosave,
erreurs serveur sont refaits à chaque fois.

**Livrable.** `hooks/admin/useAdminForm.ts` :
- initialisé depuis un schéma zod (L6) + valeurs serveur (L10) ;
- validation client = même schéma que le serveur ;
- `isDirty`, garde de navigation « modifications non enregistrées », `DraftBanner`,
  autosave optionnel (reprend `useAutoSave` + `AutoSaveIndicator`) ;
- erreurs serveur `fields` (L4) mappées sur les champs ;
- composants `<Field>`, `<FieldGroup>`, `<FormActions>` accessibles (label, `aria-describedby`,
  focus sur la première erreur).

**Critères d'acceptation**
- [ ] Le formulaire d'édition d'équipe passe de 45 `useState` à ≤ 5.
- [ ] Une erreur 422 du serveur s'affiche sous le bon champ, focus compris.
- [ ] Quitter une page avec des modifications demande confirmation.

### L12 · Kit UI admin + jetons « Le Ruban » — 🟧 / L

**Problème.** Pas de gabarit de page commun ; 72 styles inline ; le design system « Le Ruban »
(direction A verrouillée le 2026-09-05) n'est pas migré dans le code. Chaque écran recompose en-tête,
actions, sections, statistiques.

**Livrable.**
- Jetons CSS « Le Ruban » (palette exacte du logo, ardoise = le trait) dans une feuille admin ;
  **tous avec valeur de repli** (piège du jeton non défini qui casse toute la déclaration).
- Primitives : `AdminPage` (titre, fil d'Ariane, actions, onglets), `Section`, `StatGrid`,
  `Toolbar`, `Drawer`, `Callout` ; `Modal`, `ConfirmDialog`, `StatusBadge`, `EmptyState`,
  `Skeleton` alignés dessus.
- Page catalogue `/admin/_kit` (owner seulement) : chaque primitive dans ses états, sert de banc
  visuel Playwright.
- Cliquet `style={{` : 72 → 0 (hors valeurs dynamiques justifiées).

**Critères d'acceptation**
- [ ] `/admin/_kit` rend toutes les primitives en clair et en sombre.
- [ ] Captures Playwright de référence du kit en CI.
- [ ] Contraste AA vérifié sur les jetons.

### L13 · DataTable v2 : pagination serveur, vues, virtualisation — 🟧 / L

**Problème.** `DataTable` existe (A5) mais pagine surtout côté client, et `useTableQueryState`
n'est utilisé qu'une fois. Les grosses listes (équipes, utilisateurs, demandes, matchs du tournoi)
restent faites main.

**Livrable.**
- Contrat de liste standard côté serveur, porté par `defineAdminRoute` :
  `?limit&cursor|offset&sort=col:dir&filter[col]=…&q=` → `{ items, total, nextCursor }`,
  validé par un `ListQuerySchema` générique.
- `DataTable` branché sur L10 (requête par clé, pagination serveur, filtres URL via
  `useTableQueryState`).
- **Vues enregistrées** (filtres + colonnes) par staff, partageables par URL.
- Virtualisation au-delà de 200 lignes ; actions groupées sur sélection serveur (« les 312
  résultats »), avec le compte dans le libellé.
- Export CSV côté serveur pour les grosses listes (streaming).

**Critères d'acceptation**
- [ ] Les 4 grosses listes (équipes, utilisateurs, demandes, matchs) sur `DataTable` v2.
- [ ] 5 000 lignes simulées restent fluides (< 16 ms par frame au défilement).
- [ ] Un lien copié rouvre la même vue (filtres, tri, page).

### L14 · Registre de modules (nav, gating, fil d'Ariane, palette) — 🟥 / M

**Problème.** Ajouter un écran = toucher `adminNav.ts`, `adminNavCards.ts`, `adminNavTrail.ts`,
`withStaffPage(…)` dans la page, la palette de commandes et parfois les quick-links. Un oubli =
écran invisible, ou visible mais interdit.

**Livrable.**
- `features/admin/<domaine>/module.ts` déclare ses écrans : chemin, titre (clé i18n), icône,
  permission requise, parent (fil d'Ariane), commandes palette, raccourcis.
- `features/admin/registry.ts` agrège ; nav, cartes, fil d'Ariane, palette et
  `withStaffPage` **dérivent** du registre (`withAdminModulePage('teams.edit')`).
- Test : chaque fichier de `pages/admin/**` correspond à une entrée du registre et inversement ;
  la permission du registre = celle des routes API qu'il appelle (au moins en lecture).

**Critères d'acceptation**
- [ ] Ajouter un écran ne touche que le module + le fichier de page.
- [ ] Un écran dont la permission manque au rôle n'apparaît ni dans la nav ni dans la palette.
- [ ] `adminNav*.ts` n'ont plus de liste écrite à la main.

---

## Phase 3 — Découpe des monolithes, domaine par domaine

Chaque lot de cette phase suit la **même recette**, ce qui rend l'effort prévisible :

1. Créer `features/admin/<domaine>/` (schemas → repository → service → routes → client → hooks → ui → module).
2. Migrer les routes API du domaine sur `defineAdminRoute` + service (L3–L8), contrat inchangé.
3. Remplacer l'état local par hooks de requête (L10) et `useAdminForm` (L11).
4. Extraire les panneaux présentationnels dans `ui/` (règle A7 : le panneau reçoit des callbacks).
5. Réduire la page à son câblage ; regeler la baseline (L1).
6. Tests : service (unitaires), matrice de permissions (auto), 1 e2e de parcours critique.

**Définition de terminé commune** : aucune page du domaine > 300 lignes, aucun composant > 400,
aucune route > 80, aucun `select('*')` / `req.body as` / `supabaseAdmin` dans les routes.

### L15 · Module Tâches — 🟧 / L

Premier gros module : isolé du jour de match, donc le meilleur terrain d'apprentissage.

- **Cible** : [`tasks/index.tsx`](../pages/admin/tasks/index.tsx) (2 683 LOC, 61 `useState`),
  routes `pages/api/admin/tasks/*`, cœur partagé [`utils/taskBoard.ts`](../utils/taskBoard.ts)
  (déjà partagé admin + bot → devient `service.ts`).
- **Découpe** : état du tableau en `useReducer` (colonnes, cartes, glisser-déposer optimiste) ;
  panneaux `BoardColumns`, `TaskCard`, `TaskDrawer`, `TaskFilters`, `ChecklistEditor`,
  `CommentThread`.
- **Contrainte** : contrat `/api/bot/v1/tasks/*` et événements `task.*` inchangés (bot `/kanban`).
- [ ] 61 `useState` → ≤ 8 ; `e2e admin-tasks.spec.ts` vert sans modification.

### L16 · Module Tournoi (hub, matchs, simulateur) — 🟥 / XL

- **Cible** : [`tournament/[id]/matches.tsx`](../pages/admin/tournament/[id]/matches.tsx) (2 246),
  [`tournament/[id]/dashboard.tsx`](../pages/admin/tournament/[id]/dashboard.tsx) (1 614),
  [`tournament-simulator.tsx`](../pages/admin/tournament-simulator.tsx) (2 433),
  [`tournaments/create.tsx`](../pages/admin/tournaments/create.tsx) (774), `StatsAnalyticsPanel`,
  `BracketBuilderPanel`, `VetoPanel`, `MapDrawPanel` ; API `tournament/[id].ts` (576).
- **Découpe** : le hub (`/dashboard`, hub unique) devient une composition de panneaux alimentés par
  des requêtes indépendantes — un panneau lent ne bloque plus les autres. Le simulateur sort en
  sous-module `features/admin/simulator` (moteur `simulateBracketToCompletion` déjà pur).
  La création de tournoi passe sur `useAdminForm` en assistant à étapes.
- **Contrainte** : **hors soirs de match** ; déploiement par panneau, `admin-control-center-mobile`
  vert à chaque étape.
- [ ] Le hub affiche ses alertes même si les statistiques échouent.
- [ ] Aucun fichier du domaine > 400 lignes.

### L17 · Module Équipes — 🟥 / XL

- **Cible** : [`teams/my.tsx`](../pages/admin/teams/my.tsx) (1 751),
  [`teams/[teamId]/edit.tsx`](../pages/admin/teams/[teamId]/edit.tsx) (1 497, 45 `useState`),
  [`teams/index.tsx`](../pages/admin/teams/index.tsx) (1 207) ; API
  [`teams/[teamId].ts`](../pages/api/admin/teams/[teamId].ts) (565),
  `members.ts` (807), `tournaments.ts` (586).
- **Découpe** : service unique équipe/roster réutilisé par l'admin, le capitaine
  (`managedTeamSlice`, source canonique) et le bot (`team.created` → provisioning Discord) ;
  édition en onglets `Identité`, `Roster`, `Discord`, `Tournois`, `Historique` chacun sur
  `useAdminForm`.
- **Pièges connus à encoder en tests** : `captain_id` NULL légitime ; logo = image locale carrée ;
  double compte roster/Discord ; rôles d'équipe par `discord_role_id`, jamais par nom.
- [ ] Liste des équipes sur `DataTable` v2 ; édition ≤ 5 `useState` ; `admin-team-roster-bulk`
      et `admin-teams-my` verts.

### L18 · Module Utilisateurs & Demandes — 🟧 / XL

- **Cible** : [`users/manage.tsx`](../pages/admin/users/manage.tsx) (2 379) +
  [`api/admin/users/manage.ts`](../pages/api/admin/users/manage.ts) (1 085),
  [`demandes/index.tsx`](../pages/admin/demandes/index.tsx) (1 614) +
  [`api/admin/demandes/index.ts`](../pages/api/admin/demandes/index.ts) (1 355),
  `demandes/[id].tsx` (922), `users/new.tsx` (902), `users/[userId]/player-view.tsx` (1 088).
- **Découpe** : les deux plus grosses routes de l'admin éclatées **par intention** (la route
  `demandes/index.ts` multiplexe liste, actions de statut et conversions) : une route par ressource,
  une action = un `POST …/actions/<verbe>` déclaré, journalisé (L8).
- **Pièges** : profil dans `auth.users.raw_user_meta_data` (pas de table `profiles`, lire via
  `fetchAdminUserProfiles`) ; changement d'email sécurisé désactivé → ré-auth mot de passe.
- [ ] Aucune route > 150 lignes ; `admin-users`, `admin-demandes`, `admin-player-view` verts.

### L19 · Module Matchs & Phases — 🟥 / XL

- **Cible** : [`matches/[matchId]/edit.tsx`](../pages/admin/matches/[matchId]/edit.tsx) (1 312),
  `matches/[matchId]/index.tsx` (780), `stages/[stageId].tsx` (952), `seeding.tsx` (967),
  `groups.tsx` (857) ; API [`matches/[matchId].ts`](../pages/api/admin/matches/[matchId].ts) (871),
  `veto.ts` (521), `dispute.ts` (589), `stages/[stageId]/bulk-matches.ts` (727),
  `generate-swiss-round.ts` (725) ; `DisputeResolveModal` (674).
- **Découpe** : machine d'état explicite du match (`scheduled → live → reported → disputed →
  resolved`) dans le service, **seule** autorité sur les transitions — aujourd'hui dispersée entre
  admin, bot et capitaine. Génération suisse / bulk en services purs (déjà largement dans
  `utils/swiss`, `utils/bracket`).
- **Contrainte** : **hors soirs de match** ; le format Cup 2026 (round robin, matchs sans
  `stage_id`) doit rester géré.
- [ ] Une transition interdite est refusée par le service quel que soit l'appelant (admin, bot).
- [ ] `apiAdminDisputeGuard` et `admin-workflows` verts.

### L20 · Module Régie / Diffusion / Communication + recette finale — 🟧 / XL

- **Cible** : [`events/[runId]/director.tsx`](../pages/admin/events/[runId]/director.tsx) (1 262),
  [`regie.tsx`](../pages/admin/regie.tsx) (880), `broadcast/live.tsx` (792),
  `TwitchCommandsPanel` (1 171), `TwitchPredictionsPanel` (721), `CampaignsPanel` (1 163),
  `CampaignDrawer` (768), `SupportPanel` (1 166), `SegmentEditor` (625).
- **Découpe** : régie = données temps réel (`broadcast_state`) → hook d'abonnement unique partagé
  par director / régie / live ; campagnes et support sur `DataTable` v2 + `useAdminForm`.
- **Recette finale du plan** :
  - [ ] Baseline L1 : tous les cliquets « à zéro » atteints ou exceptions nommées et justifiées.
  - [ ] `docs/adr/0001` mis à jour de ce que la migration a appris.
  - [ ] Guide « ajouter un écran admin en 30 minutes » (`docs/ADMIN_DEV_GUIDE.md`) éprouvé sur
        un écran réel.
  - [ ] Suppression des adaptateurs de compatibilité (`useAdminFetch` direct, réexports de schémas).

---

## 4. Ce qu'on ne fait pas (et pourquoi)

- **Changer de framework ou passer à l'App Router.** Le problème est l'absence de couches, pas le
  routeur ; une migration de routeur doublerait le chantier sans résoudre un seul symptôme du § 1.
- **Big-bang.** Aucun lot ne réécrit un domaine d'un coup sans que l'ancien et le nouveau
  coexistent ; chaque étape se déploie seule.
- **Un monorepo / un package `admin` séparé.** `features/admin` + règles de frontière suffisent ;
  un package ajoute de l'outillage sans ajouter de garantie.
- **Storybook.** La page `/admin/_kit` + captures Playwright couvrent le besoin sans une deuxième
  chaîne de build.
- **Traduire l'admin en anglais.** Toujours aucun signal (cf. PLAN-espace-admin § 3). Les
  libellés passent par `useAdminT` pour la cohérence, pas pour une langue de plus.
- **Changer les contrats bot / public.** Les services sont réutilisés par ces routes, leurs formes
  de réponse ne bougent pas (drift test OpenAPI + `BOT_API_CONTRACT.md` inchangés).

## 5. Risques

| Risque | Parade |
|---|---|
| Régression un soir de match | lots tournoi / matchs hors mer/ven soir ; chaque étape déployable seule ; e2e du domaine verts avant push |
| Chantier qui s'enlise à mi-chemin (deux façons de faire pour toujours) | cliquets L1 : l'ancien chemin ne peut que décroître ; recette finale L20 |
| Mock Supabase trop permissif → faux verts | L5 fait valider les colonnes par le mock |
| Coût de vérification sur le Mac | cliquets et gardes = lecture de source (< 5 s) ; suites complètes via la CI GitHub sur `work`, un push par série |
| Bundle admin qui grossit (librairie de requêtes) | L10 vérifie au build que le bundle public n'embarque rien ; panneaux secondaires en `lazyPanel()` |
| Types générés périmés | test de fraîcheur L5 |

## 6. Vérification

- Par lot : tests ciblés du domaine (`npx vitest run tests/unit/<domaine>`), cliquets L1,
  `npx vitest run tests/unit/openapi`, e2e du domaine ; suite complète par la CI GitHub.
- Par phase : `npm run admin:metrics` et mise à jour du tableau du § 1 dans ce document.
- Fin de plan : recette L20.
