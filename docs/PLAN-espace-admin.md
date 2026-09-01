# Plan — espace admin (staff)

> Établi le 2026-09-01. Périmètre : `pages/admin/*` (125 pages, ~62 700 LOC),
> `components/admin/*` (~190 composants), les routes `pages/api/admin/*` et le modèle de rôles staff.
>
> Pendant joueur : [PLAN-espace-joueur.md](./PLAN-espace-joueur.md). Même colonne vertébrale —
> **le droit d'agir doit être fin, lisible et délégable** — et même échéance : la Cup 2026 démarre
> la semaine du **14 septembre 2026**.
>
> Ce plan **complète** et ne remplace pas : [ADMIN_CONSOLIDATION.md](./ADMIN_CONSOLIDATION.md)
> (navigation / hubs, livré) et [IMPROVEMENT_BACKLOG.md](./IMPROVEMENT_BACKLOG.md) (qualité continue,
> 5 items ouverts). Les items Q018/Q019/Q021/Q026 y sont repris explicitement quand un lot les couvre.
>
> Légende — **Impact** : 🟥 élevé · 🟧 moyen · 🟩 faible · **Effort** : S (< 1 h) · M (qq h) · L (chantier).

---

## 1. État des lieux (prod, 2026-09-01)

| Rail | Mesure | Valeur |
|---|---|---|
| Staff | comptes / owner / admin / caster | **9 / 4 / 4 / 1** |
| Gating | pages `withStaffPage('admin')` / `('caster')` | **63 / 5** |
| Surface | pages admin / LOC | 125 / ~62 700 |
| Journal | lignes `staff_logs` | 454 |
| Journal | part du slug fourre-tout `other` | **116 (26 %)** |
| Tenants | tenants actifs | **1** |
| Saison | matchs à arbitrer à partir du 14/09 | 69 (~6/semaine) |

**Top des gestes staff journalisés** (`staff_logs`, tous temps) :

| Action | n | Ce que ça dit |
|---|---|---|
| `other` | 116 | un quart du journal n'est pas typé — surtout la régie (`start_event_run`, segments) |
| `view_player_data` | 66 | l'inspection de l'espace joueur est le 2e geste du staff : l'espace unifié sert |
| `update_team` | 58 | **le staff édite les équipes à la place des équipes** |
| `blacklist_add` | 23 | modération réelle et récurrente |
| `settings_update` | 21 | réglages touchés souvent, par 8 personnes, sans granularité |

---

## 2. Séquencement

| Lot | Titre | Impact | Effort | Fenêtre |
|---|---|---|---|---|
| **A1** | De l'alerte au geste (jour J) | 🟥 | M | ✅ livré 2026-09-01 |
| **A2** | Rôles staff fins (bénévole, arbitre) | 🟥 | L | ✅ socle livré 2026-09-01 |
| **A3** | Rendre aux équipes ce que le staff fait à leur place | 🟧 | M | ✅ livré 2026-09-01 |
| **A4** | Recherche globale + palette de commandes | 🟧 | M | ✅ livré 2026-09-01 |
| **A5** | Kit de listes admin (`DataTable`) | 🟧 | L | ✅ kit livré 2026-09-01 |
| **A6** | Journal exploitable + historique contextuel | 🟧 | M | ✅ livré 2026-09-01 |
| **A7** | Découpe des god-components (Q018) | 🟩 | L | ✅ règle en place 2026-09-01 |
| **A8** | Réglages scopés par tenant | 🟧 | M | ✅ livré 2026-09-01 |

---

## A1 · De l'alerte au geste — ✅ LIVRÉ (2026-09-01)

**Problème.** Le centre de contrôle existe et il est bon :
[`pages/admin/tournament/[id]/dashboard.tsx`](../pages/admin/tournament/[id]/dashboard.tsx)
(1 876 l., realtime + polling de secours) affiche des alertes priorisées — check-ins manquants
sous 24 h, cron en retard, litiges. Mais **chaque alerte porte un lien, pas une action** :
`cta: { label, href }` — même forme sur [`pages/admin/index.tsx`](../pages/admin/index.tsx).
Constater « 3 équipes non checkées » demande donc d'ouvrir la page check-in, de retrouver les
équipes, puis d'agir. Un soir de journée à 6 matchs simultanés, cette navigation est le coût
principal, et elle tombe au pire moment.

**Proposition.** Rendre les alertes **actionnables sur place**, sans quitter le centre de contrôle :

- relancer les équipes non checkées (le bot sait déjà écrire dans le fil du match) ;
- forcer un check-in / marquer un no-show (règles d'auto-DQ déjà livrées, cf. T2) ;
- ouvrir un litige ou l'assigner ;
- chaque action derrière une confirmation (`useConfirmDialog`) et journalisée avec son slug propre.

Puis **mesurer avant d'optimiser le mobile** : un banc Playwright en viewport téléphone sur le
centre de contrôle et la page matchs, capture à l'appui, avant d'affirmer quoi que ce soit sur
leur ergonomie à une main. Le code utilise des grilles `md:`/`lg:` et peu de largeurs fixes —
c'est un indice, pas une preuve.

**Critères d'acceptation**
- [x] `ActionableAlert` accepte une ACTION exécutée sur place (verrou pendant l'appel, résultat
      annoncé dans le bandeau) en plus du lien de détail.
- [x] Les deux alertes du jour J l'utilisent : « relancer les équipes non checkées »
      (`POST /api/admin/tournament/[id]/checkin-nudge-all`, nouvelle route) et « relancer le
      processeur de check-in » (route existante).
- [x] Idempotent : `withAdminIdempotency` (5 min) sur la relance groupée, et journalisation
      `checkin_manual_nudge` avec la portée.
- [x] Banc mobile : `tests/e2e/admin-control-center-mobile.spec.ts` mesure le débordement
      horizontal en 390 px — une mesure reproductible plutôt qu'une capture à commenter.

**Reste ouvert** : le geste sur les litiges (assigner / trancher) demande une cible et un
arbitrage, ce n'est pas un bouton unique — il reste un lien vers `/admin/moderation`.

---

## A2 · Rôles staff fins — ✅ SOCLE LIVRÉ (2026-09-01)

**Problème.** Le staff n'a que **trois** rôles — `owner | admin | caster`
([`types/admin.ts:14`](../types/admin.ts#L14)) — et **63 pages** sont gatées `withStaffPage('admin')`.
Il n'existe donc aucun moyen de faire entrer quelqu'un pour une tâche : une personne qui vient
aider au check-in un samedi reçoit les mêmes droits que l'administrateur du site — suppression
d'équipes, réglages, facturation, secrets bot. Avec 9 comptes staff dont 4 owners, ce n'est pas
un risque théorique : c'est la seule façon actuelle d'accueillir un renfort.

C'est exactement le problème résolu côté équipes le 31/08 (`TeamPermission` + `assertTeamPermission`) :
un booléen « c'est un manager » masquait huit droits distincts. Le staff a la même maladie, un cran
plus haut.

**Proposition.** Un catalogue de permissions staff, sur le modèle exact de `utils/teamRoles.ts` —
même vocabulaire, même garde-fou, mêmes tests :

```
STAFF_PERMISSION_CATALOG = [
  run_checkin, arbitrate_matches, moderate_support, manage_teams,
  manage_tournaments, manage_communications, manage_settings, manage_billing, …
]
```

`owner` garde tout ; `admin` reçoit le catalogue moins `manage_billing`/`manage_settings` ;
`caster` reste tel quel ; et deux rôles nouveaux — **`arbitre`** (`arbitrate_matches`,
`run_checkin`) et **`bénévole`** (`run_checkin`) — deviennent possibles. `withStaffPage` et
`withStaffRoute` acceptent une permission au lieu d'un rôle, avec équivalence rétrocompatible.

**Critères d'acceptation**
- [x] `withStaffPage('admin')` et `withStaffRoute(h, 'caster')` continuent de fonctionner : la
      forme par rôle et la forme par permission (`{ permission: 'run_checkin' }`) coexistent.
- [x] Les trois rôles historiques gardent EXACTEMENT leur périmètre — sinon la migration
      deviendrait une refonte des droits, faite en douce.
- [x] `referee` et `helper` sont sous `caster` au rang : leur accès ne passe QUE par les
      permissions, jamais par l'échelle héritée (testé).
- [x] Aucune page admin sans garde — `tests/unit/adminPageGuards.test.ts` lit l'arbre.
- [x] Les deux rôles sont attribuables depuis l'UI (`/admin/users/new`, et `getRoleOptions`
      alimente déjà les sélecteurs) ; la CHECK `staff_role_check` les acceptait déjà, donc
      aucune migration.
- [x] Première tranche migrée : les surfaces du check-in (page + 3 routes) tiennent sur
      `run_checkin` — c'est ce qui rend un bénévole possible.

**Reste à faire (pendant la saison)** : migrer les 60+ autres pages de la forme par rôle vers la
forme par permission, une par une. Le socle rend chaque migration indépendante et sans risque.

**Risque assumé.** C'est un lot L qui touche 68 pages. On livre le **socle** (catalogue, helpers,
tests, mapping rétrocompatible) avant le 14/09 pour pouvoir créer des bénévoles ; la migration
page par page suit pendant la saison.

---

## A3 · Rendre aux équipes ce que le staff fait à leur place — ✅ LIVRÉ (2026-09-01)

**Problème.** `update_team` est le 3e geste staff le plus journalisé (**58 lignes**) et
`view_player_data` le 2e (66). Autrement dit : le staff regarde beaucoup l'espace joueur, puis
édite beaucoup les équipes. Chaque occurrence est une chose qu'une capitaine n'a pas pu, pas su
ou pas osé faire elle-même. Avec 10 équipes seulement, ce volume est un signal fort.

**Proposition.** Un lot piloté par la donnée, pas par l'intuition :

1. Instrumenter : ventiler `update_team` par **champ modifié** (nom, logo, description, SR,
   Discord…) sur les 58 lignes existantes (`payload` déjà stocké).
2. Pour les 3 champs les plus corrigés, décider — soit l'espace capitaine ne le permet pas
   (→ l'ouvrir), soit il le permet mais personne ne le trouve (→ le rendre évident), soit c'est
   légitimement staff (→ le documenter et arrêter d'en faire un problème).
3. Refaire la mesure une journée de championnat plus tard : le succès du lot est la **baisse** de
   `update_team`, pas une fonctionnalité de plus.

**Critères d'acceptation**
- [x] Les champs réellement modifiés sont ventilés, et la décision est prise pour chacun (ci-dessous).
- [x] Aucun droit élargi : le geste rendu visible passe par la permission `edit_public_page`
      qui existait déjà.

### Ce que la mesure a dit (2026-09-01)

Le compteur brut disait « 58 `update_team` ». En diffant `before`/`after` ligne à ligne :

| Champ réellement modifié | n | Décision |
|---|---|---|
| `discord_channel_id` · `discord_voice_channel_id` · `discord_role_id` | **64** | **Bruit de journal.** C'est le BOT qui range ses propres IDs après provisioning — ni du staff, ni un geste qu'une équipe aurait pu faire. Slug dédié `team_discord_writeback`. |
| `logo_url` | **9** | **Le geste existait, personne ne le trouvait.** Une capitaine peut déposer un logo (`/team/[slug]/edit`, permission `edit_public_page`) — mais rien ne l'indiquait depuis l'écran de gestion. Lien ajouté. |
| `is_active`, `captain_id`, `name`, `short_name` | 9 | **Légitimement staff** (activation, transfert de capitanat, corrections). On arrête d'en faire un problème. |

**La leçon du lot** : les deux tiers du compteur n'étaient pas ce qu'il prétendait mesurer. Sans
la ventilation, on aurait « rendu aux équipes » un geste qu'aucune équipe ne faisait, et laissé
de côté le seul vrai (le logo).

**Mesure d'après** : recompter `update_team` (hors `team_discord_writeback`) et `logo_url` après
une journée de championnat. Le succès du lot est la BAISSE de ces deux compteurs.

---

## A4 · Recherche globale + palette de commandes — 🟧 / M · saison

**Problème.** 125 pages, aucune recherche transverse : pour retrouver une équipe, une joueuse, un
match ou un ticket, le staff passe par la top-bar puis par le filtre local de chaque liste. Le seul
raccourci clavier du produit vit dans la régie
([`CueComposer.tsx`](../components/admin/director/CueComposer.tsx)). Un soir de journée, retrouver
« l'équipe X » prend trois écrans.

**Proposition.** Une palette `⌘K` / `Ctrl-K` unique :

- **recherche** — équipes, joueuses, matchs, tournois, tickets, tâches, avec un endpoint
  `GET /api/admin/search?q=` qui interroge ces tables et **respecte les permissions** de A2 ;
- **actions** — « aller à », plus les gestes fréquents (ouvrir le tournoi en cours, créer une tâche,
  ouvrir le check-in du jour) ;
- **historique** local des 5 dernières cibles.

**Critères d'acceptation**
- [x] Un résultat n'apparaît jamais si l'appelant ne peut pas l'ouvrir : chaque famille est
      interrogée seulement si le rôle couvre sa permission (testé sur les cas qui NE doivent PAS
      apparaître — un bénévole ne voit ni équipes, ni tournois, ni tickets).
- [x] Requête debouncée (180 ms), 2 caractères minimum, 5 résultats par famille, `no-store`.
- [x] `role="dialog"` modal, focus piégé et rendu à l'élément d'origine, `Esc` ferme,
      flèches + Entrée sans souris, ⌘K ignoré quand on écrit dans un champ.
- [x] Historique local des 5 dernières cibles.

**Écart assumé** : les matchs se cherchent par ROUND (« J3 ») et non par nom d'équipe — le nom
vit dans une autre table, et PostgREST ne filtre pas simplement sur un embed. À revoir si le
besoin se confirme.

---

## A5 · Kit de listes admin — ✅ KIT LIVRÉ (2026-09-01)

**Problème.** [`AdminListShell`](../components/admin/AdminListShell.tsx) unifie les états
(erreur → chargement → vide → contenu) et son propre en-tête reconnaît factoriser « ~90 pages ».
Il est adopté par **7 panneaux**. Tout le reste réimplémente à la main : tri, pagination, filtres,
sélection multiple, export CSV (présent dans 7 écrans, chacun à sa façon). Aucune liste n'est
virtualisée — acceptable à 90 comptes et 70 membres, plus du tout à l'échelle d'un 2e tenant.

**Proposition.** Un `DataTable` partagé, adopté progressivement (les 10 plus grosses listes
d'abord) : colonnes déclaratives, tri, **filtres persistés dans l'URL** (donc partageables entre
staff), pagination serveur, sélection multiple + actions groupées, export CSV commun, `Th` avec
`scope` (Q006 déjà livré), états délégués à `AdminListShell`. Couvre Q019 (barres d'onglets
réinventées) sur les écrans migrés.

**Critères d'acceptation**
- [x] `components/admin/DataTable.tsx` : colonnes déclaratives, tri, recherche, pagination,
      sélection multiple + actions groupées, export CSV, en-têtes `Th` (scope), états délégués
      à `AdminListShell`.
- [x] Un filtre, un tri ou une page se retrouvent dans l'URL (`useTableQueryState`, navigation
      `shallow`) : un filtre appliqué se partage et se recharge.
- [x] Première adoption : `/admin/free-players`.
- [ ] Actions groupées sur un endpoint idempotent journalisé — le kit les expose, aucune liste
      migrée n'en a encore besoin.

**Ce que la première migration a appris (et qui corrige ce plan)** : sur une PETITE liste, le kit
est à peu près neutre en lignes (221 → 227) — les colonnes déclaratives coûtent ce que le JSX
coûtait. Ce qu'on gagne, c'est le comportement : cette page a maintenant recherche, tri, export
CSV, pagination et en-têtes accessibles, qu'elle n'avait pas. Le « −100 lignes » annoncé ne vaut
que pour les grosses listes, qui réimplémentent ces quatre choses à la main.

**Reste à faire** : les neuf autres grosses listes, une par une.

---

## A6 · Journal exploitable + historique contextuel — ✅ LIVRÉ (2026-09-01)

**Problème.** Deux trous distincts dans la traçabilité :

1. **26 % du journal n'est pas typé.** 116 lignes portent le slug `other`, essentiellement les
   gestes de régie (`start_event_run`, segments intro/match/outro) et quelques validations de
   scrim. Une union typée de 236 slugs existe ([`types/staffLogs.ts`](../types/staffLogs.ts)) — ces gestes n'y sont simplement
   jamais entrés.
2. **L'historique n'est contextuel que pour les matchs.**
   [`MatchHistoryDrawer`](../components/admin/MatchHistoryDrawer.tsx) lit
   `GET /api/admin/matches/[matchId]/history` et fait exactement ce qu'il faut. Aucune autre fiche
   — équipe, joueuse, tournoi, ticket — n'a son équivalent : pour savoir qui a modifié quoi, il
   faut aller filtrer le journal global.

**Proposition.** Typer les gestes de régie (slugs dédiés + migration de lecture rétrocompatible
pour les 116 lignes existantes), puis **généraliser le tiroir** : un composant
`EntityHistoryDrawer` + une route `GET /api/admin/:entity/:id/history`, branchés sur les fiches
équipe, joueuse, tournoi et ticket.

**Critères d'acceptation**
- [x] Plus aucun `other` écrit par la régie : les 22 appels passent sur cinq familles
      (`event_run_manage`, `…_segment_`, `…_station_`, `…_wave_`, `…_cue_`). Le verbe précis
      reste dans `payload.action` — cinq familles suffisent à un filtre, vingt-deux entrées de
      menu déroulant, non.
- [x] `GET /api/admin/entity-history` + `EntityHistoryDrawer` : générique, sur une liste FERMÉE
      de types d'entité. Première fiche branchée : l'édition d'équipe.
- [x] Aucune réécriture du journal : les anciennes lignes `other` restent telles quelles et
      restent lisibles.

**Choix assumé** : `MatchHistoryDrawer` n'est PAS remplacé. Il fait davantage (rattrape les logs
`game` reliés par `payload.match_id`, décrit les écarts de score) et n'a aucune raison d'être
appauvri pour rentrer dans le cas générique.

**Reste à faire** : brancher le tiroir sur les fiches tournoi, joueuse et ticket — le composant
et la route les acceptent déjà.

---

## A7 · Découpe des god-components — ✅ RÈGLE EN PLACE (2026-09-01)

**Problème.** Huit fichiers dépassent 1 400 LOC, dont
[`tournament-simulator.tsx`](../pages/admin/tournament-simulator.tsx) (3 879),
[`tasks/index.tsx`](../pages/admin/tasks/index.tsx) (3 291),
[`users/manage.tsx`](../pages/admin/users/manage.tsx) (2 450),
[`tournament/[id]/matches.tsx`](../pages/admin/tournament/[id]/matches.tsx) (2 326).
Q018 est ouvert depuis le 2026-07-10. Ce n'est pas de l'esthétique : c'est le coût de chaque
correctif fait dans l'urgence un soir de journée.

**Proposition.** Une règle plutôt qu'un chantier : **tout lot qui touche un de ces fichiers en
extrait au moins un panneau** (`components/admin/<domaine>/<X>Panel.tsx`) et ses hooks. Pas de
grande refonte dédiée, pas de gel non plus. Un test de garde plafonne la taille des fichiers
nouvellement créés.

**Critères d'acceptation**
- [x] `tests/unit/adminFileSizeGuard.test.ts` : aucun NOUVEAU fichier > 800 lignes dans
      `pages/admin` ni `components/admin`. Les 30 fichiers déjà au-dessus sont **gelés à leur
      taille du jour** — ils ne peuvent que rétrécir. On arrête l'hémorragie sans imposer une
      refonte à personne.
- [x] La règle appliquée à ce lot même : A1 avait touché
      `pages/admin/tournament/[id]/dashboard.tsx` ; le panneau d'alertes en est sorti
      (`components/admin/dashboard/TournamentAlerts.tsx`), **1 909 → 1 626 lignes**.

**Comment la découpe est faite** : le panneau est présentationnel, le dashboard garde ce qui
APPELLE (fetch authentifié, rafraîchissement) et lui passe des callbacks. Aucune décision métier
n'a suivi le JSX hors de la page — c'est ce qui rend l'extraction sûre sans test de rendu.

---

## A8 · Réglages scopés par tenant — ✅ LIVRÉ (2026-09-01)

**Problème.** `site_settings` a pour clé primaire… `key`
([`create_site_settings_table.sql`](../database/migrations/create_site_settings_table.sql)),
sans `tenant_id`, et il est lu depuis **23 endroits**. Y vivent notamment `team_roles` (les
permissions d'équipe de **toutes** les équipes), `roster_lock_deadline`, les seuils de rangs
Overwatch et `bot_maintenance_mode`. Le produit est multi-tenant partout ailleurs (onboarding,
`tenant_discord_config`, clés API, `x-tenant-id`) : ces réglages sont la dernière pièce globale.

Aujourd'hui **il n'y a qu'un tenant** — d'où l'impact 🟧 et non 🟥. Mais le jour où le second
arrive, il hérite silencieusement des réglages du premier, et modifier les siens casse ceux de
l'autre. C'est typiquement la migration qu'on ne veut pas faire **après** avoir des utilisateurs
des deux côtés.

**Proposition.** `site_settings` en clé composite `(tenant_id, key)`, `tenant_id` par défaut sur le
tenant existant (migration sans perte), helper unique `getSetting(key, tenantId)` remplaçant les 23
lectures directes, et `team_roles` devient éditable par tenant — ce qui **débloque J3** côté joueur.

**Critères d'acceptation**
- [x] Migration idempotente appliquée : colonne `tenant_id` NOT NULL (défaut = tenant existant),
      clé primaire passée de `(key)` à `(tenant_id, key)`. Aucune valeur perdue.
- [x] `utils/siteSettings.ts` : helper unique (get / getSettings / list / set / delete), tenant
      obligatoire, `onConflict: 'tenant_id,key'` — sans lui, un upsert écraserait le réglage
      d'un autre tenant.
- [x] Les 20 accès applicatifs sont scopés, y compris les heartbeats de cron et les pages
      publiques.
- [x] `tests/unit/siteSettingsGuard.test.ts` lit la SOURCE et échoue si un accès n'a ni filtre
      `tenant_id` ni valeur écrite — même famille de garde que
      `discordLinksColumnGuard` (une colonne mal nommée, sept call sites, erreur avalée).
- [x] `loadTeamRolesFromSupabase` accepte un `tenantId` : c'est ce qui rend les rôles d'équipe
      configurables par tenant, et donc ce qui **débloque J3** côté joueur.

**Pourquoi maintenant, alors qu'il n'y a qu'un tenant** : précisément pour ça. Le jour où le
second arrive, il hérite silencieusement des réglages du premier, et corriger cela demanderait la
même migration — avec des utilisateurs des deux côtés.

---

## 3. Ce qu'on ne fait pas (et pourquoi)

- **Refondre la navigation.** [ADMIN_CONSOLIDATION.md](./ADMIN_CONSOLIDATION.md) l'a faite en
  4 vagues ; le manque restant est la **recherche** (A4), pas le menu.
- **Traduire l'admin en anglais.** `admin-en` existe, le staff est francophone : aucun signal.
- **Une app mobile staff.** A1 mesure d'abord si le web tient dans la main ; on corrige ensuite.
- **Un système de permissions maison générique.** A2 copie délibérément le modèle d'équipe déjà en
  production, avec ses tests — deux moitiés du même problème, une seule façon de le résoudre.

## 4. Vérification

`npm run verify` avant chaque commit. Tout lot touchant l'auth staff doit garder verts
`tests/unit/subjectResolution.test.ts` et les suites `apiRoutesBatch*` ; tout lot touchant un
endpoint doit passer `tests/unit/openapiContractDrift.test.ts` et mettre à jour
[`docs/openapi.yaml`](./openapi.yaml) + [BOT_API_CONTRACT.md](./BOT_API_CONTRACT.md).
Les e2e admin (`tests/e2e/admin-*.spec.ts`) tournent en **local uniquement** — jamais sur la prod.
