# Consolidation de l'espace admin

Refactor d'architecture de l'espace `pages/admin/*` : réduire la dispersion des
pages, privilégier les onglets et les modales, et unifier la navigation en une
source unique — sans casser les favoris (redirections 308) ni élargir les droits.

**Statut :** livré en 2 vagues sur la branche `work`, points ouverts tranchés.

- Vague 1 — commit `f1d869c4` (quick wins, modales, sous-écrans tournoi, nav unifiée)
- Vague 2 — commit `6a192a82` (hubs stages / modération / onboarding, section Communication)
- Vague 3 — points ouverts : audit gating (résolu), rename **News → Actualités**,
  nouvelle section top-bar **Staff & Asso** (regroupement People/Staff), et
  **fusion du cluster Bracket** en une route à onglets (`bracket` + `builder` +
  `map-draw` + `veto`)
- Vague 4 — améliorations continues : **hub Partenaires** (fusion
  `partners` + `partnership-requests` en onglets Liste · Demandes), et
  **découvrabilité** des pages orphelines `recycle-bin` (Corbeille) et
  `aide-tournoi` exposées en cartes dashboard-only

**Reste à faire avant merge `work → master`** : passage e2e authentifié sur les
hubs (voir [§ Vérification](#vérification)). Toutes les décisions produit sont
tranchées — voir [§ Points ouverts](#points-ouverts).

---

## Pourquoi

Deux problèmes se cumulaient :

1. **Trop de pages de premier niveau** (~48 groupes de routes, 107 fichiers) —
   beaucoup n'étaient que des formulaires de création ou des listes sœurs qui
   auraient dû vivre ensemble.
2. **Deux systèmes de navigation à maintenir en parallèle** : le menu top-bar
   (`components/Navbar/adminLinks.ts`) et les cartes du tableau de bord
   (`pages/admin/index.tsx`). Toute page ajoutée/supprimée devait toucher les
   deux — d'où le « trop de pages » ressenti.

## Principes appliqués

- **Onglets plutôt que routes sœurs.** Des pages qui partagent un contexte
  deviennent une page-hôte à onglets, panneaux montés à la demande.
- **Modales plutôt que pages plein écran** pour les petits formulaires de
  création.
- **Aucun favori cassé.** Toute route supprimée/fusionnée reste servie par un
  shim `getServerSideProps` en redirection **permanente 308** vers la nouvelle
  URL (+ `?tab=`), en préservant les query params entrants.
- **Gating de rôle jamais élargi.** Chaque onglet conserve le rôle de sa page
  d'origine (voir [§ Sécurité](#sécurité--gating)).
- **Parité i18n fr/en** garantie à la compilation (`admin-parity.ts`).

---

## Briques réutilisables introduites

| Brique                                                       | Rôle                                                                                                                                                                                                              |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/admin/Tabs.tsx`                                  | Composant onglets accessible (WAI-ARIA tablist, flèches/Home/End, roving tabindex) + hook `useQueryTab` (deep-link `?tab=`) + helpers d'ids.                                                                      |
| `components/admin/navigation/adminNav.ts`                    | **Source unique de navigation.** Arbre `ADMIN_NAV` (sections → items) portant `href`, `minRole`, `topBarLabel?`, `card?`. Dérive le top-bar (`buildAdminLinks`) ET les cartes dashboard (`collectAdminNavCards`). |
| `components/admin/tournament/TournamentTabsNav.tsx`          | Barre d'onglets contextuelle partagée en tête des sous-écrans tournoi.                                                                                                                                            |
| `components/admin/stages/StageTabsNav.tsx`                   | Idem pour les sous-écrans de stage (onglets conditionnels au format).                                                                                                                                             |
| `utils/moderationRedirect.ts`, `utils/onboardingRedirect.ts` | Helpers de shim 308 avec préservation des query params.                                                                                                                                                           |
| `components/admin/Modal.tsx`                                 | _(préexistant)_ Modale a11y avec focus-trap ; socle des formulaires de création en modale.                                                                                                                        |

---

## Ce qui a changé, par domaine

### Fusions à onglets (une route, plusieurs onglets)

| Hub                | URL canonique          | Onglets                                             | Pages fusionnées                                             |
| ------------------ | ---------------------- | --------------------------------------------------- | ------------------------------------------------------------ |
| Statistiques       | `/admin/stats`         | Équipes · Maps                                      | `stats/teams`, `stats/maps`                                  |
| Journaux           | `/admin/logs`          | Staff · Emails                                      | `logs`, `email-logs`                                         |
| Paramètres du site | `/admin/site-settings` | Général · Discord · Rôles d'équipe                  | `site-settings/{index,discord,team-roles}`                   |
| Modération         | `/admin/moderation`    | Commentaires · Litiges · Blacklist · Support        | `comments`, `disputes`, `moderation/blacklist`, `support`    |
| Onboarding         | `/admin/onboarding`    | Espaces · À traiter                                 | `onboarding-queue`, `tenant-requests`, `pending-guild-links` |
| Partenaires        | `/admin/partners`      | Liste · Demandes                                    | `partners`, `partnership-requests` (vague 4)                 |

Les corps de page ont été extraits en `components/admin/<domaine>/*Panel.tsx`
(via `git mv` pour préserver l'historique) ; les anciennes routes sont des shims 308. Le hub Partenaires conserve la modale de création (`?new=1`) sur l'onglet
Liste ; la route détail `partnership-requests/[id]` reste une page à part.

### Sous-écrans regroupés sous une barre d'onglets partagée

- **Tournoi** (`tournament/[id]/*`) : 17 sous-écrans → **11 onglets**
  (`TournamentTabsNav`). Fusions internes : `checkin` + `checkin/live` ;
  `stats` + `analytics` + `podium`. Le cluster **Bracket** (`bracket`,
  `bracket-builder`, `map-draw`, `veto`) est **fusionné** (vague 3) en une route
  à onglets `/admin/tournament/[id]/bracket?tab=view|builder|map-draw|veto` :
  corps extraits en `components/admin/tournament/{Bracket,BracketBuilder,MapDraw,Veto}Panel.tsx`
  (via `git mv`), anciennes routes en shims 308, liens internes recâblés en
  deep-links `?tab=`. Audit préalable : les 4 écrans sont tournament-scoped,
  self-contained (fetch client), gating-only `manager` — le risque « stateful
  interdépendant » était surévalué (veto a un sélecteur de match interne, pas de
  param par-match).
- **Stage** (`stages/[stageId]/*`) : 6 sous-écrans sous `StageTabsNav`, avec
  **onglets conditionnels au format** (Groupes visible pour un stage à poules,
  Swiss pour un stage suisse ; fallback : onglet affiché si format inconnu).

### Formulaires de création → modales

Sur la page liste parente, via `components/admin/Modal.tsx`, deep-link `?new=1`,
ancienne route `*/new` en shim 308 :

- `cast-members/new`, `pole-members/new`, `partners/new`, `twitch-channels/new`
- `teams/add-member` → réutilise l'`AddMemberModal` existante (`?add-member=1`)

**Laissés en pages** (formulaires trop lourds) : `users/new`,
`tournaments/create`, `stages/create`, `adherents/new`, `news/new`.

### Navigation

- **Source unique** `adminNav.ts` alimentant top-bar + cartes dashboard.
- Nouvelle section top-bar **Communication** regroupant Actualités,
  Campagnes emails, Notifications (regroupement de menu — **aucune page
  fusionnée**, les éditeurs restent des pages). L'onglet Annonces a disparu
  avec le système de bandeau, retiré en septembre 2026.
- Nouvelle section top-bar **Staff & Asso** (vague 3) regroupant Gérer les
  utilisateurs, Casteuses, Pôles de l'asso, Adhérents — écrans « People/Staff »
  auparavant dispersés entre Contenu et Configuration. Regroupement de menu pur
  (routes/rôles inchangés, tous admin-gated). La carte dashboard « Gérer les
  utilisateurs » (order 9) suit son nœud et reste rendue.
- Rename du libellé top-bar **News → Actualités** (vague 3, cohérence FR-first) ;
  routes `/admin/news` **inchangées**, seuls les libellés de menu changent.
- **Découvrabilité des pages orphelines** (vague 4) : `recycle-bin` (Corbeille,
  admin) et `aide-tournoi` (caster) étaient des pages fonctionnelles mais sans
  aucun lien entrant (accessibles seulement par URL). Exposées en **cartes
  dashboard-only** (pas d'entrée top-bar, comme quick-bracket / leagues /
  ratings / api-tokens). Deux icônes ajoutées à la map `ICON` (`trash`, `help`).
  Distinct d'une suppression : la page morte se supprime (cf. `api-docs`), la
  page utile mais cachée se **rend découvrable**.

### Suppression

- `pages/admin/api-docs.tsx` — page morte (0 lien entrant).

---

## Sécurité — gating

Le gating de rôle est **préservé par onglet** : un onglet n'est listé/rendu que
si le rôle staff le permet. La page-hôte exige le rôle **le plus permissif** de
ses onglets ; les onglets plus restrictifs sont re-gatés côté rendu.

> ⚠️ **Changement de frontière à connaître.** Quand une page auparavant
> SSR-gatée à un rôle élevé devient un onglet d'un hub gaté plus bas, son
> gating passe **côté client** (l'onglet est masqué pour les rôles insuffisants)
> plutôt qu'en SSR. Cas concernés :
>
> - `tenant-requests` (owner) → onglet du hub Onboarding (host manager)
> - `moderation/blacklist`, `support` (manager) → onglets du hub Modération
> - `disputes` (caster) reste l'onglet le plus permissif de son hub
>
> **La donnée reste protégée à l'API** dans tous ces cas (ex.
> `/api/admin/tenant-requests` reste owner-only) — le masquage d'onglet est de
> l'UX, pas la frontière de sécurité.
>
> ✅ **Validé (vague 3).** Audit du gating des trois hubs :
>
> - `tenant-requests` : API `withStaffRoute(handler, 'owner')` (+ `expire`/`reject`
>   owner) ; panel rendu seulement si `active === 'tenant-requests' && isOwner`.
> - `blacklist`, `support` : API `withStaffRoute(handler, 'manager')` ; panels
>   rendus seulement si `&& isManager`.
> - `disputes` : API `withStaffRoute(handler, 'caster')` — onglet fallback.
>
> Les panels sont **doublement gatés** : un deep-link `?tab=` d'un rôle
> insuffisant retombe sur le fallback, il ne rend jamais le panel privilégié.
> Conclusion : **aucun shim gaté nécessaire**, la frontière tient à l'API.

---

## Compatibilité des URLs

Toutes les anciennes URLs restent fonctionnelles via des **shims 308** vers la
nouvelle route + `?tab=`, avec préservation des query params (ex.
`/admin/support?tournament_id=abc&status=open` →
`/admin/moderation?tournament_id=abc&status=open&tab=support`).

Liens internes recâblés au passage : CTA du dashboard (`buildAlerts` dans
`pages/admin/index.tsx`), liens contextuels des pages tournoi/tenants, etc.

---

## Vérification

À chaque lot : `npx tsc --noEmit`, ESLint + Prettier sur les fichiers touchés,
tests unitaires `navbarAdminLinks.test.ts` (dérivation du menu byte-identique) +
`i18nLocaleParity.test.ts`, et validation **curl** des redirections 308 /
compilation des hôtes (307 → `/admin/login` pour un anonyme).

> **Limite connue :** l'e2e authentifié n'a pas pu être exercé pendant le
> refactor (compte staff seedé indisponible hors CI). Les specs Playwright
> `admin-*.spec.ts` ont été mises à jour pour les nouvelles URLs, mais **un
> passage e2e authentifié sur les hubs (modération, onboarding, stats, stages)
> reste recommandé avant merge.**

---

## Points ouverts — tranchés (vague 3)

1. ✅ **Bascule owner→client** sur `tenant-requests` (et blacklist/support) —
   **résolu par audit, aucun shim gaté nécessaire.** La frontière de sécurité
   tient à l'API (owner/manager/caster au bon rôle) et les panels sont doublement
   gatés. Détails dans l'encadré [§ Sécurité](#sécurité--gating).
2. ✅ **Libellé « News » → « Actualités ».** Renommé dans `adminNav.ts`
   (section + éditeurs), test `navbarAdminLinks.test.ts` mis à jour. Routes
   `/admin/news` inchangées.
3. ✅ **Cluster Bracket** — **fusionné** (le « lot dédié » a été réalisé). Route
   à onglets `bracket?tab=view|builder|map-draw|veto`, 4 panels extraits, 3 shims
   308, deep-links `?tab=` recâblés. Aucune logique métier touchée (pick/ban,
   éditeur, export inchangés). Specs e2e `map-draw-page` / `veto-locked` mises à
   jour vers les nouvelles URLs. Voir [§ Sous-écrans regroupés](#sous-écrans-regroupés-sous-une-barre-donglets-partagée).

## Vague 5 — l'espace tournoi passe de 14 onglets à 8 groupes (2026-09-07)

**Le constat.** Quatorze onglets de premier niveau, dont **huit cachés derrière un
menu « Plus »**. Un menu déroulant est un aveu : il dit qu'on n'a pas su décider ce
qui compte, et il coûte un clic ET une mémoire à chaque fois qu'on cherche l'écran
qui s'y trouve. Le lot « planning » venait d'en ajouter un quinzième.

**Le regroupement suit ce qu'on FAIT, pas ce que le code contient.**

| Groupe | Écrans | Ce qui a été fusionné |
|---|---|---|
| Tableau de bord | dashboard | — |
| Check-in | checkin (`?tab=settings\|live`) | inchangé |
| **Matchs** | matches · schedule · bulk-ops | trois vues du **même objet** : la liste pour corriger un match, le planning pour voir la saison, les opérations en masse pour en déplacer beaucoup. Les séparer imposait un aller-retour par le menu à chaque correction. |
| Bracket | bracket (`?tab=view\|builder\|map-draw\|veto`) | inchangé |
| Phases | stages | — |
| Résultats | stats (`?tab=overview\|analytics\|podium`) | renommé (« Stats » → « Résultats ») |
| **Réglages** | edit · maps · discord · prize-pool | ce qui se configure une fois et ne se touche plus un soir de match |
| **Outils** | tools · history | les gestes ponctuels et le journal, qu'on ouvre pour comprendre ou réparer |

**Aucune URL ne change.** La structure vit dans `TournamentTabsNav` seul ; les pages
déclarent leur GROUPE, et le membre actif se déduit de `router.pathname` — une page
n'a pas à se décrire deux fois, et l'oubli du second appel resterait invisible
jusqu'à ce que quelqu'un remarque un sous-onglet éteint.

**Une vraie fusion de contenu, pas seulement de nav** : le *rapport de conflits*
d'Outils (modale, chevauchement d'équipe seul) est supprimé au profit de l'onglet
**Planning**, qui répond à la même question en mieux — contraintes d'équipe, dates
hors tournoi, créneaux surchargés, et la correction quand elle est triviale. Le
geste survit sous forme de lien ; le composant `ConflictRow` devenu orphelin est
supprimé. L'endpoint `/conflicts` est conservé mais n'a plus aucun consommateur :
candidat au retrait, signalé comme tel dans le contrat.

**Garde-fou** : `tests/unit/tournamentTabGroups.test.ts` échoue si un écran est
ajouté sous `/admin/tournament/[id]/` sans place dans un groupe — c'est
exactement le laisser-faire qui avait produit les quatorze onglets.

## Pistes restantes

- ✅ **Regrouper les listes « People/Staff »** (`adherents`, `cast-members`,
  `pole-members`, `users`) — fait : nouvelle section top-bar **Staff & Asso**
  (regroupement de menu pur, routes/rôles inchangés). Voir
  [§ Navigation](#navigation).
- ⏸️ **`teams/my`** — **décision : laissé séparé.** Ce n'est pas une redondance :
  `teams/my` est la vue capitaine (caster, self-service sur sa propre équipe)
  tandis que `teams` est le CRUD complet (manager). Fusionner mêlerait deux
  gatings distincts pour un gain nul.
