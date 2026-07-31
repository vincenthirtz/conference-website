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
| S2 | Extraction des corps de pages `pages/player/*` en composants `subjectId` / `readOnly` | à faire |
| S3 | `/admin/users/[id]/{player,captain}-view` rendent les vrais composants ; suppression des 4 fichiers dupliqués (~3 470 LOC) | à faire |
| S4 | Écritures staff via `?as=` + toggle explicite « agir en tant que » (débloque les actions roster read-only v1) | à faire |
| S5 | Kit UI partagé (`components/ui`) — **doit ressembler le plus possible à `/admin`** | à faire |

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
