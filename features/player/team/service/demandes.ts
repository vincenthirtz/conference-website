// features/player/team/service/demandes.ts — demandes ENTRANTES de l'équipe
// gérée : adhésion (`/api/teams/join-requests`, `manage_join_requests`) et
// transfert depuis une autre équipe (`/api/teams/transfer-requests`,
// `manage_roster`). Lot P10, même contrat.
//
// Les deux flux ne diffèrent que par la RPC d'approbation, la correction du
// BattleTag (adhésion seulement) et le texte de l'actualité produite —
// toujours un BROUILLON, relu et publié par le staff s'il y a lieu (un
// transfert publié d'office annonçait un prénom avant toute relecture).
//
// Dans les deux sens, la candidate est prévenue de la décision
// (`team.join.decided`, utils/teams/joinDecisionNotify.ts). Un refus porte le
// motif FACULTATIF saisi par la capitaine — jamais un identifiant interne.

import { validateRole } from '@/utils/apiHelpers';
import { fetchAdminUserProfiles } from '@/utils/adminUserProfiles';
import {
  isTeamRosterLocked,
  rosterLockErrorMessage,
} from '@/utils/teams/rosterLock';
import { mapTeamRpcError } from '@/utils/teams/rpcErrors';
import { resolveDemandeBattleTag } from '@/utils/teams/demandeBattleTag';
import type { DemandePayload } from '@/utils/teams/demandeRows';
import {
  listTeamDemandes,
  readPendingTeamDemande,
  rejectTeamDemande,
  rpcApproveDemande,
  type IncomingDemandeType,
} from '../repository/demandes';
import { insertTeamNews, readTeamHead } from '../repository/roster';
import { announceJoinDecision } from '@/utils/teams/joinDecisionNotify';
import { buildJoinNewsText } from '@/utils/teams/joinDecisionNews';
import type {
  JoinRequestDecisionInput,
  TransferRequestDecisionInput,
} from '../schemas';
import { fail, type ManagedTeamContext } from './context';

const STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];
const LOG: Record<IncomingDemandeType, string> = {
  join: '[join-requests]',
  transfer: '[transfer-requests]',
};

async function requireTeam(ctx: ManagedTeamContext) {
  const { team, error } = await readTeamHead(
    ctx.db,
    ctx.tenantId,
    ctx.team.teamId
  );
  if (error || !team) throw fail(404, 'Team introuvable.');
  return team;
}

/** GET : demandes de l'équipe (en attente par défaut), enrichies du profil. */
export async function listIncomingDemandes(
  ctx: ManagedTeamContext,
  type: IncomingDemandeType,
  rawStatus: unknown
) {
  const team = await requireTeam(ctx);
  const status =
    typeof rawStatus === 'string' && STATUSES.includes(rawStatus)
      ? rawStatus
      : 'pending';
  const { rows, error } = await listTeamDemandes(ctx.db, {
    tenantId: ctx.tenantId,
    teamId: team.id,
    type,
    status,
  });
  if (error) {
    ctx.logger.error(`${LOG[type]} GET error:`, error);
    throw fail(500, 'Echec du chargement des demandes.');
  }

  // Un seul appel RPC pour tous les profils ; un id inconnu reste absent.
  const profiles = await fetchAdminUserProfiles(rows.map((d) => d.user_id));
  const demandes = rows.map((d) => {
    const p = d.user_id ? profiles.get(d.user_id) : undefined;
    return {
      id: d.id,
      user_id: d.user_id,
      status: d.status,
      comment: d.comment,
      payload: d.payload,
      created_at: d.created_at,
      user: p
        ? {
            id: d.user_id,
            email: p.email || null,
            display_name: p.display_name || p.full_name || null,
            battle_tag: p.battle_tag || null,
          }
        : null,
    };
  });
  return { demandes };
}

type Decision = {
  demandeId: string;
  action: 'approve' | 'reject';
  battleTag?: unknown;
  reason?: string | null;
};

/** POST : approuver (RPC transactionnelle) ou rejeter une demande. */
async function decide(
  ctx: ManagedTeamContext,
  type: IncomingDemandeType,
  body: Decision
) {
  const { db, tenantId } = ctx;
  const team = await requireTeam(ctx);
  const { demandeId, action } = body;

  const { demande, error: fetchErr } = await readPendingTeamDemande(db, {
    tenantId,
    teamId: team.id,
    type,
    demandeId,
  });
  if (fetchErr || !demande) {
    throw fail(404, 'Demande introuvable ou deja traitee.');
  }
  const payload = (demande.payload ?? null) as DemandePayload | null;

  if (action === 'reject') {
    // `staff_note` est affiché à la candidate comme « Motif : … » : seul le
    // motif saisi y va (ou rien). L'auteur du geste — qui y était écrit en
    // uuid — reste tracé, mais dans le payload, jamais affiché à la joueuse.
    const reason = body.reason?.trim() || null;
    const { error } = await rejectTeamDemande(db, {
      tenantId,
      demandeId,
      note: reason,
      payload: {
        ...((demande.payload as Record<string, unknown> | null) ?? {}),
        rejected_by_user_id: ctx.subject.userId,
      },
    });
    if (error) {
      ctx.logger.error(`${LOG[type]} update error:`, error);
      throw fail(500, 'Echec de la mise a jour de la demande.');
    }
    await announceJoinDecision({
      tenantId,
      userId: demande.user_id,
      demandeId,
      kind: type,
      decision: 'rejected',
      teamId: team.id,
      teamName: team.name,
      reason,
    });
    return {
      success: true,
      demandeId,
      newStatus: 'rejected',
      message:
        type === 'join' ? 'Demande rejetee.' : 'Demande de transfert rejetee.',
    };
  }

  const desiredRole = validateRole(payload?.desired_role);
  // Roster verrouillé par un tournoi : l'admin force via /api/admin/*.
  const lock = await isTeamRosterLocked(tenantId, team.id);
  if (lock.locked) throw fail(409, rosterLockErrorMessage(lock));

  // Adhésion : le BattleTag AVANT la RPC, qui le lit dans le payload pour
  // remplir la fiche ; la capitaine peut le corriger dans le corps.
  let battleTag: string | null = payload?.user_battle_tag || null;
  if (type === 'join') {
    const tag = await resolveDemandeBattleTag({
      demandeId,
      tenantId,
      userId: demande.user_id ?? null,
      role: desiredRole,
      payload: (demande.payload as Record<string, unknown> | null) ?? null,
      override: body.battleTag,
    });
    if (!tag.ok) throw fail(tag.status, tag.error, tag.code);
    battleTag = tag.battleTag;
  }

  const { error: rpcErr } = await rpcApproveDemande(db, type, demandeId);
  if (rpcErr) {
    const mapped = mapTeamRpcError(rpcErr);
    if (mapped.status >= 500) {
      const rpc =
        type === 'join' ? 'approve_join_request' : 'approve_transfer_request';
      ctx.logger.error(`${LOG[type]} ${rpc} rpc error:`, rpcErr);
    }
    throw fail(mapped.status, mapped.error);
  }

  // Actualité automatique, APRÈS la RPC, best-effort. BROUILLON dans les deux
  // cas : le staff publie s'il y a lieu (`published_at` null).
  try {
    const playerName =
      battleTag?.split('#')[0] || payload?.user_display_name || 'Joueuse';
    const text = buildJoinNewsText({
      kind: type,
      playerName,
      teamName: team.name,
      role: desiredRole,
      fromTeamName: payload?.from_team_name ?? null,
    });
    await insertTeamNews(db, {
      ...text,
      slug: `team-${team.id}-${type}-${Date.now().toString(36)}`,
      tag: 'teams',
      image_url: team.logo_url ?? null,
      team_id: team.id,
      status: 'draft',
      published_at: null,
      tenant_id: tenantId,
    });
  } catch (newsErr) {
    ctx.logger.error(`${LOG[type]} create news error:`, newsErr);
  }

  await announceJoinDecision({
    tenantId,
    userId: demande.user_id,
    demandeId,
    kind: type,
    decision: 'approved',
    teamId: team.id,
    teamName: team.name,
    role: desiredRole,
  });

  return {
    success: true,
    demandeId,
    newStatus: 'approved',
    message:
      type === 'join'
        ? "Joueur accepte et ajoute a l'equipe."
        : "Transfert accepte, joueur ajoute a l'equipe.",
  };
}

export const decideJoinRequest = (
  ctx: ManagedTeamContext,
  body: JoinRequestDecisionInput
) => decide(ctx, 'join', body);

export const decideTransferRequest = (
  ctx: ManagedTeamContext,
  body: TransferRequestDecisionInput
) => decide(ctx, 'transfer', body);
