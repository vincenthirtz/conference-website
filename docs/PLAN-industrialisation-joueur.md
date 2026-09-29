# Plan — industrialisation de l'espace joueuse (16 lots)

> Établi le 2026-09-29. Périmètre : tout ce qui vit derrière un login **non staff** — joueuse,
> remplaçante, capitaine, manager, coach, supportrice — soit `pages/player/**` (hors profil public
> `[userId]`), `pages/team/create.tsx`, `pages/team/[slug]/edit.tsx`, les pages à jeton
> (`checkin/[token]`, `rejoindre/[token]`, `invitation/[token]`, `auth/team-access`,
> `auth/discord-member`), `components/player/**`, les composants partagés (`components/tcg`,
> `scrim`, `predictions`, `Team`, `FreePlayers`, `TeamOpenings`, `SoloSignup`, `invitation`),
> `components/Navbar/PlayerTopBar.tsx`, et les routes `pages/api/{player,teams,team,demandes,
> scrims,checkin,invitations,players,team-openings,tcg}/**` + les deux routes utilisateur
> égarées sous `/api/admin` (`teams/my`, `me`).
>
> Ce plan **succède** à [PLAN-espace-joueur.md](./PLAN-espace-joueur.md) (J1–J7, fonctionnel,
> livré) et à [PLAN-espace-unifie.md](./PLAN-espace-unifie.md) (S1–S5 : sujet `?as=`, act-as, kit
> `components/ui`). Ceux-là ont ajouté ce qui manquait à la joueuse ; celui-ci traite **la manière
> dont l'espace est construit**, sur le modèle de [PLAN-industrialisation-admin.md](./PLAN-industrialisation-admin.md)
> et de l'[ADR 0001](./adr/0001-admin-feature-modules.md). Les pages publiques anonymes (fiche
> équipe, scrims publics, TCG vitrine, recrutement) sont **hors périmètre principal** : elles ne
> sont citées que parce qu'elles partagent des composants.
>
> Légende — **Impact** : 🟥 élevé · 🟧 moyen · 🟩 faible · **Effort** : S (< 1 h) · M (qq h) ·
> L (1–2 j) · XL (plusieurs sessions).

---

## 0. Comment l'exécuter

Les lots sont taillés pour des **agents parallèles, 2 à 3 par vague**, avec la méthode qui a
marché sur l'admin :

1. **Une vague = des lots sans fichier commun.** Le tableau du § 3 donne les dépendances ; deux
   lots d'une même vague ne touchent jamais le même fichier de page, de route ou de composant.
2. **L'agent ne commite pas, ne pousse pas.** Il rend un **rapport court** : fichiers touchés,
   compteurs avant/après (`npm run -s player:metrics` sans `--write`), tests ciblés lancés,
   ce qui reste. Pas de résumé de code.
3. **Vérification centrale** par l'orchestrateur après chaque vague : `tsc --noEmit`, les gardes
   (`noHardcodedFrench`, `i18nLocaleParity`, `playerFileSizeGuard`, `playerDebtRatchet`,
   `playerBoundariesGuard`, + les gardes admin si un fichier partagé a bougé), les tests unitaires
   qui importent les fichiers touchés, puis la CI GitHub. **Jamais `npm run verify` sur le Mac.**
4. **Fichiers communs régénérés par l'orchestrateur, pas par les agents** : baseline
   `tests/unit/__fixtures__/player-debt-baseline.json`, index des locales `lib/i18n/locales/*`,
   `docs/openapi/inferred-responses.json`, registres partagés (`playerLinks`, requêtes
   `_shared/query`). Un agent qui en a besoin le signale dans son rapport.
5. **Diff de sécurité comportementale** à chaque lot d'UI : appels réseau, `router.push`,
   `data-testid`, `aria-*`, `confirm(` — aucun perdu (même contrôle que la passe Ruban admin).
6. Commit par l'orchestrateur, **un commit par préoccupation** ; un seul push par série, et
   seulement sur feu vert explicite (`work` déploie en prod).

---

## 1. Diagnostic chiffré (2026-09-29)

Mesuré par script sur le dépôt (LOC = `wc -l`), pas estimé.

### Taille

| Zone | Fichiers | LOC | Au-dessus du seuil |
|---|---|---|---|
| Pages connectées (joueuse, capitaine, jetons) | 28 | 14 295 | **6 pages > 800** |
| `components/player` | 67 | 17 597 | **3 composants > 600** |
| Composants partagés (tcg, scrim, predictions, Team, FreePlayers, TeamOpenings, SoloSignup, invitation) | 36 | 9 647 | 0 |
| `pages/api/player` | 59 | 13 619 | **5 routes > 500** |
| `pages/api/teams` + `team` | 36 | 9 102 | **1 route > 500** |
| Autres API joueuse (demandes, scrims, checkin, invitations, players, team-openings, tcg) | 18 | 2 831 | **1 route > 500** |
| **Total périmètre** | **244** | **~67 100** | |
| *Pages publiques qui partagent les composants* | *14* | *6 175* | *2 pages > 800* |

Les plus lourds, là où se concentre le risque :

| Fichier | LOC | `useState` |
|---|---|---|
| [`PlayerManageTeamScreen.tsx`](../components/player/screens/PlayerManageTeamScreen.tsx) | **2 221** | 24 |
| [`team/create.tsx`](../pages/team/create.tsx) | 1 983 | 24 |
| [`player/tcg.tsx`](../pages/player/tcg.tsx) | 1 795 | 21 |
| [`api/teams/create-with-member.ts`](../pages/api/teams/create-with-member.ts) | 1 386 | — |
| [`player/tcg/echanges.tsx`](../pages/player/tcg/echanges.tsx) | 1 256 | 15 |
| [`PlayerDashboardScreen.tsx`](../components/player/screens/PlayerDashboardScreen.tsx) | 1 223 | 19 |
| [`team/[slug]/edit.tsx`](../pages/team/[slug]/edit.tsx) | 1 125 | 22 |
| [`player/profile.tsx`](../pages/player/profile.tsx) | 1 074 | **31** |
| [`player/messages.tsx`](../pages/player/messages.tsx) | 898 | 16 |
| [`api/player/tcg/packs.ts`](../pages/api/player/tcg/packs.ts) | 777 | — |
| [`api/player/dashboard.ts`](../pages/api/player/dashboard.ts) | 706 | — |

Autres routes > 500 : `player/matches/[matchId]/report-score` (543), `player/tcg/collection`
(538), `player/teams-directory` (536), `demandes/register-team` (516). Composant > 600 :
`PlayerMatchScreen` (672). Publiques > 800 : `player/[userId]` (1 386), `team/[slug]/index`
(1 006).

### Ce qui fait « monolithe » — les symptômes, pas la taille

| Symptôme | Mesure | Conséquence |
|---|---|---|
| Aiguillage par méthode fait à la main | **113 / 113** routes testent `req.method` | chaque route recâble auth, rate-limit, validation, réponse |
| Deux gardes utilisateur concurrentes | `withAuthRoute` × **69**, `withSubjectRoute` × **33** (5 routes mélangent les deux selon la méthode), 15 routes publiques/à jeton sans garde | savoir si une route « suit » `?as=` demande de lire son code |
| **Trois** modèles de droit d'équipe | `assertTeamPermission` (tenant-scopé) × **26** routes, `hasTeamPermission` (non scopé, cf. § sécurité) × **5**, `captain_id` testé à la main × **20** | un droit délégué (J3) peut être honoré ici et ignoré là |
| Logique métier dans le handler | **97 / 113** routes importent `supabaseAdmin` directement | rien de réutilisable entre joueuse, admin (inspection) et bot sans passer par HTTP |
| Validation d'entrée hétérogène | zod dans **18** routes sur 113 ; **35** routes lisent `req.body` sans zod ; `req.body as` × 5 | validation à la main, inégale |
| Idempotence HTTP rare | **9** routes (clé d'idempotence) sur ~74 à branche d'écriture | double tap sur mobile = double écriture, sauf là où la base protège (TCG : unicité + réservation atomique) |
| Lectures non typées | `select('*')` × **29** dans les routes (+3 en SSR public) — dont une route **publique** (cf. § sécurité) | colonne ajoutée = fuite silencieuse ; colonne renommée = casse en prod |
| Forme d'erreur libre | `.json({ error` × **881** ; `code:` machine × 65 seulement (player + teams) | l'UI ne sait qu'afficher le texte — souvent français, côté serveur |
| Route utilisateur sous `/api/admin` | `admin/teams/my` (appelée 4× par l'écran capitaine), `admin/me` | frontière admin/joueuse brouillée ; comptée dans le cliquet admin |
| Client « admin » partout | `useAdminFetch` dans **57** fichiers d'UI joueuse ; **209** URLs `/api/…` en dur | pas de cache, pas de type de réponse, chaque carte refait loading/erreur |
| Types importés depuis les routes | **13** fichiers d'UI font `import type … from '@/pages/api/…'` | l'UI dépend du fichier handler, pas d'un contrat |
| État local éclaté | **571** `useState` (pages 242, `components/player` 199, partagés 130) ; 11 fichiers ≥ 15 | brouillons incohérents (chargé ≠ édité ≠ sauvé) |
| Couleurs en dur | **3 963** classes de couleur Tailwind (pages 1 374, `components/player` 1 819, partagés 770) ; surface carte `bg-white/[0.03]` × 111 | « Le Ruban » impossible à poser sans pont ; divergences de gris/violets |
| Aucun test de composant | **0** `*.test.tsx` sur l'UI joueuse (13 tests unitaires lisent la source) | un découpage d'écran n'a pour filet que l'e2e |
| Mobile peu testé | projet Playwright **unique** `Desktop Chrome` ; **2** specs sur 27 passent en 375 px (`player-nav`, `player-match-thread`) | l'usage réel (téléphone, PWA) n'est pas celui qui est testé |

### Mobile d'abord : ce que dit le code

- `utils/layout/appChrome.ts` : l'espace joueuse est dans le **périmètre PWA** (`appScope` =
  admin | caster | player) — installé sur l'écran d'accueil, plein écran.
- J7 l'a posé comme exigence : le jour de match se joue « au téléphone, souvent en vocal
  Discord » ; cibles ≥ 44 px et `aria-live` vérifiés par `player-match-thread.spec.ts`.
- Les écrans sont déjà écrits colonne unique par défaut : `sm:` × 70, `md:` × 16, `lg:` × 11 sur
  `pages/player` + `components/player`.
- **Non mesuré** : la part réelle de trafic mobile (Umami ne suit que le site vitrine, sous
  consentement). Hypothèse retenue : mobile majoritaire, à confirmer.

### Rôles : qui voit et fait quoi aujourd'hui

Deux dimensions distinctes (cf. mémoire *staff vs team roles*) : le **rôle d'équipe**
(`team_members.role` ∈ `player | coach | substitute | manager`, + `teams.captain_id`) et les
**permissions d'équipe** (`utils/teamRoles.ts`, 8 : `manage_roster`, `manage_team_info`,
`manage_scrims`, `manage_join_requests`, `register_tournaments`, `send_captain_messages`,
`edit_public_page`, `validate_lineup`), configurables par tenant et surchargeables par membre (J3).

| Persona | Voit | Peut faire |
|---|---|---|
| **Supportrice** (compte sans équipe) | tableau de bord réduit, `SupporterWelcomeCard`, TCG, pronostics, découverte (opt-in), notifications | réclamer le cadeau de bienvenue, TCG, pronostiquer, demander à rejoindre / créer une équipe |
| **Joueuse / remplaçante** | + son équipe, agenda, matchs, fil du match (état seul), santé/rythme d'équipe | quitter l'équipe, demande de transfert, check-in si délégué, préférences, comptes liés |
| **Coach** | + préparation/débrief (J5) | `manage_scrims`, `validate_lineup` (feuille de match) — jamais roster ni report |
| **Manager** | + console multi-équipes (J4, `ActiveTeamSwitcher`) | les 8 permissions par défaut |
| **Capitaine** | tout ce qui précède | toutes les permissions quel que soit son rôle + transfert de capitanat, report de score (`captain_id` direct) |
| **Staff en inspection** (`?as=`, admin min.) | l'écran de la joueuse, lecture seule, journalisé | écrire « à la place » sur **12** routes `allowActAs` (roster, invitations, liens, feuille, capitanat), double clé + journal `act_as_player` |

### Ce qui existe déjà et qu'on garde

- `withSubjectRoute` / `resolveSubject` ([`utils/subject.ts`](../utils/subject.ts)) : sujet
  explicite, lecture seule par défaut, tenant du staff en inspection, audit par requête, act-as à
  double clé. Relu : les 12 routes `allowActAs` écrivent bien sur `subject.userId` (seule
  `join-requests` lit `user.id`, volontairement, pour l'auteur du journal).
- `assertTeamPermission` / `getManagedTeams` ([`utils/teams/managementAccess.ts`](../utils/teams/managementAccess.ts)),
  tenant-scopé, avec surcharges par membre ; `managedTeamSlice.ts` source canonique équipe/capitaine.
- `PlayerAreaProvider` + `withSubject()` côté client ; écrans `components/player/screens/*`
  partagés avec l'inspection admin.
- i18n FR/EN complète (≈ 50 namespaces joueuse) et garde `noHardcodedFrench` sur `pages` +
  `components` ; contrat OpenAPI par fragments pour **les 109** routes du périmètre.
- Kit `components/ui` (S5) ; socle admin réutilisable : `defineAdminRoute`, `AdminError`,
  `adminHttp` + `features/admin/_shared/query.tsx` (TanStack Query), `useAdminForm`, types
  Supabase générés (`types/database.generated.ts`), `styles/admin-ruban.css`, script de métriques,
  gardes de taille et de frontière.
- Protection monétaire TCG **en base** (réservation `recycled_at IS NULL`, registre à clé unique,
  RPC `tcg_forge_card`) — à ne pas remplacer par une idempotence HTTP seule.

L'industrialisation consiste à **étendre ces pièces à la joueuse** — le socle admin a été conçu
générique, il est à 80 % réutilisable — puis à découper les monolithes par domaine.

---

## 2. Architecture cible

```
features/player/<domaine>/          ← même forme que features/admin (ADR 0001)
├── schemas.ts        zod : entrées, sorties, DTO (source unique client + serveur)
├── repository.ts     accès Supabase typé, tenantId obligatoire, colonnes explicites
├── service.ts        règles métier ; reçoit { db, tenantId, subject, team? } — pas de HTTP
├── routes.ts         defineSubjectRoute(…) par méthode → réexporté par pages/api/player/*
├── client.ts         appels typés
├── hooks/            usePlayerXxxQuery / Mutation (cache clé = sujet + équipe active)
└── ui/               panneaux présentationnels, sans fetch
features/player/_shared/            coquille, briques d'archétype, cache, useSchemaForm
features/shared/<domaine>/          services communs admin ↔ joueuse ↔ bot (équipe, scrim, tcg)
```

**Pourquoi `features/player` et pas un seul `features/<domaine>`** : les deux espaces n'ont pas la
même garde ni la même coquille, et les gardes de frontière sont plus simples par préfixe. Un
service réellement partagé (roster, scrim, TCG) descend dans `features/shared/` ; l'admin et la
joueuse importent son **service**, jamais son `ui/` ni son `repository` (règle 4 de l'ADR 0001).

### `defineSubjectRoute` — la route déclarative côté sujet

Même pipeline que `defineAdminRoute`, garde différente :

```ts
export default defineSubjectRoute({
  methods: {
    GET:   { subject: 'follow', query: Q, handler },          // suit ?as= (inspection)
    PATCH: { team: { permission: 'manage_roster' },           // assertTeamPermission, tenant-scopé
             body: B, actAs: true, audit: 'team_member_updated', handler },
  },
});
```

Ordre : méthode déclarée (405 + `Allow`) → auth Bearer → **sujet** (`subject: 'self' | 'follow'`,
`'self'` par défaut = `?as=` refusé, ce qui remplace le choix implicite `withAuthRoute` /
`withSubjectRoute`) → **équipe** (`team: { from: 'query'|'body'|'active', permission?,
role?: 'captain' }` → résout l'équipe DANS le tenant et appelle `assertTeamPermission` : un seul
modèle de droit) → rate-limit (préréglages) → idempotence (par défaut sur les mutations, clé
envoyée par le client) → zod `query`/`body` → handler (retourne) → erreurs `PlayerError`
`{ error, code, fields?, requestId }` → audit (act-as obligatoirement déclaré). Pas de CSRF :
auth Bearer uniquement (un navigateur ne l'attache pas seul) — à conserver ainsi.

`utils/admin/defineAdminRoute.ts` est factorisé en un noyau `utils/http/defineRoute.ts`
(méthode, rate-limit, idempotence, zod, enveloppe, erreurs) + deux gardes (staff / sujet). Les
routes à jeton (`checkin`, `agenda.ics`, invitations) et publiques ont une garde `token` / `public`
du même noyau.

### Client typé + cache

- `utils/player/playerHttp.ts` : même contrat que `adminHttp` (Bearer, 401 → `/login?next=`),
  **suffixe `?as=` / `&act=1` / `teamId` automatiquement** depuis `PlayerAreaProvider` pour les
  routes déclarées `follow` : l'oubli de `withSubject()` devient impossible.
- Requêtes TanStack Query (le `QueryClient` de `features/admin/_shared/query.tsx` monte à la
  racine joueuse) ; clés `[domaine, sujet, équipeActive, …]` — changer d'équipe ou d'inspecté
  invalide tout seul.
- Mutations : clé d'idempotence générée par geste, file hors ligne (`BgSyncQueuedError`) conservée
  pour les gestes de jour de match (check-in, report, feuille) — leçon du pilote `useAdminForm`.

### Formulaires sur schéma

`hooks/admin/useAdminForm.ts` → `hooks/forms/useSchemaForm.ts` (l'admin garde un alias).
Brouillon, dirty, erreurs par champ depuis `PlayerError.fields`, messages traduits par `code`.

### Un seul « Le Ruban », iso entre l'admin et l'espace joueuse (exigence du 2026-09-29)

**Règle** : l'admin et l'espace joueuse (joueuse, capitaine, manager, coach, supportrice) partagent **un seul kit** — mêmes jetons, mêmes
briques, mêmes archétypes, même grammaire (couleur = signal, un seul `primary` par zone, deux
rayons, Archivo / Instrument Sans). Une surface ne diffère des autres **que par sa densité**
(cibles, corps, espacements) — jamais par ses composants ni sa palette.

- **Kit unique `features/ruban/`** : les briques aujourd'hui dans `features/admin/_shared/ui/`
  (`AdminButton` → `Button`, `AdminButtonLink` → `ButtonLink`, `Chip`, `StatTile`,
  `EntityHeader`, `Fiche`, `ListToolbar`, `DangerZone`, `AdminPageHeader` → `PageHeader`, classes
  `ruban.ts`) y déménagent ; `features/admin/_shared/ui/*` devient un ré-export (puis disparaît).
  Les primitives `components/ui/*` (Modal, Tabs, Skeleton…) prennent la même grammaire.
- **Jetons uniques `styles/ruban-tokens.css`** (extraits d'`admin-ruban.css`) ; chaque surface
  n'ajoute qu'un fichier de **densité** + son pont Tailwind.
- **Garde « iso »** (test de source) : aucun module `features/player/**` ni `components/player/**`
  ne définit son propre bouton / puce / carte / en-tête ; ils importent
  `features/ruban`. Toute nouvelle brique naît dans le kit, jamais dans une surface.
- **Preuve visuelle** : page `/dev/ruban-kit` (404 en prod) qui rend chaque brique sous les deux
  surfaces (admin, player) côte à côte ; captures Playwright comparées à chaque lot visuel.

### « Le Ruban » sur une surface `[data-surface="player"]`

- `pages/_app.tsx` pose `data-surface="player"` quand `appChrome` dit `isPlayer` (même mécanique
  que l'admin, `:root:has(…)` pour les portails). Le **site public ne bouge pas** (hors périmètre) :
  les primitives partagées (Modal, Tabs, Skeleton…) ne changent que sous `[data-surface=admin]` **ou** `player`.
- `styles/ruban-tokens.css` extrait les jetons communs d'`admin-ruban.css` ; `player-ruban.css`
  ne définit que la **densité** (joueuse : cibles ≥ 44 px, corps 16 px, rayons 14 px) et le pont
  Tailwind (gris → encre, violets → orchidée, signaux → `--ok/--warn/--err`, pas de jaune).
- **Contrainte d'inspection** : les écrans joueuse sont déjà rendus sous `[data-surface=admin]`
  dans `admin/users/[userId]/player-view` et `captain-view` — les deux surfaces doivent donner le
  même rendu à densité près.
- Archétypes joueuse, **mobile d'abord** (375 px de référence, `lg:` = amélioration) :

| Archétype | Pour | Remplace |
|---|---|---|
| **Fil** | tableau de bord, fil du match, notifications : cartes empilées, action principale en bas de pouce | `PlayerDashboardScreen`, `PlayerMatchScreen` |
| **Fiche** | profil, équipe, scrim : en-tête + sections repliables + barre d'action collante | `profile`, `PlayerManageTeamScreen`, `team/[slug]/edit` |
| **Liste** | matchs, demandes, annuaire, échanges : lignes tactiles, filtres en feuille basse, pagination par curseur | `teams`, `requests`, `tcg/echanges`, `discovery` |
| **Parcours** | création d'équipe, adhésion, check-in à jeton : étapes, une décision par écran | `team/create`, `join-team`, `checkin/[token]` |
| **Collection** | TCG : grille virtualisée, fiche carte en plein écran | `player/tcg` |

- Coquille `PlayerShell` : `PlayerTopBar` (493 lignes) scindée ; navigation basse en PWA
  (4 entrées : Accueil, Équipe, Matchs, TCG), sélecteur d'équipe active, cloche.

### Règles de frontière (test `playerBoundariesGuard`)

Les 6 règles de l'ADR 0001 transposées à `features/player`, plus :
7. aucune UI joueuse n'importe `@/pages/api/*` (13 aujourd'hui, gelées puis à zéro) ;
8. aucune UI joueuse n'appelle `/api/admin/*` (4 appels aujourd'hui) ;
9. `pages/player/**` n'importe pas `@/utils/supabase` ;
10. une route `features/player/**/routes.ts` n'utilise ni `withAuthRoute` ni `withSubjectRoute`.

**Stratégie : étrangleur, jamais big-bang.** Chaque socle arrive avec un cliquet ; l'ancien
chemin est gelé à son compte du jour et ne peut que décroître.

---

## 3. Séquencement

| # | Lot | Phase | Impact | Effort | Dépend de | Vague |
|---|---|---|---|---|---|---|
| **P0** | Sécurité : droits d'équipe et fuite publique | 0 · Sécurité | 🟥 | M | — | 1 |
| **P1** | Cliquet de dette joueuse | 0 · Garde-fous | 🟥 | M | — | 1 |
| **P2** | `features/player` + gardes de taille et de frontière (ADR 0002) | 0 · Garde-fous | 🟥 | M | P1 | 2 |
| **P3** | Noyau `defineRoute` + `defineSubjectRoute` | 1 · Serveur | 🟥 | L | P0, P2 | 2 |
| **P4** | Erreurs typées, schémas partagés, fin du `select('*')` | 1 · Serveur | 🟥 | L | P3 | 3 |
| **P5** | Client typé `playerHttp` + cache | 2 · Client | 🟥 | L | P3 | 3 |
| **P6** | `useSchemaForm` + tests de composants | 2 · Client | 🟧 | M | P4, P5 | 4 |
| **P7** | « Le Ruban » surface joueuse (jetons, pont, primitives) | 2 · Client | 🟧 | L | P2 | 3 |
| **P8** | Coquille `PlayerShell` + archétypes mobiles + projet e2e mobile | 2 · Client | 🟥 | L | P7 | 4 |
| **P9** | Profil, comptes liés, préférences, RGPD | 3 · Domaines | 🟧 | L | P4–P8 | 5 |
| **P10** | Équipe : roster, capitanat, droits délégués, page publique | 3 · Domaines | 🟥 | XL | P4–P8 | 5 |
| **P11** | Création d'équipe & adhésion (create, join, invitations, demandes) | 3 · Domaines | 🟥 | XL | P10 (services) | 6 |
| **P12** | Jour de match : dashboard, matchs, check-in, feuille, report, pronostics | 3 · Domaines | 🟥 | XL | P4–P8 | 5 |
| **P13** | Scrims : demandes, recherches, planning, négociation, annuaire | 3 · Domaines | 🟧 | L | P10 | 6 |
| **P14** | TCG joueuse : collection, paquets, échanges, forge, vitrine | 3 · Domaines | 🟧 | XL | P4–P8 | 6 |
| **P15** | Réseau & messages : découverte, suivis, scouting, messages, notifications | 3 · Domaines | 🟧 | L | P5, P8 | 7 |
| **P16** | Recette finale (mobile, inspection admin, public inchangé) | 4 · Recette | 🟥 | L | tout | 8 |

Chemin critique : **P0 → P1 → P2 → P3 → P4/P5 → P8**, puis domaines en parallèle (P9, P10, P12
d'abord ; P11/P13 attendent les services d'équipe de P10). P7 démarre dès P2.

**Fenêtre.** Cup 2026 en cours (round robin mer/ven) : P12 (jour de match) et P10 (roster) se
font **hors soir de match**, chaque étape déployable seule ; P0 peut partir seul, tout de suite.

---

## Phase 0 — Sécurité et garde-fous

### P0 · Sécurité : droits d'équipe et fuite publique — 🟥 / M

**Problème.** Relevé par lecture ciblée (non exhaustif, rien n'est corrigé par ce plan) :

| # | Constat | Où | Gravité |
|---|---|---|---|
| S1 | `hasTeamPermission` accorde **toutes** les permissions sur **n'importe quelle équipe, tous tenants confondus**, à tout compte dont le rôle `staff` **global** est ≥ admin, sans journal ni double clé — contourne l'act-as S4 (double clé + `act_as_player`). Les propriétaires de tenant onboardés sont `caster` globalement : le risque se limite au staff plateforme, mais c'est une écriture non tracée hors tenant actif. | [`utils/teams/permissions.ts`](../utils/teams/permissions.ts) ; 5 routes : `teams/[teamId]/{public-page,upload-image,tcg-image,members/[memberId]/profile}`, `player/team-rhythm` ; SSR de `team/[slug]/edit` | 🟥 |
| S2 | Le même helper évalue les rôles avec `loadTeamRolesFromSupabase(supabaseAdmin)` **sans tenant** → configuration de rôles du tenant par défaut appliquée aux équipes des autres tenants ; et lit `teams` sans filtre `tenant_id`. Un tenant qui retire `edit_public_page` à ses managers ne serait pas obéi sur ces 5 routes. | idem | 🟧 |
| S3 | Route **publique anonyme** `GET /api/teams/[teamId]` : `select('*')` sur `teams` via service role, cache CDN 5 min — expose `captain_id`, `discord_role_id`, `discord_channel_id`, `discord_voice_channel_id`, `deleted_at`, `is_active`, et **ne filtre pas les équipes supprimées**. Toute colonne future fuit automatiquement. | [`pages/api/teams/[teamId].ts`](../pages/api/teams/[teamId].ts) | 🟧 |
| S4 | `report-score` décide du droit par `captain_id` direct (8 occurrences) au lieu de la permission : une délégation J3 n'est pas honorée ; 20 routes au total testent `captain_id` à la main. À auditer une par une. | `player/matches/[matchId]/report-score.ts` + 19 | 🟧 |
| S5 | Exposition en inspection : la correction dépend de la discipline « chaque appel passe `withSubject()` » ; les cartes non suivies (réseau, push, comptes liés) sont masquées à la main (`!isInspecting`). Pas de faille constatée, mais aucun garde-fou. | écrans `components/player/screens/*` | 🟩 |

Vérifié **sans** constat : les 12 routes `allowActAs` écrivent sur `subject.userId` ;
`scrim-plannings/[planningId]/*` passent par `scrimPlanningParty` ; `members/[memberId]/profile`
contraint `memberId` à `teamId` ; `tcg/trades/cards?userId=` ne montre que les doubles d'une
partenaire ayant activé les échanges ; `create-with-member` exige captcha + honeypot +
rate-limit ; `checkin/[token]` et `agenda.ics` sont à jeton porteur révocable, par conception.

**Livrable.** `hasTeamPermission` devient un adaptateur de `assertTeamPermission` (tenant du
sujet, surcharges J3) ; le bypass staff passe par l'act-as (journalisé) ou disparaît ;
`/api/teams/[teamId]` liste ses colonnes publiques et filtre `deleted_at`/`is_active` ; tests de
non-régression par constat.

**Critères d'acceptation**
- [x] Test : un staff admin global **sans** act-as reçoit 403 sur les 5 routes pour une équipe
      d'un autre tenant ; avec act-as, l'écriture est journalisée `act_as_player`.
      *(2026-09-29 — `tests/unit/playerSecurityP0.test.ts` : 403 sur `public-page`, `upload-image`,
      `tcg-image`, 403/404 sur `members/[memberId]/profile`, `canAnnounce: false` sur
      `player/team-rhythm`, redirection du SSR `team/[slug]/edit` — y compris sur une équipe de son
      propre tenant où il n'a pas le droit d'équipe. **Volet act-as non applicable** : aucune de ces
      routes n'est `allowActAs` (5 × `withAuthRoute`, `team-rhythm` refuse `?as=` en écriture) ;
      l'ouvrir est hors P0, à décider en P10.)*
- [x] Test : la config de rôles du tenant B est appliquée à une équipe du tenant B.
      *(`hasTeamPermission` = adaptateur de `getManagedTeam` + `assertTeamPermission` sur le tenant
      de l'équipe ; `getManagedTeams` charge désormais les rôles de SON tenant ; surcharges J3
      honorées.)*
- [x] Test : `GET /api/teams/[id]` ne renvoie aucune des colonnes S3 et 404 sur équipe supprimée ;
      fragment OpenAPI mis à jour, drift test vert, consommateurs (bot, pages) relus.
      *(Aucun consommateur : ni page, ni composant, ni le bot — qui lit `/api/bot/v1/teams/{id}`.)*
- [x] Liste S4 : chaque test `captain_id` classé « capitanat voulu » (transfert, capitanat) ou
      « permission » (migré en P10/P12).

**Classement S4** (2026-09-29, lecture seule — rien de migré ; `report-score` laissé à P12 : aucune
permission `report_score` n'existe au catalogue, la créer touche `utils/teamRoles.ts`, l'écran de
délégation et le pendant bot `/api/bot/v1/matches/[matchId]/report`) :

| Fichier:ligne (`pages/api/…`) | Classe | Justification |
|---|---|---|
| `player/matches/[matchId]/report-score.ts:181-182` | permission (P12) | Rapporter le score est un geste délégable ; une délégation J3 n'y est pas honorée. |
| `player/matches.ts:126-127` | permission (P12) | `isCaptain` n'y sert qu'à afficher « Rapporter le score » : suit `report-score`. |
| `player/matches/[matchId].ts:250-251` | permission (P12) | `reportScore: isCaptain` — même cause, même lot. |
| `admin/me.ts:211` | permission (P10) | Ouvre l'accès « capitaine » au seul `captain_id` ; un manager/délégué n'y est pas vu — aligner sur `getManagedTeams`. |
| `teams/transfer-captain.ts:156` | capitanat voulu | Seule la capitaine transmet son propre rôle. |
| `teams/transfer-captain.ts:192` | capitanat voulu | Lit la capitaine courante pour la désignation par un manager (`manage_roster` déjà exigé). |
| `teams/update-member-role.ts:150` | capitanat voulu | Protège la ligne de la capitaine contre un manager. |
| `teams/update-member-specialty.ts:119` | capitanat voulu | Idem, sur la spécialité. |
| `teams/[teamId]/members.ts:92` | capitanat voulu | La capitaine ne peut pas être retirée du roster. |
| `teams/leave.ts:73` | capitanat voulu | Départ de la capitaine = transfert préalable ou dissolution. |
| `demandes/transfer.ts:276` | capitanat voulu | La capitaine ne demande pas de transfert sans céder son rôle. |
| `teams/invitations/index.ts:233` | capitanat voulu | On ne désigne une capitaine que s'il n'y en a pas. |
| `teams/member-permissions.ts:150` | capitanat voulu | Affiche que la capitaine a déjà tout (aucune délégation utile). |
| `teams/create-with-member.ts:898` | capitanat voulu | Écriture : la créatrice devient capitaine. |
| `player/team-health.ts:314` | capitanat voulu | Diagnostic « équipe sans capitaine ». |
| `teams/invite-links/by-token.ts:273` | capitanat voulu | Repli de l'inviteur affiché, pas un droit. |
| `teams/invite-free-player.ts:106` | lecture sans décision | Colonne lue, jamais testée (garde = `manage_roster`) — à retirer du select en P4. |
| `teams/invite-links/index.ts:219` | lecture sans décision | Idem. |
| `demandes/register-team.ts:336` | lecture sans décision | Idem (garde = `getManagedTeamForRequest`). |
| `admin/teams/my.ts:171` | lecture sans décision | Idem (garde = `manage_team_info`). |
| `player/messages.ts:58`, `player/messages/[conversationId].ts:51` | lecture sans décision | Type `CaptainTeam` seulement ; garde = `send_captain_messages`. |

### P1 · Cliquet de dette joueuse — 🟥 / M

**Problème.** Les chiffres du § 1 sont faux demain et personne ne le verra.

**Livrable.** `scripts/player-metrics.ts` (même moteur que `admin-metrics.ts`, zones du § 1) ;
`tests/unit/playerDebtRatchet.test.ts` + baseline `__fixtures__/player-debt-baseline.json` ;
`npm run player:metrics [-- --write]`.

**Critères d'acceptation**
- [x] Indicateurs gelés : LOC et fichiers > seuil (pages 800 / composants 600 / routes 500),
      `useState`, `req.method` à la main, `withAuthRoute`, `withSubjectRoute`, `hasTeamPermission`,
      `captain_id` à la main, routes sans zod lisant `req.body`, `req.body as`, `select('*')`,
      `supabaseAdmin` direct, `.json({ error`, `useAdminFetch`, URLs `/api/` en dur,
      `import type … '@/pages/api'`, classes de couleur en dur, `style={{`.
- [x] Adoption affichée : `defineSubjectRoute`, `playerHttp`, `useSchemaForm`, archétypes.
- [x] Rouge si un compteur monte ; message « baisse la baseline à N » s'il descend sans regel.
- [x] Chiffres de départ = ceux du § 1 (écarts expliqués dans la baseline) ; < 1 s sur le Mac.

### P2 · `features/player` + gardes de taille et de frontière — 🟥 / M

**Problème.** Pas d'endroit normal pour la logique d'un domaine joueuse ; aucune garde de taille
hors admin.

**Livrable.** ADR `docs/adr/0002-player-feature-modules.md` (§ 2, `features/shared`, surfaces) ;
`tests/unit/playerFileSizeGuard.test.ts` (gel des 16 fichiers au-dessus du seuil, compte
`wc -l + 1` comme l'admin) ; `tests/unit/playerBoundariesGuard.test.ts` (10 règles, exceptions
nommées et gelées) ; module pilote **`features/player/notifications/`** (petit : écran 354 lignes,
route 319, prefs push) — route + client + écran.

**Critères d'acceptation**
- [x] ADR 0002 accepté ; alias `@/features/*` réutilisé.
- [x] Garde de taille : un fichier gelé ne grossit jamais ; un nouveau fichier ne dépasse pas.
- [x] Garde de frontière : règles 7–10 gelées à 13 / 4 / 1 / 0.
      *Gel réel : **22 / 3 / 1 / 0** — règle 7 compte aussi les imports relatifs
      (`../../pages/api`, `../api`), règle 8 ignore l'occurrence en commentaire. + garde « iso »
      et « pas de `features/admin` dans le bundle joueuse » (ADR 0002).*
- [ ] Pilote notifications vert (unit + `player-notifications.spec.ts` en base locale).

---

## Phase 1 — Socle serveur

### P3 · Noyau `defineRoute` + `defineSubjectRoute` — 🟥 / L

**Problème.** 113 routes réécrivent la même plomberie ; deux gardes utilisateur et trois modèles
de droit d'équipe coexistent (§ 1).

**Livrable.** `utils/http/defineRoute.ts` (noyau extrait de `defineAdminRoute`, qui devient une
garde dessus sans changement de comportement) ; `utils/player/defineSubjectRoute.ts` (options
`subject`, `team`, `actAs`, `audit`, préréglages rate-limit) ; gardes `token` et `public`.
Migration pilote : `teams/toggle-joinable`, `teams/toggle-scrim-open` (act-as), `player/progression`
(lecture suivie), `checkin/[token]` (jeton).

**Critères d'acceptation**
- [x] Tests du pipeline : 405 + `Allow`, `?as=` refusé si `subject: 'self'`, écriture act-as
      refusée sans double clé, permission d'équipe tenant-scopée, zod → 400 `fields`, idempotence.
      *`tests/unit/defineSubjectRoute.test.ts` (surcharges J3 comprises) + matrice
      `subjectRoutePermissionMatrix` et contrat `subjectRouteContracts`, pendants des tests admin :
      toute route `defineSubjectRoute` y est découverte le jour de sa migration.*
- [x] `defineAdminRoute` : tests existants verts sans modification.
      *Noyau `utils/http/defineRoute.ts` ; `defineAdminRoute` = garde staff dessus (CSRF,
      `resolveGuard`, journal `staff_logs`). Idempotence rendue générique
      (`withIdempotency` + portée), `withAdminIdempotency` inchangé.*
- [x] Route migrée ≤ 5 lignes de code dans `pages/api` (réexport).
      *Pilotes : `teams/toggle-joinable` et `teams/toggle-scrim-open` (`features/player/teamSettings`,
      `follow` + `actAs` + `team`), `player/progression` (`features/player/progression`, lecture
      suivie). `checkin/[token]` NON migré : jour de match, et gardes `token` / `public` reportées
      (sémantiques d'erreur propres à chaque route à jeton — à concevoir avec leur premier pilote).
      Reportés aussi : option `audit` (l'act-as reste tracé `act_as_player` par `resolveSubject`),
      `team.from: 'body'|'active'` et `role: 'captain'`. L'inféreur OpenAPI reconnaît
      `defineSubjectRoute`.*
- [x] Cliquet : `withAuthRoute` + `withSubjectRoute` + `hasTeamPermission` ne peuvent que baisser.
      *Indicateurs `api.withAuthRoute` / `api.withSubjectRoute` / `api.hasTeamPermission` du cliquet
      P1 ; les pilotes font baisser le gel (regel orchestrateur).*

### P4 · Erreurs typées, schémas partagés, fin du `select('*')` — 🟥 / L

**Problème.** 881 erreurs en texte libre ; 35 routes sans validation ; 29 `select('*')`.

**Livrable.** `PlayerError` (codes partagés avec l'admin quand ils existent) ; codes → messages
dans les locales (`playerErrors` FR/EN) ; schémas zod par domaine dans `features/player/*/schemas.ts` ;
repositories à colonnes explicites typées `database.generated.ts`.

**Critères d'acceptation**
- [x] `select('*')` = 0 dans le périmètre (hors `count/head`).
      *27 → 0 (le `count/head` de `teams/leave` passe aussi sur `id`). Colonnes = ce que lisent
      l'UI, la route et les tests ; l'ancien `*` exposait notamment `staff_note`/`metadata`/
      identifiants staff de traitement (demandes), `created_by`/`source_demande_id`/`is_public`/
      `scrim_id` (sessions de planning), toute la ligne `teams` à l'appel ANONYME de
      `create-with-member`.*
- [ ] Routes lisant `req.body` sans zod = 0 ; `req.body as` = 0.
      *`req.body as` 5 → 0 ; sans zod 40 → 2 : restent `teams/create-with-member` (publique
      anonyme, 1 386 lignes → P11) et `teams/matches/[matchId]/lineup` (jour de match → P12).
      Schémas dans `features/player/{demandes,messages,scrims,team,tcg,profile,predictions,
      invitations}/schemas.ts`, appliqués par `parseBody` (`utils/player/errors.ts`) avec les
      messages et codes historiques. Le cliquet reconnaît désormais `parseBody(` /
      `.safeParse(req.body` (6 routes validaient déjà sans importer zod). Une route non migrée
      importe son schéma en RELATIF : `@/features/player/` reste le marqueur « route migrée »
      (règle 6, matrice, contrats).*
- [ ] Le client affiche le message traduit du `code`, le texte serveur reste en repli.
      *Socle posé : catalogue `PLAYER_ERROR_CODES` + `PlayerError` (`utils/player/errors.ts`),
      namespace `playerErrors` FR/EN, résolveur pur `features/player/_shared/errorMessage.ts`
      (code du catalogue → message traduit, sinon texte serveur). Branchement dans `playerHttp`
      = P5.*
- [x] Drift OpenAPI vert (`npx vitest run tests/unit/openapi`), corps via `x-zod`.
      *28 corps de requête passés en `x-zod` (`lib/apiContracts/player/bodies.ts`) ; les
      schémas « forme seule » (`update-member`, `tcg-image`, `tcg/photo`, `tcg/fanart`, achat
      `tcg/cosmetics`, `upload-image`) gardent leur fragment écrit. `inferred-responses.json`
      à régénérer (`openapi:responses`).*

---

## Phase 2 — Socle client et design system

### P5 · Client typé `playerHttp` + cache — 🟥 / L

**Problème.** `useAdminFetch` dans 57 fichiers, 209 URLs en dur, pas de cache, 13 imports de types
depuis les handlers ; le suffixe `?as=` repose sur la discipline.

**Livrable.** `utils/player/playerHttp.ts` + `features/player/_shared/query.tsx` (réutilise le
`QueryClient` admin) ; `client.ts` par module, typé depuis `schemas.ts` ; suffixe sujet/équipe
automatique pour les routes `follow` ; `/api/admin/teams/my` → `/api/player/team` (ancienne URL
en réexport le temps d'une version).

**Critères d'acceptation**
- [x] Changer d'équipe active ou d'inspectée invalide les requêtes concernées (test).
      → la clé `playerKey(scope, …)` porte sujet + équipe : en changer relit
      (`tests/unit/playerQueryHooks.test.tsx`).
- [ ] Gestes jour de match : file hors ligne conservée (test `BgSyncQueuedError`).
      → à faire avec la migration des écrans de match (hors premier pilote).
- [ ] Règle 8 (UI → `/api/admin`) à 0 ; règle 7 en baisse.
      → règle 7 : 22 → 21 (`ProgressionCard` lit `features/player/progression/schemas`).
      Règle 8 inchangée (3) : `/api/admin/teams/my` → `/api/player/team` est un
      changement serveur, pas encore fait.
- [ ] Pilote : `PlayerNotificationsScreen` et `TeamHealthCard` sans `useAdminFetch`.
      → premier pilote livré sur d'autres écrans : `ProgressionCard` (lecture en
      cache) et les bascules recrutement / scrims de `PlayerDashboardScreen` et
      `PlayerManageTeamScreen` (mutations). Notifications et TeamHealthCard restent.

**Livré (1re tranche).** Cœur commun `utils/http/authedRequest.ts` (Bearer, 401,
`Idempotency-Key`, erreur `ApiHttpError` avec `code`/`fields`/`requestId`) ;
`adminRequest` s'appuie dessus sans changer d'API ; `utils/player/playerHttp.ts`
(`playerRequest`, `PlayerHttpError`, `scopedUrl`, 401 → `/login?next=<page>`) ;
`features/player/_shared/query.tsx` (`withPlayerQuery`, `PlayerQueryProvider` qui
réutilise un client déjà monté — l'admin en inspection —, `usePlayerScope`,
`playerKey`, pas de nouvel essai sur 4xx, pas de relecture au focus) ;
`features/player/{progression,teamSettings}/{client.ts,hooks/}`. Garde TanStack
ouverte à `features/player/**` + garde transitive « aucune page publique
n'atteint TanStack ni `features/player` » (`adminBoundariesGuard`).
Écart de comportement voulu : en **act-as**, les bascules portent désormais
`?as=…&act=1` (elles partaient sans sujet, donc sur l'équipe du staff) ; le 401
du tableau de bord ramène sur la page (`/login?next=…`) au lieu de `/login` nu.
Reste : `bundle-budget.json` à regeler pour `/player` et `/player/manage-team`
(TanStack entre dans leur premier chargement, ~+12 ko gz) après un build.

### P6 · `useSchemaForm` + tests de composants — 🟧 / M

**Problème.** 11 écrans ≥ 15 `useState` ; 0 test de composant joueuse.

**Livrable.** `hooks/forms/useSchemaForm.ts` (généralise `useAdminForm`, alias admin conservé) ;
harnais `*.test.tsx` joueuse (happy-dom, `afterEach(cleanup)`, `PlayerAreaProvider` de test avec
sujet/inspection/act-as) ; pilote `HeroPreferencesCard`.

**Critères d'acceptation**
- [ ] `useAdminForm.test.tsx` vert inchangé.
- [ ] Harnais : un test prouve qu'en inspection aucune action n'est rendue sans act-as.
- [ ] Pilote : 0 `useState` de champ.

### P7 · Kit « Le Ruban » unique + surface joueuse — 🟧 / L

**Problème.** 3 963 classes de couleur en dur ; la joueuse ne voit pas la direction verrouillée
(palette exacte du logo, pas de jaune) ; la surface carte `bg-white/[0.03]` × 111 diverge de
l'admin ; les briques Ruban n'existent que sous `features/admin/_shared/ui` — les recopier côté
joueuse créerait deux kits qui divergeraient.

**Livrable.** `features/ruban/` = le kit unique (briques admin déménagées, renommées sans le
préfixe `Admin`, API inchangée ; `features/admin/_shared/ui/*` en ré-export) ;
`styles/ruban-tokens.css` (commun) + `styles/player-ruban.css` (densité mobile + pont Tailwind) ;
`data-surface="player"` posé par `_app` via `appChrome` ; primitives `components/ui/*` rendues
sous admin **ou** player avec la même grammaire ; brique `Card` du kit remplaçant la surface
carte ; page `/dev/ruban-kit` ; garde « iso » (test de source).

**Critères d'acceptation**
- [ ] L'admin consomme `features/ruban` et ne change PAS d'un pixel (captures avant/après des
      écrans admin de référence : accueil, liste, fiche, pilotage).
- [x] `/dev/ruban-kit` : chaque brique rendue sous `admin` et `player` — seules la densité et la
      taille des cibles diffèrent.
- [x] Garde « iso » verte : aucune brique Ruban redéfinie hors `features/ruban`.
- [ ] Captures avant/après (Playwright, base locale) : pages publiques **identiques** (accueil,
      fiche équipe, scrims, TCG vitrine, profil public `[userId]`) — le public est hors périmètre.
- [ ] Inspection admin : `player-view` / `captain-view` rendus sans régression.
- [x] Contraste AA sur les puces d'état ; aucune teinte jaune de marque. *(Chip, 6 tons × 4 surfaces :
      min 5,4:1 — `neutral` sur `--s3` ; ≥ 7,3:1 sur `--s1` ; test `rubanTokensFallback`.)*
- [x] Aucun jeton sans repli (un jeton non défini casse toute la déclaration) : tout `var(--x)` a un repli (`var(--x, …)`) — test grep.

### P8 · Coquille `PlayerShell` + archétypes mobiles + e2e mobile — 🟥 / L

**Problème.** Pas de coquille commune (chaque page pose son `usePlayerSession` + redirect) ;
`PlayerTopBar` 493 lignes ; l'e2e ne tourne qu'en Desktop Chrome.

**Livrable.** `features/player/_shared/shell/PlayerShell.tsx` (session, redirect, équipe active,
navigation basse PWA, cloche) ; archétypes Fil / Fiche / Liste / Parcours / Collection **composés uniquement de briques
`features/ruban`** (`features/player/_shared/ui` ne contient que des compositions, aucune brique) ; page `/dev/player-kit` (404 en prod) ; projet Playwright
`mobile` (Pixel 7 / iPhone 13) appliqué aux specs `player-*`, `captain-*`, `team-*`, `checkin-*`,
`scrim-*`, `tcg*`.

**Critères d'acceptation**
- [ ] Cibles ≥ 44 px, focus visible, `aria-live` vérifiés par spec sur chaque archétype.
- [ ] Les 27 specs du périmètre passent en projet `mobile` **et** desktop, base locale
      (`skipIfNoServiceRole` + `supabaseTestClient`).
- [ ] `player-nav.spec.ts` couvre la navigation basse.

---

## Phase 3 — Découpe des monolithes, domaine par domaine

Chaque lot : module `features/player/<domaine>` (schemas → repository → service → routes →
client → hooks → ui), pages réduites à la coquille, archétype Ruban, i18n FR/EN, cliquets
regelés à la baisse. **Définition de fini commune** (en plus des critères propres) :
- [ ] plus aucun fichier du domaine au-dessus du seuil ; `useState` de champ = 0 ;
- [ ] routes du domaine sur `defineSubjectRoute`, 0 `select('*')`, 0 `req.body` non validé ;
- [ ] specs e2e du domaine vertes mobile + desktop en base locale ; inspection admin relue.

### P9 · Profil, comptes liés, préférences, RGPD — 🟧 / L

**Problème.** `profile.tsx` 1 074 lignes, **31** `useState` ; cartes Discord/Twitch/Battle.net/
héros/TCG photo/exclusion chacune avec son fetch ; `update-profile` 382 lignes sans zod.

**Livrable.** `features/player/profile` (Fiche) ; `features/player/linked-accounts` (Discord,
Twitch, Battle.net — les deux URLs de retour Twitch inchangées) ; RGPD (`data-export`,
`delete-account`) en `subject: 'self'` strict.

**Critères** : [ ] `player-profile.spec.ts`, `player-data-rights.spec.ts` verts ;
[ ] changement d'e-mail/mot de passe : ré-auth conservée.

### P10 · Équipe : roster, capitanat, droits délégués, page publique — 🟥 / XL

**Problème.** `PlayerManageTeamScreen` **2 221** lignes ; `team/[slug]/edit` 1 125 (SSR
`supabaseAdmin`) ; 14 routes roster/membres/invitations/liens ; `captain_id` testé à la main.

**Livrable.** `features/shared/team-roster` (service commun avec `features/admin/teams` et le bot
`bot-team-*`) ; `features/player/team` : écran découpé en panneaux (identité, roster, droits J3,
liens d'invitation, demandes, rang) ; `team/[slug]/edit` sur Fiche, sans accès base en page ;
S4 résolu pour ce domaine.

**Critères** : [ ] `manage-team`, `team-management`, `team-join-requests`, `captain-transfer`,
`admin-captain-view` verts ; [ ] act-as des 12 routes inchangé (tests S4) ;
[ ] règles « capitaine toujours tout » et « coach jamais roster » testées au service.

### P11 · Création d'équipe & adhésion — 🟥 / XL

**Problème.** `team/create` 1 983 lignes (parcours anonyme + pont magic-link) et
`create-with-member` **1 386** lignes ; `join-team`, `request-captain`, `rejoindre/[token]`,
`invitation/[token]`, `demandes/*` (7 routes, 4 sans zod, 13 `select('*')`).

**Livrable.** `features/player/onboarding` (Parcours) : un service de création (captcha,
honeypot, rate-limit, `findOrCreateUserByEmail`, e-mails) découpé en étapes testables ; demandes
unifiées (rejoindre, capitanat, transfert, scrim, caster) sur un schéma commun.

**Critères** : [ ] `team-create`, `team-transfers`, `teams-import` verts ;
[ ] `create-with-member` < 500 lignes, logique au service ; [ ] erreurs serveur localisées par
`code` (déjà le cas pour la création, étendu aux demandes).

### P12 · Jour de match — 🟥 / XL

**Problème.** `PlayerDashboardScreen` 1 223, `PlayerMatchScreen` 672, `api/player/dashboard` 706,
`report-score` 543 ; check-in en double chemin (espace + jeton) ; pronostics séparés.

**Livrable.** `features/player/matchday` (Fil) : agrégat dashboard servi par un service, cartes
en `ui/` pures ; check-in, feuille, report, pronostics sur mutations idempotentes + file hors
ligne ; report sur permission (fin de S4).

**Critères** : [ ] `player-match-thread` (6 cas, 3 personas), `player-checkin`, `checkin-flow`,
`player-matches` verts en mobile ; [ ] double tap sur check-in/report = une écriture (test) ;
[ ] **hors soir de match**, déployable en 3 étapes (serveur, client, UI).

### P13 · Scrims — 🟧 / L

**Problème.** Demandes, recherches, planning (`ScrimPlanningPanel` 516, `AvailabilityCalendar`
522), négociation, annuaire `player/teams` 716 + `teams-directory` 536 ; 8 `select('*')`.

**Livrable.** `features/shared/scrim` (négociation, planning — déjà en `utils/teams/scrim*`) ;
`features/player/scrims` (Liste + Fiche) ; grille de dispos réutilisée côté public sans surface.

**Critères** : [ ] `scrim-planning`, `scrim-requests`, `scrim-response`, `scrim-public` verts ;
[ ] e-mail capitaine best-effort conservé.

### P14 · TCG joueuse — 🟧 / XL

**Problème.** `player/tcg` 1 795, `tcg/echanges` 1 256, 19 routes TCG joueuse (packs 777,
collection 538) ; protection monétaire en base à préserver.

**Livrable.** `features/player/tcg` (Collection + Liste) ; services sur `utils/tcg/*` existants ;
**aucune** logique monétaire déplacée hors des RPC/contraintes (réservation atomique, registre à
clé unique) — l'idempotence HTTP s'ajoute, ne remplace pas.

**Critères** : [ ] `tcg`, `tcg-catalog` verts ; [ ] tests `tcgReloadAfterMutation`,
`tcgShowcase`, garde `tcgPaidMatchDeleteGuard` verts ; [ ] les 3 garde-fous photo
(`readCardFaces`) inchangés.

### P15 · Réseau & messages — 🟧 / L

**Problème.** Découverte, suivis, scouting, messages (`messages.tsx` 898), notifications ; routes
volontairement **non suivies** par `?as=` (opt-in cross-tenant, RGPD).

**Livrable.** `features/player/network` et `features/player/messages` ; `subject: 'self'`
explicite sur les routes privées de réseau (la décision de `utils/subject.ts` devient déclarée) ;
découverte invisible par défaut, jamais d'annuaire public.

**Critères** : [ ] `player-discovery`, `captain-messages`, `player-notifications` verts ;
[ ] test : `?as=` → 403 sur découverte/suivis/scouting/annuaire.

---

## Phase 4 — Recette

### P16 · Recette finale — 🟥 / L

- [ ] Baseline P1 : cliquets à zéro ou exceptions nommées et justifiées.
- [ ] Recette visuelle **au téléphone** (PWA installée) : accueil, équipe, fil du match,
      check-in à jeton, création d'équipe, TCG ; et côté public, rien n'a bougé.
- [ ] e2e du périmètre verts mobile + desktop en base locale ; CI verte sur `work`.
- [ ] Inspection admin (`player-view`, `captain-view`, act-as) relue.
- [ ] ADR 0002 mis à jour ; guide « ajouter un écran joueuse » éprouvé sur un écran réel.
- [ ] Suppression des adaptateurs (`useAdminFetch` joueuse, `hasTeamPermission`, ancienne URL
      `/api/admin/teams/my`).

---

## 4. Ce qu'on ne fait pas (et pourquoi)

- **Refaire les fonctionnalités.** J1–J7 et S1–S5 sont livrés ; ce plan ne change aucun parcours
  sauf là où P0 l'exige.
- **Ruban sur le site public.** Décision du 2026-09-29 : le site public (vitrine, pages anonymes)
  est hors périmètre ; seules l'admin et l'espace joueuse / staff d'équipe portent « Le Ruban ».
- **Changer les contrats bot / publics.** Les services partagés sont réutilisés, les formes de
  réponse ne bougent pas — sauf `/api/teams/[teamId]` (P0, réduction de colonnes : consommateurs
  relus).
- **App Router, monorepo, Storybook.** Mêmes raisons que l'admin (§ 4 du plan admin) ; la page
  `/dev/player-kit` + captures Playwright suffisent.
- **Remplacer la protection monétaire TCG par de l'idempotence HTTP.** La base est la seule
  garantie qui survit aux 504 PostgREST (cf. mémoire « erreur de lecture ≠ valeur absente »).
- **Cookie httpOnly / CSRF.** Auth Bearer conservée ; pas de nouveau vecteur à ouvrir.

## 5. Risques

| Risque | Parade |
|---|---|
| Casser l'inspection admin en déplaçant les écrans partagés | harnais P6 (sujet/inspection/act-as) + `admin-player-view`, `admin-captain-view` à chaque lot d'écran |
| Ruban joueuse qui déborde sur le public | portée `:root:has([data-surface=player])`, primitives en variante ; captures publiques avant/après (P7) |
| Régression jour de match pendant la Cup | P12 hors soir de match, 3 étapes déployables seules, file hors ligne testée |
| Double écriture au changement d'idempotence | idempotence HTTP ajoutée **en plus** des contraintes en base, jamais à la place |
| Durcissement P0 qui bloque un geste légitime du staff | bypass remplacé par act-as (existe déjà) ; message `code` explicite ; annoncé au staff |
| Fichiers communs en conflit entre agents | régénérés par l'orchestrateur seulement (§ 0) |
| Faux vert (verify concurrent, CI rouge masquant les gardes suivants) | lire la sortie, pas le code ; un seul lot vérifié à la fois ; cascade attendue à la remise au vert |
| Mock Supabase qui ne valide pas les colonnes | repositories typés `database.generated.ts` ; e2e en base locale pour chaque repository neuf |

## 6. Vérification

- **Pas de `npm run verify` sur le Mac** (i7 2014) : tests ciblés (`npx vitest run <fichiers>`),
  `tsc --noEmit`, `biome check` sur les fichiers touchés, puis **CI GitHub** sur `work`.
- **e2e JAMAIS contre la prod** : base locale (`skipIfNoServiceRole` + `supabaseTestClient`),
  gardes `e2eSeedGuard` actifs ; projets `mobile` et desktop.
- **Mobile** : 375 px de référence, cibles ≥ 44 px, PWA installée pour la recette.
- **i18n FR/EN obligatoire** : aucune chaîne en dur (garde `noHardcodedFrench`, mode regex +
  soupape fin de ligne), parité `i18nLocaleParity` ; messages d'erreur par `code`.
- **Contrat** : `npx vitest run tests/unit/openapi` à chaque route touchée ; `BOT_API_CONTRACT.md`
  seulement si une route bot change (aucune prévue).
- **Cliquets** : `npm run -s player:metrics` sans `--write` avant de regeler ; ne regeler que des
  baisses ; un fichier gelé ne grossit jamais (extraire plutôt).
