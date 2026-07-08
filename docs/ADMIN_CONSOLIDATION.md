# Consolidation de l'espace admin

Refactor d'architecture de l'espace `pages/admin/*` : réduire la dispersion des
pages, privilégier les onglets et les modales, et unifier la navigation en une
source unique — sans casser les favoris (redirections 308) ni élargir les droits.

**Statut :** livré en 2 vagues sur la branche `work`.
- Vague 1 — commit `f1d869c4` (quick wins, modales, sous-écrans tournoi, nav unifiée)
- Vague 2 — commit `6a192a82` (hubs stages / modération / onboarding, section Communication)

**Reste à faire avant merge `work → master`** : voir [§ Points ouverts](#points-ouverts).

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

| Brique | Rôle |
|--------|------|
| `components/admin/Tabs.tsx` | Composant onglets accessible (WAI-ARIA tablist, flèches/Home/End, roving tabindex) + hook `useQueryTab` (deep-link `?tab=`) + helpers d'ids. |
| `components/admin/navigation/adminNav.ts` | **Source unique de navigation.** Arbre `ADMIN_NAV` (sections → items) portant `href`, `minRole`, `topBarLabel?`, `card?`. Dérive le top-bar (`buildAdminLinks`) ET les cartes dashboard (`collectAdminNavCards`). |
| `components/admin/tournament/TournamentTabsNav.tsx` | Barre d'onglets contextuelle partagée en tête des sous-écrans tournoi. |
| `components/admin/stages/StageTabsNav.tsx` | Idem pour les sous-écrans de stage (onglets conditionnels au format). |
| `utils/moderationRedirect.ts`, `utils/onboardingRedirect.ts` | Helpers de shim 308 avec préservation des query params. |
| `components/admin/Modal.tsx` | *(préexistant)* Modale a11y avec focus-trap ; socle des formulaires de création en modale. |

---

## Ce qui a changé, par domaine

### Fusions à onglets (une route, plusieurs onglets)

| Hub | URL canonique | Onglets | Pages fusionnées |
|-----|---------------|---------|------------------|
| Statistiques | `/admin/stats` | Équipes · Maps | `stats/teams`, `stats/maps` |
| Journaux | `/admin/logs` | Staff · Emails | `logs`, `email-logs` |
| Paramètres du site | `/admin/site-settings` | Général · Discord · Rôles d'équipe | `site-settings/{index,discord,team-roles}` |
| Modération | `/admin/moderation` | Commentaires · Litiges · Blacklist · Support | `comments`, `disputes`, `moderation/blacklist`, `support` |
| Onboarding | `/admin/onboarding` | File d'onboarding · Demandes tenant · Liens Discord | `onboarding-queue`, `tenant-requests`, `pending-guild-links` |

Les corps de page ont été extraits en `components/admin/<domaine>/*Panel.tsx`
(via `git mv` pour préserver l'historique) ; les anciennes routes sont des shims
308.

### Sous-écrans regroupés sous une barre d'onglets partagée

- **Tournoi** (`tournament/[id]/*`) : 17 sous-écrans → **11 onglets**
  (`TournamentTabsNav`). Fusions internes : `checkin` + `checkin/live` ;
  `stats` + `analytics` + `podium`. Le cluster **Bracket** (`bracket`,
  `bracket-builder`, `map-draw`, `veto`) est **unifié visuellement mais gardé en
  routes séparées** (code stateful interdépendant, trop risqué à fusionner sans
  e2e authentifié).
- **Stage** (`stages/[stageId]/*`) : 6 sous-écrans sous `StageTabsNav`, avec
  **onglets conditionnels au format** (Groupes visible pour un stage à poules,
  Swiss pour un stage suisse ; fallback : onglet affiché si format inconnu).

### Formulaires de création → modales

Sur la page liste parente, via `components/admin/Modal.tsx`, deep-link `?new=1`,
ancienne route `*/new` en shim 308 :

- `cast-members/new`, `pole-members/new`, `partners/new`, `twitch-channels/new`
- `teams/add-member` → réutilise l'`AddMemberModal` existante (`?add-member=1`)

**Laissés en pages** (formulaires trop lourds) : `users/new`,
`tournaments/create`, `stages/create`, `adherents/new`, `news/new`,
`announcements/new`.

### Navigation

- **Source unique** `adminNav.ts` alimentant top-bar + cartes dashboard.
- Nouvelle section top-bar **Communication** regroupant Annonces, News,
  Campagnes emails, Notifications (regroupement de menu — **aucune page
  fusionnée**, les éditeurs restent des pages).

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
> - `tenant-requests` (owner) → onglet du hub Onboarding (host manager)
> - `moderation/blacklist`, `support` (manager) → onglets du hub Modération
> - `disputes` (caster) reste l'onglet le plus permissif de son hub
>
> **La donnée reste protégée à l'API** dans tous ces cas (ex.
> `/api/admin/tenant-requests` reste owner-only) — le masquage d'onglet est de
> l'UX, pas la frontière de sécurité. À valider lors de la revue.

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

## Points ouverts

À trancher avant/pendant la revue :

1. **Bascule owner→client** sur `tenant-requests` (et blacklist/support) — voir
   [§ Sécurité](#sécurité--gating). Convient ou faut-il un shim gaté ?
2. **Libellé « News »** conservé tel quel (pas « Actualités ») pour
   l'équivalence fonctionnelle — à renommer ?
3. **Cluster Bracket** laissé séparé — fusion possible dans un lot dédié, avec
   e2e authentifié pour sécuriser les interactions pick/ban et l'export.

## Pistes restantes (non faites)

- Regrouper les listes « People/Staff » : `adherents`, `cast-members`,
  `pole-members`, `users` sous une section cohérente.
- Traiter `teams/my` (redondance potentielle avec `teams`).
