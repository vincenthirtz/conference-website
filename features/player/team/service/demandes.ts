// features/player/team/service/demandes.ts — demandes ENTRANTES de l'équipe
// gérée : adhésion (`/api/teams/join-requests`, `manage_join_requests`) et
// transfert depuis une autre équipe (`/api/teams/transfer-requests`,
// `manage_roster`). Lot P10, même contrat.
//
// Les deux flux ne diffèrent que par la RPC d'approbation, la correction du
// BattleTag (adhésion seulement) et l'actualité produite : un brouillon pour
// une adhésion (on n'annonce pas publiquement qu'une personne rejoint une
// équipe avant qu'elle le sache), publiée pour un transfert (historique).

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
    const { error } = await rejectTeamDemande(db, {
      tenantId,
      demandeId,
      note: `Traite par le capitaine (${ctx.subject.userId})`,
    });
    if (error) {
      ctx.logger.error(`${LOG[type]} update error:`, error);
      throw fail(500, 'Echec de la mise a jour de la demande.');
    }
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

  // Actualité automatique, APRÈS la RPC, best-effort.
  try {
    const playerName =
      battleTag?.split('#')[0] || payload?.user_display_name || 'Joueur';
    const slugBase = `team-${team.id}-${type}-${Date.now().toString(36)}`;
    if (type === 'join') {
      // BROUILLON : le staff publie s'il y a lieu (`published_at` null).
      await insertTeamNews(db, {
        title: `${playerName} rejoint ${team.name}`,
        slug: slugBase,
        tag: 'teams',
        excerpt: `${playerName} rejoint ${team.name} en tant que ${desiredRole}.`,
        content: `${playerName} a rejoint ${team.name} en tant que ${desiredRole}. Bienvenue !`,
        image_url: team.logo_url ?? null,
        team_id: team.id,
        status: 'draft',
        published_at: null,
        tenant_id: tenantId,
      });
    } else {
      const fromTeamName = payload?.from_team_name || 'une equipe';
      await insertTeamNews(db, {
        title: `${playerName} transfere vers ${team.name}`,
        slug: slugBase,
        tag: 'teams',
        excerpt: `${playerName} quitte ${fromTeamName} et rejoint ${team.name} en tant que ${desiredRole}.`,
        content: `${playerName} a ete transfere de ${fromTeamName} vers ${team.name} en tant que ${desiredRole}. Bienvenue !`,
        image_url: team.logo_url ?? null,
        team_id: team.id,
        status: 'published',
        published_at: new Date().toISOString(),
        tenant_id: tenantId,
      });
    }
  } catch (newsErr) {
    ctx.logger.error(`${LOG[type]} create news error:`, newsErr);
  }

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
