# Espace unifié player / admin

## Problème

Le site a deux espaces authentifiés — `/player/*` (+ `/espace-capitaine`) et
`/admin/*` — construits séparément : deux librairies de composants
(`components/player` ~42 fichiers, `components/admin` ~189), et surtout **deux
implémentations des mêmes lectures**.

Le "mode vue player / vue capitaine" côté admin est une **copie** de l'espace
joueur, pas une réutilisation :

| Fichier | LOC | Rôle |
|---|---|---|
| `pages/admin/users/[userId]/player-view.tsx` | 1 601 | redessine le dashboard joueur |
| `pages/admin/users/[userId]/captain-view.tsx` | 956 | redessine l'espace capitaine |
| `pages/api/admin/users/[userId]/player-view.ts` | 518 | re-implémente 4 endpoints player |
| `pages/api/admin/users/[userId]/captain-view.ts` | 395 | idem côté capitaine |

L'en-tête de `player-view.ts` l'admet : *« The handler reproduces the exact
shapes returned by /api/player/matches, /api/player/notifications,
/api/admin/teams/my, /api/demandes/* »*. Reproduire une shape à la main = dérive
garantie. D'où le symptôme ressenti : **l'admin ne voit pas l'espace joueur, il
voit une copie figée** — et en lecture seule.

## Décision

**Ne pas** re-skinner l'espace joueur en interface admin : le coût est visuel,
le problème est dans les données. À la place : **un seul espace joueur, dans
lequel l'admin entre**, via une résolution de sujet explicite au niveau API.

## Lots

| Lot | Contenu | État |
|---|---|---|
| S1 | `utils/subject.ts` (`resolveSubject` / `withSubjectRoute`) + `?as=` sur les lectures + audit + tests | ✅ livré |
| S2 | Extraction des corps de pages `pages/player/*` en composants `subjectId` / `readOnly` | ✅ livré |
| S3 | `/admin/users/[id]/{player,captain}-view` rendent les vrais écrans ; suppression des doublons (~3 470 LOC) | ✅ livré |
| S4 | Écritures staff via `?as=` + toggle explicite « agir en tant que » | ✅ livré |
| S5 | Kit UI partagé (`components/ui`), au look `/admin` | ✅ livré |

## S1 — ce qui est en place

`utils/subject.ts` expose `withSubjectRoute`, drop-in de `withAuthRoute` :

```ts
export default withSubjectRoute(async function handler(req, res, { user, subject }) {
  const { userId, tenantId } = subject; // au lieu de user.id + resolveTenantIdForUserRequest
});
```

Règles appliquées une seule fois, pour tous les endpoints inscrits :

1. **Lecture seule** — `?as=` refusé sur toute méthode ≠ GET (403
   `subject_read_only`). Corollaire : dans un handler GET+POST,
   `subject.userId === user.id` est garanti dans la branche d'écriture. **S4
   doit relire chacun de ces handlers** avant d'assouplir la règle.
2. **Scope tenant** — en inspection, le tenant est celui **actif côté staff**
   (cookie `staff_active_tenant_id`), jamais celui résolu pour la cible. Un
   admin ne peut pas lire hors de son tenant courant.
3. **Existence** — cible inconnue → 404 `subject_not_found`.
4. **Audit** — une ligne `staff_logs` par requête d'inspection
   (`view_player_data`, ou `view_captain_data` via `auditAction`), avec
   `payload.endpoint`. Pas de dédoublonnage : un journal qui perd des entrées
   est pire qu'un journal verbeux.
5. **Cache** — `Cache-Control` épinglé à `private, no-store` pendant toute la
   requête inspectée (plusieurs handlers posent `max-age=N` *après* le wrapper).

Codes d'erreur renvoyés : `invalid_subject` (400), `subject_read_only` (403),
`subject_forbidden` (403), `subject_not_found` (404).

### Endpoints migrés (15)

`player/dashboard`, `player/matches`, `player/notifications`,
`player/next-match`, `player/progression`, `player/team-health`,
`player/team-rhythm`, `player/invitations`, `player/messages`,
`player/scrims`, `demandes/captain`, `demandes/join`, `teams/join-requests`,
`teams/scrim-requests`, `teams/scrim-plannings`.

### Volontairement NON inscrits

- `player/discovery/*`, `player/follows`, `player/network-status`,
  `player/scouting`, `player/teams-directory` — réseau cross-tenant **opt-in**,
  invisible par défaut : une inspection staff n'est pas une raison de lever ça.
- `player/data-export`, `player/delete-account`, `player/push/*` — actions RGPD
  et abonnements par appareil, sans objet pour un tiers.

### Pièges rencontrés

- `resolveTenantIdForUserRequest` (sync) vs `…Async` (lit `team_members`) : le
  wrapper prend l'option `tenantResolution: 'async'` pour **conserver** le
  résolveur d'origine de chaque endpoint. Se tromper change silencieusement le
  scoping tenant.
- `applyActorRateLimit` reste clé sur **l'appelant** (`user.id`) : sinon une
  inspection consommerait le quota du joueur inspecté.
- `tests/unit/openapiContractDrift.test.ts` détecte l'auth en scannant la
  source : `withSubjectRoute` a dû y être reconnu comme `player`.
- `docs/openapi.yaml` : paramètre partagé `SubjectAs`, référencé par les 15
  opérations GET.

## S2 / S3 — ce qui est en place

**Écrans partagés** (`components/player/screens/`) : `PlayerDashboardScreen`,
`PlayerMatchesScreen`, `PlayerNotificationsScreen`, `PlayerManageTeamScreen`.
Les pages `/player/*` n'en sont plus que la coquille (SEO + provider).

**`PlayerAreaProvider`** (`components/player/PlayerAreaContext.tsx`) porte
`subjectId` / `readOnly` et expose `withSubject(url)`. Choisi plutôt que des
props parce que le dashboard compose une dizaine de cartes qui fetchent chacune
leur tranche : une carte oubliée dans un prop-drilling afficherait les données
du STAFF sous le nom de quelqu'un d'autre.

**Supprimés en S3** : `player-view.ts` (518 l.), `captain-view.ts` (395 l.),
leurs deux suites de tests (838 l.) et 2 557 lignes de rendu-miroir. Remplacés
par `/api/admin/users/[userId]/profile` (~140 l., identité auth seule).

**Restent côté admin**, parce qu'aucune UI joueur ne les offre : identité,
rôle, renvoi d'identifiants, BattleTag, capitanat, transfert d'équipe,
modération des demandes (via `/api/admin/demandes` filtré, pas un snapshot).

**Masqué en inspection** : ProfileSummaryCard (c'est la session du staff),
NetworkOnboarding, DiscordLink, TeamMemory, PushOptIn, SupportAsso,
préférences de notification, vérification Battle.net, section joueuses libres.

### Pièges S2 / S3

- `useManagedTeam` cache au niveau module, clé sur le token : en inspection le
  même token lit plusieurs équipes → clé re-composée en `token::sujet`.
- Les écrans posent `Cache-Control: private, max-age=N` APRÈS le wrapper ; d'où
  l'épinglage `no-store` de `withSubjectRoute` (S1).
- `PlayerAreaContext` n'est pas testé unitairement : les tests unitaires
  tournent en node et la politique zéro-dépendance exclut
  `@testing-library/react`. Couverture par les specs Playwright.

## S4 — act-as (écritures staff)

Une écriture `?as=` exige **deux clés indépendantes** :

1. la **route** l'autorise : `withSubjectRoute(handler, { allowActAs: true })` —
   décision par endpoint, prise en relisant sa branche d'écriture ;
2. l'**appelant** la demande : header `X-Staff-Act-As: 1` ou `&act=1`.

Sans les deux, on reste sur la garantie S1 (403 `subject_read_only`). Une case
cochée côté admin ne peut donc pas ouvrir une route qui ne s'est pas déclarée,
et une route ouverte ne mute pas sur une simple lecture.

Le paramètre d'URL existe en plus du header parce que les écrans joueur sont
partagés : ils construisent leurs URLs via `withSubject()` depuis une vingtaine
d'appels, mais pas leurs en-têtes. L'auth étant Bearer-only, aucun chemin
accidentel façon CSRF.

**Audit** : une écriture act-as est journalisée `act_as_player` (slug dédié)
avec la méthode HTTP dans le payload — une mutation ne doit jamais être
indiscernable d'une consultation.

### Endpoints ouverts (9)

`teams/update-member`, `teams/update-member-role`,
`teams/update-member-specialty`, `teams/toggle-joinable`,
`teams/toggle-scrim-open`, `teams/transfer-captain`, `teams/join-requests`,
`teams/[teamId]/members` (DELETE), `teams/invitations` — soit exactement les
mutations de `PlayerManageTeamScreen`.

### UI

Bascule « Agir en tant que » sur `/admin/users/[id]/captain-view`, dans le bloc
Actions staff. Non persistée : elle repart à `false` à chaque arrivée sur la
page. Active, elle repasse `readOnly` à false et l'écran capitaine redevient
actionnable (cadre ambre + bandeau d'avertissement).

### Pièges S4

- `getStaffByUserId(userId)` dans `update-member` et `transfer-captain` :
  en act-as, `userId` est la capitaine dépannée, qui n'a pas de row staff →
  l'audit aurait été **silencieusement perdu**. Ces appels prennent maintenant
  `subject.callerId`.
- `BattlenetVerifyCard` et `FreePlayersSection` sont masqués sur
  `isInspecting`, pas sur `readOnly` : leurs écritures ne sont pas ouvertes à
  l'act-as, et relier un compte Blizzard à la place de quelqu'un n'a aucun sens.
- Le quota `applyActorRateLimit` reste sur l'appelant : une intervention staff
  ne consomme pas le quota de la personne dépannée.

## S5 — kit UI partagé

`components/ui/` (voir son [README](../components/ui/README.md)) : `Switch`,
`Badge`, `EmptyState`, `Modal`, `Tabs`, `Skeleton`, `StatusBadge`. Le look
`/admin` fait foi.

Les quatre dernières ont simplement déménagé depuis `components/admin/` ;
`components/admin/{Modal,Tabs,Skeleton,StatusBadge,EmptyState}.tsx` restent
comme ré-exports dépréciés, ce qui évite de toucher ~70 imports existants.

Vraie dé-duplication : **`Switch`** remplace cinq interrupteurs quasi
identiques mais divergents (h-6/h-7, w-11/w-12, emerald-500/600/purple-500,
gray-600/neutral-700/white-15, `translate-x` vs `left-*`), chacun redécouvrant
son `role="switch"` + `aria-checked` + anneau de focus — l'endroit exact où
l'accessibilité se perd au copier-coller. **`Badge`** couvre une quinzaine de
pastilles manuscrites, `EmptyState` quatre définitions locales.

### Non migré, volontairement

- **La surface « carte »**. L'espace joueur emploie
  `rounded-2xl border-white/10 bg-white/[0.03] backdrop-blur-xl` à **132
  endroits** ; l'admin n'a pas d'équivalent unique (3 occurrences de sa
  variante la plus fréquente). Converger = re-skinner l'espace joueur : un
  chantier visuel à part entière, sans filet de tests de composants, et sans
  rapport avec la duplication de logique visée par ce plan. **À arbitrer.**
- Deux bascules qui ne sont pas des interrupteurs piste + pastille :
  `/admin/map-pool` (pilule avec libellé) et `prize-pool` (case à cocher
  `role="switch"`).

## Reste à faire

- Pages joueur non extraites (pas encore nécessaires à l'inspection) :
  `profile`, `teams`, `requests`, `messages`, `checkin`, `discovery`,
  `scouting`, `join-team`, `request-captain`, `caster-application`,
  `scrim-planning`, `[userId]`.
