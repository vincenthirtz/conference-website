// utils/teams/teamScope.ts
//
// « De QUELLE équipe cette requête parle-t-elle ? » — la moitié serveur du
// contrat `?teamId=` (cf. utils/teamScopeParam.ts).
//
// Avant le multi-équipe, la réponse était implicite : `getManagedTeam(userId)`
// renvoyait LA team gérée, parce qu'on n'en gérait qu'une. Depuis qu'un
// `manager` peut en encadrer plusieurs
// (database/migrations/allow_manager_multi_team.sql), cet implicite ne tient
// plus : sans indication, une route de gestion agirait sur une équipe
// arbitraire — la première trouvée — pendant que l'écran en affiche une autre.
//
// Les ~30 routes de gestion appellent donc `getManagedTeamForRequest(req, ...)`
// au lieu de `getManagedTeam(userId, tenantId)`. Deux conséquences :
//
//   1. avec `?teamId=`, l'accès est vérifié SUR CETTE ÉQUIPE — un manager ne
//      peut pas piloter une équipe qu'il n'encadre pas, la garde est la même
//      qu'avant, simplement explicite ;
//   2. sans `?teamId=`, on retombe sur la première équipe gérée : les clients
//      qui ignorent le paramètre (bot, anciens écrans) gardent leur
//      comportement exact.
//
// NB : le paramètre est lu dans la QUERY uniquement, jamais dans le body.
// Plusieurs routes ont déjà un `body.teamId` qui désigne autre chose (l'équipe
// CIBLE d'un transfert, l'équipe à modifier…) ; les confondre ferait passer une
// donnée métier pour une portée d'autorisation. Les routes à segment dynamique
// `/api/teams/[teamId]/...` fournissent la même clé — et c'est bien la portée
// voulue.

import type { NextApiRequest } from 'next';

import { isValidUUID } from '@/utils/apiHelpers';
import { TEAM_SCOPE_QUERY_PARAM } from '@/utils/teamScopeParam';
import {
  getManagedTeam,
  type TeamManagementAccess,
} from '@/utils/teams/managementAccess';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';

/**
 * Équipe ciblée par la requête, ou `null` si non précisée.
 *
 * Une valeur non-UUID est traitée comme absente plutôt que comme une erreur :
 * le repli « première équipe gérée » reste sûr (l'accès est vérifié dans tous
 * les cas), et une route n'a pas à savoir répondre 400 sur un paramètre
 * facultatif.
 */
export function readRequestedTeamId(req: NextApiRequest): string | null {
  const raw = req.query?.[TEAM_SCOPE_QUERY_PARAM];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || !isValidUUID(trimmed)) return null;
  return trimmed;
}

/**
 * `getManagedTeam` scopé à l'équipe demandée par la requête.
 *
 * Remplacement direct de `getManagedTeam(userId, tenantId)` dans les routes :
 * même valeur de retour, même sémantique `null` = pas de droit de gestion.
 */
export async function getManagedTeamForRequest(
  req: NextApiRequest,
  userId: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<TeamManagementAccess | null> {
  return getManagedTeam(userId, tenantId, readRequestedTeamId(req));
}
