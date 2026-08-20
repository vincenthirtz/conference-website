# Manager : compte dédié et multi-équipes

**Date** : 2026-08-20

Deux manques, une même personne : celle qui **encadre** une équipe sans y jouer.

1. Elle n'avait **pas de porte d'entrée**. Son compte n'existait qu'en creux,
   créé à la volée par `/team/create` (`findOrCreateUserByEmail(email, 'manager')`).
   Impossible de s'inscrire d'abord, puis de créer son équipe.
2. Elle ne pouvait **encadrer qu'une seule équipe**. Pas par choix produit :
   par effet de bord d'une contrainte d'intégrité posée pour les joueuses.

## 1. Compte manager

`/register` demande désormais le type de compte : **joueuse** ou **manager**.

- Le choix voyage en `accountType` (liste **fermée** `player | manager`,
  cf. `pages/api/auth/register.ts`) et atterrit dans
  `user_metadata.role`.
- En mode manager, le champ BattleTag disparaît : l'encadrement n'a pas
  d'obligation de compte Overwatch — c'est déjà la règle de
  `utils/teams/roleKind.ts` (`NON_PLAYING_TEAM_ROLES`), on la rend visible à
  l'inscription.
- **Ce rôle n'accorde aucun droit.** C'est une étiquette de compte (affichée
  dans le cockpit staff, exportée en RGPD). Les droits de gestion se lisent sur
  `team_members.role` (`utils/teams/managementAccess.ts`) et le staff sur la
  table `staff`. Un compte `manager` sans équipe ne peut rien de plus qu'un
  compte `player` sans équipe.

Créer l'équipe reste le même écran (`/team/create`, option « manager »), qui
fonctionne aussi bien pour un compte existant que pour un inconnu.

## 2. Multi-équipes

### Ce qui bloquait

`add_team_membership_integrity.sql` avait posé
`team_members_tenant_user_key UNIQUE (tenant_id, user_id)` pour fermer les
courses _check-then-insert_ des flux join/transfer/invite. L'invariant **visé**
était « une joueuse = une seule équipe par tenant » ; l'invariant **écrit**
couvrait tous les rôles. La migration elle-même le signalait en CAVEATS.

### La bascule

`database/migrations/allow_manager_multi_team.sql` remplace la contrainte par un
**index unique partiel de même nom** :

```sql
CREATE UNIQUE INDEX team_members_tenant_user_key
  ON team_members (tenant_id, user_id)
  WHERE role IS DISTINCT FROM 'manager';
```

Ce qui reste garanti : `UNIQUE (team_id, user_id)` (personne deux fois dans la
même équipe), l'unicité par tenant pour joueuses / subs / **coachs**, et
l'exemption de quota (`enforce_team_max_players` excluait déjà coach et
manager). Les RPC `approve_join_request` / `approve_transfer_request` /
`accept_invitation` coercent le rôle vers `player|substitute|coach` : elles ne
peuvent pas créer de manager, leur invariant est intact.

> Décision produit : **manager seulement**. Le coach reste attaché à une équipe.

### Le contrat `?teamId=`

« Mon équipe » n'est plus une question à laquelle le serveur peut répondre seul.
Les ~30 routes de gestion acceptent donc un paramètre de requête, sur le modèle
exact du `?as=` de l'inspection staff :

| Rôle                             | Fichier                                                                                        |
| -------------------------------- | ---------------------------------------------------------------------------------------------- |
| Format de fil (client + serveur) | `utils/teamScopeParam.ts` — `withTeamParam(url, teamId)`                                       |
| Lecture serveur + garde          | `utils/teams/teamScope.ts` — `readRequestedTeamId`, `getManagedTeamForRequest`                 |
| Résolution des droits            | `utils/teams/managementAccess.ts` — `getManagedTeams`, `getManagedTeam(user, tenant, teamId?)` |
| État client + persistance        | `components/player/ActiveTeamContext.tsx` (monté dans `_app`)                                  |
| UI                               | `components/player/ActiveTeamSwitcher.tsx` (rendu **seulement** si ≥ 2 équipes)                |

Trois propriétés à ne pas casser :

1. **Le paramètre n'élargit jamais la portée.** Une équipe non gérée → 403.
2. **Il est facultatif.** Sans lui, on retombe sur la première équipe gérée
   (ordre stable : capitainerie d'abord, puis ancienneté d'adhésion). Pour
   quiconque n'a qu'une équipe — presque tout le monde — le comportement est
   inchangé, URL comprise (`withTeamParam` est l'identité sans équipe active).
3. **Il se lit dans la QUERY, jamais dans le body.** Plusieurs routes ont déjà
   un `body.teamId` qui désigne autre chose (l'équipe _cible_ d'un transfert,
   l'équipe à modifier). Les confondre ferait passer une donnée métier pour une
   portée d'autorisation.

### Les lectures d'appartenance

L'index partiel a un corollaire moins visible : une quinzaine de
`.maybeSingle()` sur `(user_id, tenant_id)` s'appuyaient sur l'ancienne
unicité. Pour un manager multi-équipes elles renvoient plusieurs lignes, donc
`PGRST116`, donc une 500 sur un compte parfaitement légitime — exactement le
« joueur soft-locké » décrit dans `AUDIT_FLOW_INSCRIPTION.md`, à l'envers.

Toutes passent désormais par `utils/teams/memberships.ts`, qui distingue deux
questions que « la première ligne trouvée » confondait :

- `pickExclusiveMembership` — l'appartenance que l'index couvre encore (tout
  sauf `manager`). C'est elle que lisent les gardes **« tu es déjà dans une
  équipe »** (join, invitation, self-transfer) : un siège de manager ne doit pas
  empêcher de rejoindre une équipe comme joueuse, puisque la base l'autorise.
- `pickMembership` — l'appartenance de **travail** d'un écran : celle demandée,
  à défaut l'exclusive, à défaut la plus ancienne.

### Cas destructeurs : on ne devine pas

`POST /api/teams/leave` exige `?teamId=` quand l'appelant a plusieurs
appartenances (sinon `400 TEAM_AMBIGUOUS`) : deviner reviendrait à retirer
quelqu'un d'une équipe qu'il n'avait pas en tête. Côté Discord,
`POST /api/bot/v1/teams/leave` répond `409 TEAM_AMBIGUOUS` et renvoie vers le
site — la commande `/equipe quitter` ne porte pas d'équipe.

### Limite assumée

`utils/botRoleSync.ts` ne pousse qu'**un** rôle Discord d'équipe par compte :
un manager de plusieurs équipes ne reçoit que celui de la première. Discord n'a
pas de notion de rôle d'équipe multiple côté sync ; à traiter le jour où le
besoin se pose.

## Vérification

- `tests/unit/teamMemberships.test.ts` — les sélecteurs purs (miroir du SQL).
- `tests/unit/teamScopeParam.test.ts` — le format de fil, dont le no-op.
- `tests/unit/teamMultiTeamManager.test.ts` — `getManagedTeams`, la portée
  scopée, et une route de gestion de bout en bout.
- `tests/unit/apiAuthRegister.test.ts` — `accountType` et sa liste fermée.
