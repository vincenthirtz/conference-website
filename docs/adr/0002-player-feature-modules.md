# ADR 0002 — Modules joueuse par domaine (`features/player/<domaine>/`)

- **Statut** : accepté, 2026-09-29
- **Plan** : [PLAN-industrialisation-joueur.md](../PLAN-industrialisation-joueur.md), lots P1, P2 et P3
- **Précédent** : [ADR 0001 — modules admin](0001-admin-feature-modules.md), dont celui-ci reprend la forme
- **Pilote prévu** : `features/player/notifications/` (écran 354 lignes, route 319, prefs push)

## Contexte

L'espace joueuse (joueuse, capitaine, manager, coach, supportrice) fait ~67 000 lignes sur
244 fichiers. Les 113 routes du périmètre aiguillent toutes `req.method` à la main, 97 importent
`supabaseAdmin`, deux gardes utilisateur (`withAuthRoute` × 69, `withSubjectRoute` × 33) et trois
modèles de droit d'équipe coexistent ; côté UI, `useAdminFetch` sert de client dans 58 fichiers,
22 fichiers importent leurs types depuis le handler `pages/api/…`, et ~4 000 classes de couleur
Tailwind sont écrites en dur. Il n'y a aucun endroit « normal » pour la logique d'un domaine.
Le **site public** est hors périmètre.

## Décision

### Forme d'un module — identique à l'admin

```
features/player/<domaine>/
├── schemas.ts     zod : entrées, sorties, DTO (source unique client + serveur)
├── repository.ts  accès Supabase typé, tenantId obligatoire, colonnes explicites
├── service.ts     règles métier ; reçoit { db, tenantId, subject, team? } — pas de HTTP
├── routes.ts      defineSubjectRoute(…) par méthode → réexporté par pages/api/player/*
├── client.ts      appels typés
├── hooks/         usePlayerXxxQuery / Mutation (clé de cache = sujet + équipe active)
└── ui/            panneaux présentationnels, sans fetch
features/player/_shared/   coquille, briques d'archétype, cache, useSchemaForm (PAS de kit Ruban)
features/shared/<domaine>/ services communs admin ↔ joueuse ↔ bot (équipe, scrim, TCG)
features/ruban/            kit « Le Ruban » unique, admin + joueuse (lot P7)
```

L'alias `@/features/*` (tsconfig) est réutilisé tel quel.

**Pourquoi `features/player` et pas un seul `features/<domaine>`** : les deux espaces n'ont ni la
même garde (staff vs sujet, `?as=` en lecture seule) ni la même coquille, et les gardes de
frontière sont plus simples par préfixe. Un service réellement partagé descend dans
`features/shared/` ; l'admin et la joueuse importent son **service**, jamais son `ui/` ni son
`repository`.

### Routes : `defineSubjectRoute` (lot P3)

Une route de module passe par [`utils/player/defineSubjectRoute.ts`](../../utils/player/defineSubjectRoute.ts),
garde « sujet » sur le même noyau que l'admin ([`utils/http/defineRoute.ts`](../../utils/http/defineRoute.ts) :
méthodes + 405/`Allow`, rate-limit par préréglages, idempotence par défaut sur les mutations,
zod, erreurs `{ error, code, fields?, requestId }`). Par méthode :

- `subject: 'self'` (défaut) — le sujet est l'appelant ; `?as=<autre>` → 403 `subject_unsupported` ;
- `subject: 'follow'` — sémantique de `withSubjectRoute` (inspection staff en lecture, tenant actif
  du staff, journal, réponse `no-store`) ; une écriture `?as=` exige `actAs: true` sur la méthode
  **et** `&act=1` / `X-Staff-Act-As: 1` côté appelant (journal `act_as_player`) ;
- `team: { permission, param? }` — `getManagedTeam` dans le tenant du sujet (surcharges J3
  comprises) puis `assertTeamPermission` ; l'accès arrive dans `ctx.team`.

Pas de CSRF (Bearer uniquement). `tenantResolution` reprend celle de la route migrée. La route
expose `handler.subjectRoute`, lu par la matrice de permissions et le contrat OpenAPI.

### Client et cache (lot P5)

- `playerRequest` ([`utils/player/playerHttp.ts`](../../utils/player/playerHttp.ts)) partage son
  cœur avec `adminRequest` ([`utils/http/authedRequest.ts`](../../utils/http/authedRequest.ts)) :
  Bearer, `Idempotency-Key` (`idempotent: true` sur une mutation), erreur `PlayerHttpError`
  (`code`, `fields`, `requestId`), 401 → `/login?next=<page courante>` sauf `skipAuthRedirect`.
- **Portée automatique** : un appel qui reçoit `scope` (`usePlayerScope()`) porte `?as=`
  (+ `&act=1` en act-as) puis `?teamId=`. Un `client.ts` ne compose plus l'URL à la main.
- Cache : page joueuse enveloppée par `withPlayerQuery(Page)` (statiques comme `seo` recopiées) ;
  sous l'admin (inspection), le client admin déjà monté est réutilisé. Clés
  `playerKey(scope, <domaine>, …)` = `['player', <sujet|self>, <équipe>, …]` : changer de sujet
  ou d'équipe relit. Lectures : `PLAYER_QUERY_OPTIONS` (pas de nouvel essai sur 4xx, pas de
  relecture au focus — en inspection chaque lecture écrit une ligne de journal staff).

### Surfaces

Un seul kit « Le Ruban » (jetons, briques, archétypes, grammaire). Une surface
(`[data-surface="admin"]`, `[data-surface="player"]`) ne diffère des autres que par sa
**densité** — jamais par ses composants ni sa palette. Conséquence : aucune brique (bouton, puce,
carte, en-tête…) n'est définie dans `features/player/**` ni `components/player/**`.

### Règles de frontière

Vérifiées par [`tests/unit/playerBoundariesGuard.test.ts`](../../tests/unit/playerBoundariesGuard.test.ts) :

1. `ui/` n'importe ni `utils/supabase`, ni un service, ni un repository, et n'appelle pas `fetch`.
2. `service` et `repository` n'importent pas `next` et ne mentionnent pas `NextApiRequest/Response`.
3. La base est **reçue** (`ctx.db`), jamais importée, hors `ui/`.
4. Un module n'importe pas l'`ui/` ni le `repository` d'un autre (`_shared` excepté).
5. Seul le service d'un module lit son repository.
6. Une route API migrée (qui importe `@/features/player/`) tient en ≤ 5 lignes de code.
7. Aucune UI joueuse n'importe `pages/api/*` — **gelé** à 22 fichiers (le plan en annonçait 13 : il ne comptait pas les imports relatifs), liste nommée.
8. Aucune UI joueuse n'appelle `/api/admin/*` — **gelé** à 3 appels (2 fichiers, tous `admin/teams/my` ; le 4e du plan était un commentaire).
9. `pages/player/**` n'importe pas `@/utils/supabase*` — **gelé** à 1 (`profile.tsx`, `supabaseBrowser`).
10. Une route `features/player/**/routes.ts` n'utilise ni `withAuthRoute` ni `withSubjectRoute` — 0.

S'y ajoutent : le bundle joueuse n'importe pas `features/admin` (0 aujourd'hui) et la **garde
« iso »** (aucune brique Ruban définie dans une surface ; le test prouve que son détecteur mord).
Les listes gelées ne font que décroître : un fichier corrigé doit en sortir.

### Taille

[`tests/unit/playerFileSizeGuard.test.ts`](../../tests/unit/playerFileSizeGuard.test.ts) : plafonds
pages 800, composants 600, routes 500 (`wc -l + 1`). Les 16 fichiers au-dessus sont gelés à leur
taille du jour ; un nouveau fichier ne dépasse pas.

## Migration : étrangleur

Pas de big-bang. Le cliquet [`playerDebtRatchet.test.ts`](../../tests/unit/playerDebtRatchet.test.ts)
gèle les compteurs de l'ancien chemin (`scripts/player-metrics.ts`) : ils ne peuvent que baisser,
et chaque migration regèle (`npm run player:metrics -- --write`). La baseline est un fichier
commun régénéré par l'orchestrateur, pas par les agents.

## Conséquences

- (+) Même forme que l'admin : un dev passe d'un espace à l'autre sans réapprendre.
- (+) Services testables sans HTTP, partageables avec l'inspection admin et le bot via `features/shared`.
- (−) Deux façons de faire coexistent pendant la migration — borné par le cliquet et les gels.
- (−) La garde « iso » repose sur des noms de briques : une brique déguisée sous un nom de domaine
  lui échappe ; la revue et la page `/dev/ruban-kit` (P7) complètent.
- TanStack Query est autorisé sous `features/player/**` (lot P5) ; un composant joueuse n'y accède
  qu'à travers un hook de module. Une garde transitive (`adminBoundariesGuard`) suit les imports
  de chaque page publique et échoue si l'une atteint TanStack ou `features/player` (hors
  `schemas.ts`, zod pur lu par le registre OpenAPI).
