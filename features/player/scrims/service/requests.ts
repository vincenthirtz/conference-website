// features/player/scrims/service/requests.ts — négociation multi-créneaux
// des scrims côté capitaine / manager (demandes.payload.scrim_nego, cf.
// utils/teams/scrimNegotiation.ts). Déplacé de pages/api/teams/scrim-requests
// (lot P13) : mêmes lectures, mêmes messages.
//
// Le GESTE (accept / counter / reject / report / approve) reste dans le cœur
// partagé avec le bot, `applyScrimRequestAction` : une réponse donnée depuis
// Discord fait exactement la même chose qu'une réponse donnée depuis le site
// (création du scrim, e-mails best-effort aux capitaines compris).

import { LegacyAdminError, NotFoundError } from '@/utils/admin/errors';
import { readScrimNego } from '@/utils/teams/scrimNegotiation';
import { applyScrimRequestAction } from '@/utils/teams/scrimRequestActions';
import {
  fetchAdminUserProfiles,
  type AdminUserProfile,
} from '@/utils/adminUserProfiles';
import {
  listPendingScrimDemandes,
  readTeamIdentity,
  type ScrimDemandeRow,
} from '../repository/requests';
import type {
  PendingScrimRequestDto,
  PendingScrimRequestsResponse,
  ScrimRequestDecisionInput,
} from '../schemas';
import type { ScrimsTeamCtx } from './context';

/**
 * Enrichit une demande avec son émettrice (compte OU contact public). Les
 * comptes sont résolus en amont par UN appel groupé (`profiles`) ; un id
 * inconnu rend `user: null`, comme avant.
 */
export function enrichScrimDemande(
  d: ScrimDemandeRow,
  myTeamId: string,
  profiles: Map<string, AdminUserProfile>
): PendingScrimRequestDto {
  let userInfo: PendingScrimRequestDto['user'] = null;

  if (d.user_id) {
    const p = profiles.get(d.user_id);
    if (p) {
      userInfo = {
        id: d.user_id,
        email: p.email || null,
        display_name: p.display_name || p.full_name || null,
        discord: p.discord || null,
      };
    }
  } else if (d.source === 'public' && d.payload) {
    const p = d.payload as Record<string, string | null | undefined>;
    userInfo = {
      id: null,
      email: p.requester_email || null,
      display_name: p.requester_name || null,
      discord: p.requester_discord || null,
    };
  }

  const payload = d.payload ?? {};
  const nego = readScrimNego(payload);
  const fromTeamId = (payload.from_team_id as string | null) ?? null;

  return {
    id: d.id,
    user_id: d.user_id,
    source: d.source,
    status: d.status,
    comment: d.comment,
    payload: d.payload,
    created_at: d.created_at,
    user: userInfo,
    scrimNego: {
      slots: nego.slots,
      proposedBy: nego.proposed_by,
      rounds: nego.rounds,
      agreedSlot: nego.agreed_slot,
    },
    iAmRequester: myTeamId === fromTeamId,
    myTeamId,
  };
}

async function loadMyTeam(ctx: ScrimsTeamCtx) {
  const { team, error } = await readTeamIdentity(
    ctx.db,
    ctx.tenantId,
    ctx.team.teamId
  );
  if (error || !team) throw new NotFoundError('Team introuvable.');
  return team;
}

/**
 * Demandes EN ATTENTE DE MON GESTE, dans les deux sens : je suis
 * participante ET la proposition courante n'est pas de mon équipe.
 */
export async function listPendingScrimRequests(
  ctx: ScrimsTeamCtx
): Promise<PendingScrimRequestsResponse> {
  const team = await loadMyTeam(ctx);
  const myTeamId = team.id;
  try {
    const { rows, error } = await listPendingScrimDemandes(
      ctx.db,
      ctx.tenantId,
      myTeamId
    );
    if (error) {
      ctx.logger.error('[scrim-requests] GET error:', error);
      throw new LegacyAdminError(500, 'Echec du chargement.');
    }

    const byId = new Map<string, ScrimDemandeRow>();
    for (const d of rows) byId.set(d.id, d);

    const awaitingMe = Array.from(byId.values()).filter(
      (d) => readScrimNego(d.payload ?? {}).proposed_by !== myTeamId
    );

    const profiles = await fetchAdminUserProfiles(
      awaitingMe.map((d) => d.user_id)
    );
    return {
      demandes: awaitingMe.map((d) =>
        enrichScrimDemande(d, myTeamId, profiles)
      ),
    };
  } catch (err) {
    if (err instanceof LegacyAdminError) throw err;
    ctx.logger.error('[scrim-requests] GET exception:', err);
    throw new LegacyAdminError(500, 'Echec du chargement.');
  }
}

export type ScrimRequestActor = { displayName: string | null };

/** Geste sur une demande : cœur partagé avec la route bot. */
export async function decideScrimRequest(
  ctx: ScrimsTeamCtx,
  input: ScrimRequestDecisionInput,
  actor: ScrimRequestActor
): Promise<Record<string, unknown>> {
  const team = await loadMyTeam(ctx);
  const result = await applyScrimRequestAction({
    tenantId: ctx.tenantId,
    demandeId: input.demandeId,
    action: input.action,
    slot: input.slot,
    slots: input.slots,
    actor: {
      userId: ctx.userId,
      teamId: ctx.team.teamId,
      teamName: team.name,
      displayName: actor.displayName,
    },
  });
  // Succès toujours en 200 dans le cœur partagé.
  if (!result.ok) throw new LegacyAdminError(result.status, result.error);
  return result.body;
}
