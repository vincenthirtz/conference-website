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

## ⏸ Point d'arrêt — 2026-09-29

**Où est le travail.** Commits LOCAUX sur `work`, non poussés (`work` déploie en prod sur
Netlify). Une copie au lot 10 existe aussi sur `origin/admin-industrialisation` (poussée pour un
changement de machine finalement annulé) ; le travail continue sur `work`. Rien ne part en prod
avant la recette ci-dessous et un feu vert explicite.

**Fait** (L1–L14 socles, cf. sections ; passe visuelle « Le Ruban » lots 1 à 10, cf. L12) :
- toutes les pages admin sont sur les archétypes Le Ruban ; **plus aucune page > 800 lignes**
  (20 au départ) — les géantes ont été découpées en `features/admin/<module>/{ui,hooks}` ;
- pont Tailwind de `styles/admin-ruban.css` étendu aux signaux (emerald/green → `--ok`,
  amber/yellow → `--warn`, red → `--err`, lime → `--lf`) : les ~1 700 classes de signal en dur
  prennent les couleurs exactes sans réécriture ;
- primitives partagées (Modal, ConfirmDialog, AlertBanner, Skeleton, Tabs, historique…) et
  composants tournoi/phases/bracket/draft/matchs et régie/diffusion/caster en grammaire Ruban.
  Les primitives aussi rendues côté public (Modal, ConfirmDialog, AlertBanner, LoadingSpinner,
  LogoUpload, ui/Skeleton, ui/Tabs) ne changent QUE sous `[data-surface=admin]` (variante
  `[:root:has([data-surface=admin])_&]:` ou repli `var(--x, var(--color-…))`).

**Vérifié à chaque lot** : `tsc --noEmit` (seule erreur tolérée : `qrcode`, préexistante), diff
des appels réseau / `router.push` / `data-testid` / `confirm(` / `aria-*` (aucun perdu), les 7
gardes (`noHardcodedFrench`, `i18nLocaleParity`, `adminFileSizeGuard`, `adminPageGuards`,
`adminDebtRatchet`, `adminBoundariesGuard`, `adminLinkGuards`) + les tests unitaires qui
importent les fichiers touchés. Hooks extraits relus contre l'original (corps identiques).

**PAS vérifié — c'est la prochaine étape, avant toute fusion dans `work`** :
1. **Recette visuelle** : aucun écran migré n'a été ouvert dans un navigateur. Priorités :
   hub tournoi, matchs du tournoi, gestion des inscrits, Kanban, régie/Director/console live,
   simulateur, édition d'équipe ; et côté PUBLIC, qu'aucune modale/onglet/squelette n'a bougé
   (TCG, pronostics, `pages/team/[slug]/edit`, `pages/developpeurs/dashboard`).
2. **e2e** contre une base LOCALE (jamais la prod) : `admin-*.spec.ts`, `caster-cockpit-*`.
   `admin-users.spec.ts` était déjà cassé avant (clique un « Rechercher » inexistant).
3. CI GitHub sur la branche (le Mac d'origine ne peut pas lancer `npm run verify`).

**Reste à faire (ordre suggéré)** :
- composants admin : tous passés en grammaire Ruban au lot 11 (restent volontairement bruts :
  quelques contrôles compacts — barre de `SimMatchCard`, outils de `MarkdownEditor`, icônes de
  `RegistrationFieldsEditor`, `ChoiceCard`/`BigChip` du quiz ; `TenantSwitcher.tsx` non importé) ;
- `TenantSwitcher.tsx` : non monté depuis 28afe291 (mai 2026) mais gardé exprès « au cas où » —
  NON supprimé ; à trancher (le garder = le passer en Ruban le jour où on le remonte) ;
- phases 1–2 : vague serveur 1 faite (71 routes) ; restent 237 routes hors `defineAdminRoute` —
  gros domaines : tournament (32), stages (22), tenants (22), matches (20), events (20), twitch
  (17), teams (14), tcg (12)… ; `select('*')` 64 ; cache client généralisé (L10).

**Décisions produit en attente (à trancher par Vincent)** : confirmation sur « Notifier les
capitaines » ; Dashboard visible ou non pour helper/referee ; plusieurs `primary` simultanés
(modale presets, panneaux des matchs) ; « 🔴 LIVE » à côté d'une puce verte (console live) ;
ConfirmDialog `warning` rendu en primary plutôt qu'en danger ; tons choisis (MVP ouvert = ok,
prédiction active = brand, station `in_use` = ok, `walkover` = neutral).

**Règles de travail sur ce chantier** : pas de `npm run verify` sur le Mac (i7 2014, surchauffe)
— tests ciblés + CI ; mesurer `npm run -s admin:metrics` SANS `--write` avant de regeler, et ne
regeler que des baisses ; le garde de taille compte `wc -l + 1` ; un fichier gelé ne grossit
jamais (extraire plutôt) ; e2e jamais contre la prod.

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
| Contrat admin écrit à la main | 322 fragments, schémas recopiés (corrigé : le « 24 » initial était une erreur de comptage) | la spec dérive du code sans que rien ne le voie |
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

### L2 · Architecture `features/admin` + règles de frontière — ✅ LIVRÉ (2026-09-29)

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
- [x] [ADR 0001](./adr/0001-admin-feature-modules.md) ; alias `@/features/*`.
- [x] [`adminBoundariesGuard.test.ts`](../tests/unit/adminBoundariesGuard.test.ts) : 5 règles
      (les 4 du § 2 + « seul le service lit son repository ») et une 6e — une route
      `pages/api/admin` migrée ne fait que réexporter son module. Aucune exception.
- [x] Pilote [`features/admin/free-players/`](../features/admin/free-players/) : schemas,
      repository, service, routes. La **page** reste à migrer avec le client typé (L10) —
      l'y faire maintenant aurait voulu écrire deux fois la couche de requêtes.
- [x] `biome check` propre.

---

## Phase 1 — Socle serveur

### L3 · `defineAdminRoute` : la route déclarative — ✅ SOCLE LIVRÉ (2026-09-29) · migration en cours

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
- [x] Une méthode non déclarée renvoie 405 avec `Allow` (avant même la garde).
- [x] Une mutation rejouée avec la même clé d'idempotence ne réécrit pas (en-tête
      `Idempotency-Replay`).
- [x] [`adminRoutePermissionMatrix.test.ts`](../tests/unit/adminRoutePermissionMatrix.test.ts)
      découvre seul les routes migrées ; vérifié par mutation (un rôle autorisé déclaré
      « refusé » fait échouer le test).
- [x] `scripts/openapi/infer-responses.cjs` lit les routes déclaratives (retour typé des
      handlers) : sans ça, migrer une route **effaçait** ses réponses du contrat. Le pilote y
      gagne en précision (`source: 'web' | 'discord'`, `success: true`).
- [x] 10 routes migrées pour éprouver l'API : `free-players`, `tenants/accessible`,
      `pending-guild-links`, `diffusion/{live-status,twitch-channels,overlay-presence}`,
      `broadcast/subscriptions`, `alerts-summary`, `users/search`, `caster/recent-matches`.
      Leurs tests existants passent sans modification, à une exception près (ci-dessous).
- [x] **Vague serveur 1 (2026-09-29) — 71 routes** migrées en modules : `leagues`, `site-settings`,
      `notifications`, `news`, `partners` (+ `partnership-requests/index`), `pole-members`,
      `cast-members`, `scrims`, `scrim-plannings`, `moderation`, `support`, `circuit-partners`,
      `ratings`, `stats`, `tasks`. Routes hors `defineAdminRoute` 309 → 237, `supabaseAdmin` direct
      270 → 201, `select('*')` 100 → 64, `logStaffAction` manuels 353 → 279. Laissées (raison
      écrite) : `documents` (base64 36 Mo, GET journalisé), `documents/download` (flux),
      `partnership-requests/[id]` (deux journaux, GET qui écrit).
      Outils ajoutés : `LegacyAdminError` (préserve les `code` métier historiques lus par les
      écrans : `wip_exceeded`, `SLOT_CONFLICT`…), `utils/admin/pathParams.ts` (zod pur, importable
      par `openapi:build` qui tourne SANS alias `@/`), `features/admin/_shared/{audited,legacyParse}.ts`,
      `ctx.audit({ action, tenant_id, skip })`. L'inféreur OpenAPI suit désormais `PUT: update`
      (constante partagée) — sans quoi une méthode perdait ses réponses.
      Écarts de contrat assumés : `Cache-Control: private, no-store`, `requestId`/`code` dans les
      erreurs, 405 avant la validation d'id, rate-limit par défaut là où il n'y en avait pas
      (scrims, support, tasks, webhooks Discord…), journal écrit APRÈS la réponse et best-effort,
      `tenant_id` du journal toujours renseigné (corrige les scrims en multi-tenant).
      Défaut CONSERVÉ, commenté : `team-roles` GET lit le tenant par défaut, PUT écrit celui du staff.
- [ ] Temps de réponse inchangé (± 5 ms) — **non mesuré** : demande la prod ; le wrapper
      n'ajoute aucune requête, seulement la résolution de garde que faisait déjà
      `withStaffRoute`.

**Ce que les 10 migrations ont appris** :
- `Cache-Control` était posé à la main, et pas partout. Défaut désormais `private, no-store`
  (option `cache` par méthode ; `alerts-summary` garde `private, max-age=30`). Seul test
  retouché : `broadcastSubscriptions` attendait `no-store` et reçoit `private, no-store`,
  strictement plus fort.
- Les utils historiques qui renvoient `{ ok: false, status, error }` se branchent par
  `adminErrorFromStatus` sans être réécrits.
- Rate-limit : les routes à 60/min passent au préréglage `read` (120/min) — lecture staff
  authentifiée ; `broadcast/subscriptions` garde 30/min (agrégat sur tous les comptes).
  `users/search` et `caster/recent-matches` n'en avaient **aucun**.
- Deux défauts latents corrigés en passant, sans effet en mono-tenant : `alerts-summary`
  cherchait le tournoi en cours sans le tenant du staff ; 405 sans `Allow` sur trois routes.
- L'inféreur OpenAPI triait mal : ajouter un module réordonnait les réponses de routes sans
  rapport. Tri alphabétique (commit séparé) ; `pending-guild-links` gagne des types précis.
- Un module = un domaine, pas une route : `diffusion/` porte trois routes (`routes/*.ts`),
  un repository et un service.

**Choix faits en écrivant le socle** :
- `read({...})` / `mutate({...})` : sans ces aides, TypeScript ne sait pas inférer les schémas
  méthode par méthode et `query`/`body` deviennent `any` dans le handler.
- Le journal est **déclaré** (`audit: 'slug' | false`, obligatoire sur une mutation) et
  **détaillé** par le handler (`ctx.audit({...})`) — anticipe L8, qui n'aura plus qu'à ajouter
  le diff avant/après.
- `ctx` d'un handler **est** un `ServiceContext` : on le passe tel quel au service.
- Rate-limit par défaut : 120/min en lecture, 60/min en écriture, par IP et par route.

### L4 · Erreurs typées et enveloppe de réponse — 🟨 SOCLE LIVRÉ (2026-09-29)

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
- [x] [`utils/admin/errors.ts`](../utils/admin/errors.ts) ; aucune route migrée n'écrit
      `res.status(…).json(…)` à la main.
- [x] Validation = **400** (et non 422) avec `code: 'validation'` et `fields` : c'est le code que
      les écrans attendent déjà ; le `code` suffit à distinguer.
- [ ] Le formulaire (L11) surligne le champ fautif.
- [x] `requestId` dans l'en-tête `X-Request-Id`, dans le corps d'erreur et dans le log.
- [ ] Le toast d'erreur côté client affiche le `requestId` (L10).

### L5 · Types Supabase générés + fin du `select('*')` — 🟨 TYPES LIVRÉS (2026-09-29) · `select('*')` en cours

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
- [x] [`types/database.generated.ts`](../types/database.generated.ts) (163 tables et vues),
      exclu de biome ; [`databaseTypesFreshness.test.ts`](../tests/unit/databaseTypesFreshness.test.ts)
      compare ses colonnes à `schema-snapshot.json`, table par table.
- [x] **Typage progressif, pas big-bang** : `supabaseAdmin` reste non typé pour le code
      historique ; seuls les modules migrés reçoivent `ctx.db: AdminDb`
      (`SupabaseClient<Database>`). Typer le client global d'un coup aurait allumé des
      centaines d'erreurs dans 700 fichiers.
- [x] `tsc --noEmit` détecte une colonne inexistante dans un `.select()` d'un module migré —
      vérifié par mutation : `column 'nom' does not exist on 'event_runs'`.
- [x] Les casts `as X[]` des repositories retirés (ils auraient masqué l'erreur). Un seul
      conservé, et commenté : le générateur type les colonnes d'un `RETURNS TABLE` comme non
      nulles, ce qui est faux pour `admin_search_users`.
- [x] Premier gain visible : le contrat de `diffusion/twitch-channels` disait `label` nullable,
      la base dit `NOT NULL`.
- [ ] Le mock rejette un `select` sur une colonne absente — **reporté** : `supabaseSelectSchema`
      couvre déjà toute la base de code par lecture de source, et le client typé couvre les
      modules ; changer le mock partagé par 700 tests n'apporte plus assez pour son risque.
- [ ] Cliquet `select('*')` en admin : 102 → 0 à la fin du plan (au fil des lots 15–20).

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

### L8 · Journal staff déclaratif (audit avant/après) — ✅ LIVRÉ (2026-09-29)

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
- [x] 0 appel manuel à `logStaffAction` dans les routes migrées (déjà acquis par L3).
- [x] Le slug `other` est refusé par le type (`AdminAuditAction`) sur toute route déclarative.
- [x] `ctx.audit({ before, after })` → [`utils/admin/auditDiff.ts`](../utils/admin/auditDiff.ts)
      écrit `payload.changes` (mise à jour : seuls les champs qui ont bougé), `payload.after`
      (création) ou `payload.before` (suppression — la seule trace qui en restera). Colonnes
      techniques ignorées ; valeurs sensibles (secret, token, password, api_key…) **jamais**
      recopiées dans un journal que plusieurs personnes lisent.
- [x] L'historique montre « label : Old → New » : [`AuditChanges.tsx`](../components/admin/AuditChanges.tsx)
      dans le tiroir d'historique ET le journal global ; les payloads historiques restent
      lisibles (JSON déplié).
- [x] Branché sur les routes migrées qui écrivent : chaînes Twitch (création, modification,
      suppression), joueuses libres (retrait). Un PATCH sur une chaîne inconnue répond
      désormais 404 au lieu de 500 (l'état d'avant est lu d'abord).
- [ ] L'historique d'une ÉQUIPE montre « nom : A → B » — quand les équipes migreront (L17).

### L9 · Contrat OpenAPI admin généré — ✅ LIVRÉ (2026-09-29)

**Problème.** 24 routes admin documentées sur 322. Le drift test ne protège donc pas l'admin, et
aucun client typé n'est possible.

**Livrable.**
- Générateur qui lit les déclarations `defineAdminRoute` (méthodes, permission, schémas zod) et
  produit les fragments `docs/openapi/admin/*` — même chaîne que `x-zod` / `openapi:responses`.
- Spec admin **interne** (non publiée sur `/developpeurs/reference`).
- Le test de drift couvre les routes admin migrées.

**Critères d'acceptation**
**Diagnostic corrigé** : les 322 routes admin ONT un fragment (le « 24 » du § 1 était un
comptage faux). Le vrai trou était ailleurs, et plus grave :

- [x] **Le test de dérive ne voyait plus les routes migrées.** Il devine méthodes et garde en
      lisant la source du handler ; une route migrée ne fait que réexporter son module, il n'y
      lisait rien, la classait « pas un handler » et l'ignorait — les 12 routes migrées
      échappaient au contrôle depuis leur migration. Il suit maintenant le réexport et lit les
      clés de `defineAdminRoute` ; une route déclarative sans méthode lue fait échouer le test
      (vérifié : un `DELETE` retiré de la spec est vu).
- [x] Paramètres et corps des routes migrées **générés depuis leur schéma zod** par le mécanisme
      existant (`x-zod`, `x-zod-query`), via [`lib/apiContracts/admin/features.ts`](../lib/apiContracts/admin/features.ts).
      Deux mensonges de spec disparus au passage : un paramètre `limit` documenté que
      `users/search` n'a jamais lu, un `id` annoncé UUID que `free-players` accepte quelconque.
- [x] [`adminRouteContracts.test.ts`](../tests/unit/adminRouteContracts.test.ts) : pour chaque
      route migrée, le schéma cité par le fragment est **le même objet** que celui que la route
      applique — une route qui valide avec zod ne peut plus être documentée à la main (vérifié
      par mutation).
- [x] Les schémas de query `users/search` et `alerts-summary` sont sortis des fichiers de route
      vers `schemas.ts`, en zod pur : le registre est chargé par le script de build.
- [ ] Les résumés et descriptions restent écrits à la main dans les fragments — c'est de la
      doc, pas du contrat.

---

## Phase 2 — Socle client

### L10 · Client API typé + couche de cache — 🟨 SOCLE LIVRÉ (2026-09-29) · pilote migré

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
- [x] `@tanstack/react-query` 5.104 installé (seule dépendance ajoutée).
- [x] [`utils/admin/adminHttp.ts`](../utils/admin/adminHttp.ts) : `adminRequest` hors composant
      (Bearer, 401 → connexion, `Idempotency-Key` sur les mutations), `AdminHttpError` qui lit
      `code`/`fields`/`reason`/`requestId`, `adminErrorMessage` → toast « … (réf. abcd1234) ».
- [x] [`features/admin/_shared/query.tsx`](../features/admin/_shared/query.tsx) :
      `withAdminQuery(Page)` **par page** et non dans `_app` ; client singleton côté navigateur
      (cache conservé entre pages admin), neuf par rendu côté serveur ; pas de nouvel essai sur
      une 4xx.
- [x] Le bundle public n'embarque pas la librairie — garanti par **test de source**
      (`adminBoundariesGuard`, vérifié par sonde) plutôt que par un build, trop lourd sur le Mac.
- [x] Pilote de bout en bout : `/admin/free-players` = page de câblage + `client.ts` +
      `hooks/useFreePlayers.ts` + `ui/FreePlayersTable.tsx` ; 4 `useState` et 2 URLs en dur de
      moins. **Non vérifié dans un navigateur** (session staff requise ; e2e jamais contre la prod).
- [ ] Éditer une équipe dans un tiroir met à jour la liste sans rechargement (L17).
- [ ] Deux panneaux qui lisent la même ressource ne déclenchent qu'une requête (acquis par
      construction avec des clés partagées ; à constater sur un écran multi-panneaux).
- [ ] Aucune URL `/api/admin/…` en dur dans un module migré (cliquet `ui.rawAdminUrl` : 642).

### L11 · `useAdminForm` : formulaires sur schéma — 🟨 SOCLE LIVRÉ (2026-09-29) · pilote Twitch

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
- [x] [`hooks/admin/useAdminForm.ts`](../hooks/admin/useAdminForm.ts),
      [`useUnsavedChangesGuard`](../hooks/admin/useUnsavedChangesGuard.ts),
      [`components/admin/form/FormField.tsx`](../components/admin/form/FormField.tsx).
- [x] **Deux schémas, une seule fois les règles** : `XxxForm = z.object(champs).transform(…)
      .pipe(XxxBody)` — le formulaire applique exactement la validation de la route, avec les
      mêmes noms de champs.
- [x] Une erreur serveur (`fields`, ici « cette chaîne existe déjà ») s'affiche sous le bon
      champ, focus compris. (400 + `code: 'validation'`, cf. L4, et non 422.)
- [x] `isDirty` compare aux valeurs de départ ; quitter une page modifiée demande confirmation
      (navigation Next **et** fermeture d'onglet).
- [x] Accessibilité : `<label htmlFor>`, aide et erreur reliées par `aria-describedby`, erreur
      en `role="alert"`, `aria-required` plutôt que `required` (sinon la bulle native du
      navigateur passe avant nos messages). Les anciens formulaires Twitch n'avaient **aucun**
      label relié à son champ.
- [x] Un nom de champ inconnu ne compile pas (`NoInfer`, vérifié par mutation : « Did you mean
      "badge" ? »).
- [x] Testé **rendu** (`@testing-library/react` + happy-dom, politique zéro dépendance levée
      le 2026-09-29) : 7 tests du hook et du champ.
- [x] Pilote : chaînes Twitch — routes `twitch-channels` et `twitch-channels/[id]` migrées
      (tests existants inchangés), modale de création et page d'édition sur un seul
      composant de champs ; `defineAdminRoute` sait répondre 204.
- [ ] Le formulaire d'édition d'équipe passe de 45 `useState` à ≤ 5 (L17).

**Ce que le pilote a appris** :
- Le type `ReturnType<typeof useAdminForm>` ne se passe pas à un composant de champs
  (contravariance) : les composants reçoivent `AdminFormHandle<noms>`, interface en syntaxe de
  méthode. Sans `NoInfer` sur `name`, cette même souplesse laissait passer une faute de frappe.
- La modale n'utilise plus `useIdempotentMutation` : elle perd la **mise en file hors ligne**
  (`BgSyncQueuedError`) de ce hook. Sans objet pour une création de chaîne, à garder en tête
  pour les gestes de jour de match (check-in, scores) quand ils migreront.
- `testing-library` ne nettoie pas le DOM seul sans les globals de vitest :
  `afterEach(cleanup)` dans chaque `*.test.tsx`.

### L12 · L'admin en « Le Ruban » — 🟨 FONDATIONS + COQUILLE LIVRÉES (2026-09-29)

**Direction** : aucune nouvelle. L'identité « Le Ruban » est verrouillée depuis le 2026-09-05 et
son canvas contient déjà six planches admin (pilotage du jour, tableau de bord tournoi, Liste,
Fiche, régie, système). La refonte les pose ; aperçu validé le 2026-09-29 :
https://claude.ai/artifact/BqZnJEFewX798q4NzQBwJb.

**Livré**
- [x] **Fondations** [`styles/admin-ruban.css`](../styles/admin-ruban.css), portée
      `[data-surface="admin"]` (posée par `_app` sur `/admin`) : jetons exacts de la planche
      « Du dessin au code », polices Archivo + Instrument Sans (`next/font`, sans préchargement
      côté public), titres en capitales condensées, en-têtes de table en « eyebrow », chiffres
      tabulaires, focus orchidée, deux rayons (4 / 14 px). Le site public ne bouge pas.
- [x] **Pont Tailwind — compromis validé** : dans l'admin seulement, gris → encre, violets →
      orchidée exacte, rampes « jaunes » → orchidée (pas de jaune de marque), froids → feuille.
      Les 133 écrans changent d'un coup ; chaque écran repasse aux jetons nommés à sa découpe.
- [x] **Coquille** [`features/admin/_shared/shell/AdminShell.tsx`](../features/admin/_shared/shell/AdminShell.tsx) :
      barre latérale par sections (sous-sections repliées, dépliées quand elles contiennent la
      page), recherche → palette ⌘K, bandeau (fil d'Ariane, badge d'alertes, rôle, profil),
      tiroir sous `lg`. Remplace l'ancienne barre à menus déroulants (supprimée) ; mêmes droits
      (`filterAdminLinks`), même badge d'alertes (logique sortie dans `useAdminAlertsCount`).
- [x] Onglets (`role="tab"`), puces d'état (`data-chip`) et boutons d'action alignés sur les
      planches par CSS de portée admin — l'espace joueuse, qui partage ces composants, ne
      bouge pas.
- [x] Vérifié en capture réelle (Playwright, 1440 px et 400 px) sur
      [`/dev/admin-preview`](../pages/dev/admin-preview.tsx) — vraie coquille, balisage copié des
      écrans actuels. **404 en production.** Les écrans réels, derrière connexion staff, n'ont pas
      été capturés.

**Reste**
- [x] **Archétype Liste** (planche « AdminListes », 24 écrans) :
      [`features/admin/_shared/ui/`](../features/admin/_shared/ui/) — `AdminPageHeader`,
      `AdminButton` (primaire vert feuille = l'action qui fait avancer, secondaire orchidée,
      fantôme, danger), `StatTile`, `ListToolbar` / `ListSearch` / `FilterSelect`
      (« STATUT : TOUTES ▾ », orchidée quand actif), `Chip` (signal seulement ; halo réservé au
      direct). `DataTable` : bandeau de sélection orchidée, pied « 8 sur 12 · page 1 sur 2 » +
      pages numérotées (`pageWindow`), état vide hachuré (`data-empty`). Vérifié en capture.
- [x] Premier écran sur l'archétype : adhérents (en-tête, tuiles, filtres en puces dans l'URL).
- [x] **Pilotage du jour** (planche « Admin ») : nouvel écran [`/admin/pilotage`](../pages/admin/pilotage.tsx),
      module [`features/admin/pilotage`](../features/admin/pilotage/), en tête de la section
      Compétition. Lit le tournoi en cours via `fetchDashboardData` (aucune requête nouvelle) ;
      file d'attente **triée par urgence** — litige, en direct, en retard, imminent (< 2 h),
      planifié — dans une fonction pure testée ([`build.ts`](../features/admin/pilotage/build.ts)) ;
      tuiles check-in 24 h / en cours / à arbitrer / avancement ; journal du staff ; actions
      rapides ; rafraîchi toutes les 30 s ; tuiles sur 2 colonnes dès le téléphone. Vérifié en
      capture (vraie vue, vraie file, données d'exemple). Limite : un litige n'affiche pas son
      numéro de manche (absent de `disputesOpen`).
- [x] **Archétype Fiche** (planche « AdminFiches », 22 écrans) : `EntityHeader` (écusson, état
      « MODIFICATIONS NON ENREGISTRÉES », Annuler / Enregistrer), `FicheLayout` / `FicheSection` /
      `MetaList`, `DangerZone` (confirmation par **saisie du nom**, testée),
      `EntityHistoryCard` (3 dernières entrées + tiroir complet ; masquée sans droit de lecture) ;
      champs de formulaire restylés (libellé étroit, 44 px). Premier écran : la fiche d'une
      chaîne Twitch ([`TwitchChannelFiche`](../features/admin/diffusion/TwitchChannelFiche.tsx)),
      qui gagne le retrait en zone sensible ; `twitch_channel` rejoint les types d'historique.
- [x] Cascade : les règles typographiques globales passent en `@layer base` — hors couche,
      elles écrasaient les classes explicites des composants Le Ruban (vu en capture).
- [x] **Passe visuelle, lot 1 (12 écrans)** — briques d'archétype sans toucher à la logique
      de données (appels, routes, `data-testid` identiques, vérifié au diff) :
      fiches casteuse, membre de pôle, partenaire, actualité ; listes webhooks, clés d'API,
      documents, classements, événements, espaces, consommation d'API, salons Discord d'équipe.
      Faite par trois agents en parallèle sur des fichiers disjoints, vérifiée ensuite (tsc,
      gardes). Le cliquet a refusé 4 `useState` ajoutés pour les dates des fiches : fusionnés
      avec l'état `loading` qu'ils rendaient redondant.
- [x] **Passe visuelle, lot 2 (18 écrans)** : fiches scrim, demande de partenariat, adhérent
      (fiche + création), nouvelle actualité ; listes chaînes Twitch, ligues, pool de maps,
      modèles de tournoi, corbeille, tournois, presets de partie ; onboarding, overlays ; en-têtes
      des hubs Association, Modération, Communications, TCG. Consigne « aucun nouvel état »
      tenue (cliquet à zéro), aucun appel / navigation / `data-testid` perdu (vérifié au diff).
      La suppression d'un scrim passe de `confirm()` à la zone sensible (saisie du nom).
- [x] **Passe visuelle, lot 3 (18 fichiers)** : barre d'onglets du tournoi ; sous-pages cartes,
      pool, cagnotte, Discord, historique, statistiques, opérations en lot, outils, planning,
      phases, bracket ; quick bracket, réseau, création d'équipe et de phase, historique de
      phase, fiche d'un espace et sa configuration Discord. Écrans d'opérations : confirmations,
      garde-fous et ordre des étapes inchangés. Le garde de taille a refusé la croissance de la
      configuration Discord (fichier gelé) : la rangée de champs est sortie
      (`features/admin/tenants/ui/SnowflakeField.tsx`), gel abaissé 693 → 690.
- [x] **Passe visuelle, lot 4 (18 écrans)** : accueil admin, statistiques, partenaires, scrims,
      journaux, réglages du site, joueuses libres, aide-tournoi ; vues staff et capitaine d'un
      compte, fiche d'équipe, draft d'une manche, cockpit caster ; équipes et rondes suisses
      d'une phase, édition du tournoi, fiche d'un match, facturation. Les fichiers proches du
      gel ont maigri par extraction présentationnelle (`stages/ui/SwissRounds.tsx`,
      `matches/ui/MatchDetailBlocks.tsx`, `billing/ui/PlanCapabilities.tsx`) : édition du
      tournoi 773 → 624 lignes. Aucun appel réseau, `data-testid` ni confirmation perdu (diff
      comparé) ; cliquet inchangé.
- [x] **Passe visuelle, lot 5 (12 écrans, 770–1 100 lignes)** : fiche, poules et seeding d'une
      phase, ligue, création de tournoi ; création de compte, vue joueuse, fiche d'une demande,
      grille de scrim ; régie, console live, Director (états live en `Chip` ton `live` et
      `--glow-live`). Extractions présentationnelles dans `stages/ui`, `leagues/ui`,
      `tournaments/ui`, `users/ui`, `demandes/ui`, `scrims/ui`, `diffusion/ui`, `events/ui`.
      Pages > 800 lignes : 20 → 14 ; gels de taille abaissés (demande 923 → 443, création de
      tournoi 801 → 573…) ; `useState` −4. Restent hors Ruban : composants partagés du Director
      (TimelineBuilder, WaveBoard…), `StageTabsNav`, `Modal`, `RealtimeStatusBadge`.
- [x] **Passe visuelle, lot 6 (3 écrans de 1 200 à 1 500 lignes, avec découpe)** : liste des
      équipes 1 208 → 653 (`teams/ui/TeamsList*`), édition d'un match 1 313 → 705
      (`matches/ui/MatchEdit*`), édition d'une équipe 1 498 → 1 087 (`teams/ui/TeamEdit*`, et
      roster `components/admin/teams/*` aux jetons ; « Enregistrer » monte dans l'en-tête,
      relié par `form=`). Pages > 800 lignes : 14 → 12. Restent à l'ancienne palette :
      `MatchGamesPanel`, `MatchReadinessChecklist`, `MatchCastAssignments`, `ConfirmDialog`,
      `LogoUpload`, modales de membre, `EntityHistoryDrawer`.
- [x] **Passe visuelle, lot 7 (3 écrans de 1 600 à 1 750 lignes, avec découpe)** : liste des
      demandes 1 615 → 756 (`demandes/ui/DemandesList*`, `demandes/listModel.ts`), hub du
      tournoi 1 615 → 799 (`tournaments/ui/TournamentDashboard*`, modales réseau hors `ui/`),
      « mon équipe » 1 752 → 720 (`teams/ui/MyTeam*` ; les handlers de roster passent dans
      `teams/hooks/useMyTeamMemberActions.ts`, corps relus ligne à ligne contre l'original).
      Pages > 800 lignes : 12 → 9. NB : le cliquet (useState −5, URLs en dur −7) ne mesure que
      `pages/` et `components/` ; une partie de la baisse est un DÉPLACEMENT vers `features/`,
      pas une suppression — c'est la cible d'architecture, pas encore une dette remboursée.
- [x] **Passe visuelle, lot 8 (les 3 plus gros écrans)** : matchs du tournoi 2 247 → 763
      (`tournaments/ui/TournamentMatches*`, hooks conflits + import CSV), gestion des inscrits
      2 380 → 797 (`users/ui/UsersManage*`, `users/manageModel.ts`, hook des actions en lot),
      Kanban 2 684 → 797 (`tasks/ui/TaskBoard*`, 5 hooks d'actions/dérivés ; `useState` restés
      dans la page). Corps des hooks relus contre l'original : identiques hors paramètres.
      Pages > 800 lignes : 9 → 6.
- [x] **Passe visuelle, lot 9 (fin des pages géantes)** : simulateur 2 434 → 489 (Ruban +
      `simulator/{ui,hooks}`) ; découpe pure de seeding 808 → 649, fiche de phase 922 → 792,
      édition d'équipe 1 087 → 707, vue joueuse 863 → 635, Director 1 259 → 658 (blocs de
      mise en page du Director en Ruban). Corps des hooks relus contre l'original.
      **Pages admin > 800 lignes : 0** (20 au début de la passe visuelle).
- [ ] Code mort : `components/admin/simulator/SummaryCard.tsx` n'est plus importé.
- [x] **Passe visuelle, lot 10 (composants partagés)** : pont Tailwind étendu aux signaux
      (`styles/admin-ruban.css`) ; primitives (Modal, ConfirmDialog, DeleteConfirmModal,
      ApiTokenRevealModal, AlertBanner, LoadingSpinner, Skeleton, Tabs, Breadcrumb,
      pagination, historique, LogoUpload…) protégées côté public ; 44 composants
      tournoi/phases/bracket/draft/matchs (`StageTabsNav` inclus, `bracket/statusTone.ts`) ;
      38 composants régie/diffusion/caster (`diffusion/ui/rubanClasses.ts`,
      `caster/fieldClasses.ts`). Laissés tels quels car rendus côté public :
      `BracketTreeView`, `InlineScoreEditor`, `DraftTimer`, `utils/statusConfig`.
- [x] **Passe visuelle, lot 11 (tous les composants restants, 126 fichiers)** : communications,
      modération, journaux, tableau de bord (36) ; onboarding, équipes (modales de membre),
      scrims, réglages, espaces, partenaires, association (47) ; simulateur + quiz, TCG,
      stats, profil, pôles, casteuses, facturation, documents, comptes, racine (43). Tables de
      couleurs → tables de tons `Chip` (`supportLabels.ts` : `severityTone`/`statusTone`) ;
      couleurs décoratives par catégorie neutralisées (familles Discord, types) ; couleurs de
      données gardées (donut, calendrier scrims, couleurs d'espace, raretés TCG, seeds).
      Gels abaissés : CampaignsPanel 1 151, SupportPanel 1 146, ProfileModal 858.
- [x] **Lot 12 — consolidation** : une seule source de classes, `features/admin/_shared/ui/ruban.ts`
      (84 consommateurs repointés ; `diffusion/ui/rubanClasses.ts` supprimé, `stages/ui/rubanClasses.ts`
      = ré-export d'alias locaux) — fin des imports croisés entre modules. `AdminButtonLink` prend
      `target`/`rel` (liens externes recopiés à la main convertis), `AdminButton` prend `ref`.
      Code mort retiré : `SummaryCard`, `overview/{StageRow,RecentMatchRow,labels}`,
      `stageTypeBadgeClass`, les `*StatusBadgeClasses`/`*DotClasses` d'`eventSegmentLabels`,
      clés i18n `breadcrumb*`/`stageFallback`/`eyebrow`/`searchLabel`.
- [ ] e2e `admin-users.spec.ts` : clique un bouton « Rechercher » qui n'existe pas sur la page
      (recherche automatique) — cassé AVANT le lot 8, à réaligner sur le vrai comportement.
- [ ] Plusieurs `primary` simultanés possibles sur les matchs du tournoi (panneaux de
      planification / édition en lot / import CSV ouverts ensemble).
- [ ] Code mort laissé par le lot 5 : `stageTypeBadgeClass`, `runStatusBadgeClasses` /
      `runStatusDotClasses`, clés i18n `breadcrumb*` des fiches phase et ligue.
- [ ] À trancher : « Notifier les capitaines » (outils du tournoi) est un envoi en masse sans
      confirmation — désormais en rouge ; faut-il ajouter une confirmation ?
- [ ] L'archivage d'un espace reste un bouton rouge (data-testid, confirm, blocage de l'espace
      principal) : `DangerZone` ne sait ni porter un `data-testid` ni désactiver une action.
- [x] Constat du lot 1 corrigé : `Chip` et `AdminButtonLink` acceptent `title` et `data-testid`.
- [ ] Tableau de bord tournoi à onglets ; les autres listes et fiches : avec les lots de
      découpe L15–L20.
- [ ] Bouton d'action principal : `AdminButton variant="primary"` (vert feuille, comme les
      planches) sur les écrans migrés ; les boutons `bg-purple-600` des autres écrans restent
      orchidée jusqu'à leur migration.
- [ ] Captures avant / après sur les écrans réels à chaque lot (garde-fou de la planche) — demande
      une session staff de test.
- [ ] Libellé du rôle dans le bandeau (« OWNER ») : `formatStaffRoleLabel` renvoie l'anglais.

### L13 · DataTable v2 : pagination serveur, vues, virtualisation — 🟨 SOCLE LIVRÉ (2026-09-29) · pilote adhérents

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
- [x] Contrat de liste [`utils/admin/listQuery.ts`](../utils/admin/listQuery.ts) : `q`, `sort`
      (**liste fermée** de colonnes), `dir`, `page`, `pageSize` (≤ 100) + filtres de l'écran →
      `{ items, total }`. Mêmes noms que l'état d'URL de la table.
- [x] [`useAdminList`](../features/admin/_shared/list.ts) : recherche, tri, page ET filtres dans
      l'URL, devenus clé de requête TanStack ; recherche temporisée (250 ms) ; la page précédente
      reste affichée, estompée, pendant que la suivante charge.
- [x] `DataTable` mode `server` : la table écrit tri et page dans l'URL, le serveur les applique ;
      seules les colonnes `sortable: true` (acceptées par le serveur) sont triables. L'ancien
      `serverPagination` reste pour les 4 écrans qui l'utilisent.
- [x] **Un lien copié rouvre la même vue** (filtres, tri, page) — par construction : tout est
      dans l'URL.
- [x] Pilote : adhérents. La route migrée sur `defineAdminRoute` + contrat de liste ; le panneau
      passe de 7 à 3 `useState` et gagne le **tri serveur** (6 colonnes), qu'il n'avait pas.
- [x] Défauts corrigés au passage :
  - la recherche des adhérents **supprimait les points** (`escapePostgrestValue`) : un email ne
    pouvait jamais être trouvé. Valeur désormais citée (`col.ilike."%…%"`) ;
  - la spec documentait `q` et `status` quand la route lisait `search` et `paymentStatus` ;
  - la création journalisait sous le slug `other` → `create_adherent`, et le journal ne garde
    que nom + email (pas les coordonnées).
- [x] Le mock Supabase lit les valeurs citées de `.or()` comme PostgREST.
- [ ] Les 4 grosses listes (équipes, utilisateurs, demandes, matchs) — avec leurs lots de
      découpe (L16–L18).
- [ ] Vues enregistrées par staff, virtualisation (> 200 lignes), export CSV **serveur** : en
      mode serveur, l'export ne sort encore que la page affichée (comme avant). À faire quand une
      liste migrée le demande — aucune ne dépasse aujourd'hui quelques centaines de lignes.

### L14 · Registre de modules (nav, gating, fil d'Ariane, palette) — ✅ LIVRÉ (2026-09-29), plan révisé

**Ce que l'état des lieux a changé.** Le registre existait déjà : `ADMIN_NAV` est la source
unique du menu et des cartes du tableau de bord, et le fil d'Ariane (`adminNavTrail.ts`) en est
dérivé et **testé** (`adminNavTrail.test.ts`). Créer un `module.ts` par domaine aurait dupliqué
`ADMIN_NAV`, pas remplacé. Ce qui manquait n'était pas un registre de plus mais une **preuve**
que le registre dit vrai.

**Ce qui a été fait.**
- [`utils/admin/adminAccess.ts`](../utils/admin/adminAccess.ts) : UNE règle d'accès client
  (`canAccess`, `rolesAdmitted`, `diffusionTabAccess`), utilisée par le menu, les onglets
  Diffusion et la palette ⌘K — chacun avait la sienne, la palette aucune.
- [`adminLinkGuards.test.ts`](../tests/unit/adminLinkGuards.test.ts) : pour les TROIS surfaces
  de liens (menu avec héritage du rôle, onglets Diffusion, palette), chaque lien mène à une page
  qui existe, dont la garde serveur se lit, et **n'admet aucun rôle que la page refuse**. Les
  liens plus fermés que leur page sont déclarés un par un, avec leur raison ; la liste ne peut
  pas se périmer.
- Défauts réels trouvés et corrigés :
  - la palette proposait « Tâches » et « Support » à tout le staff — arbitres et casters
    tombaient sur un 403 ; ses raccourcis vivent maintenant dans
    [`commandPaletteActions.ts`](../components/admin/commandPaletteActions.ts), avec leur règle ;
  - quatre onglets Diffusion (Cockpit, Live, Scènes, Overlays) se déclaraient « tout le staff »
    pour des pages réservées au caster (sans effet visible aujourd'hui : un arbitre n'atteint
    aucune page Diffusion — mais la règle écrite était fausse).

**Question ouverte (produit)** : le tableau de bord `/admin` admet bénévoles et arbitres
(contenu filtré), mais le menu ne leur montre pas « Dashboard ». Voulu ou oubli ? Déclaré dans
`NARROWER_ON_PURPOSE` en attendant la réponse.

**Non retenu** : exiger que toute page `pages/admin` figure au menu — 36 pages ne le sont pas,
presque toutes légitimement (connexion, sous-pages « nouveau… » ouvertes depuis leur liste,
anciennes routes redirigées). La règle n'aurait produit qu'une liste d'exceptions.

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
