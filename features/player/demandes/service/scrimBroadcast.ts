// features/player/demandes/service/scrimBroadcast.ts — demande de scrim
// GROUPÉE : les mêmes créneaux proposés à toute une audience d'équipes, niveau
// (SR) annoncé. Règles et contrat : utils/teams/scrimBroadcast.ts.
//
// Mêmes gardes qu'une demande simple (équipe gérée, droit `manage_scrims`,
// créneaux normalisés), puis UNE demande `scrim` par destinataire, reliées par
// `payload.broadcast.id`. Une équipe déjà sollicitée (demande en attente) est
// sautée, jamais relancée.
//
// Notifications : MP du bot et e-mail à CHAQUE équipe destinataire (comme une
// demande simple), mais UN SEUL message au staff pour tout l'envoi.

import { randomUUID } from 'node:crypto';
import { LegacyAdminError } from '@/utils/admin/errors';
import { notifyScrimRequest } from '@/utils/discord';
import { resolveTeamSkillRating } from '@/utils/overwatchRank';
import { normalizeSlots } from '@/utils/teams/scrimNegotiation';
import {
  announcedSrLabel,
  selectBroadcastTargets,
  type BroadcastCandidate,
  type ScrimBroadcastAudience,
} from '@/utils/teams/scrimBroadcast';
import {
  assertTeamPermission,
  getManagedTeam,
  TEAM_MANAGEMENT_FORBIDDEN,
} from '@/utils/teams/managementAccess';
import {
  formatScrimDateFr,
  notifyScrimRequestDm,
  notifyScrimRequestEmail,
} from '@/utils/scrimRequestNotify';
import { zodIssueFields } from '@/utils/player/errors';
import {
  insertDemandes,
  listPendingScrimTargets,
} from '../repository/demandes';
import {
  listActiveTeamsWithSkill,
  listSearchingTeamIds,
} from '../repository/teams';
import { ScrimBroadcastBody } from '../schemas';
import { displayNameOf, type DemandesCtx } from './context';

type Audience = {
  myTeam: { id: string; name: string; skillRating: number | null };
  targets: BroadcastCandidate[];
  /** Équipes de l'audience sautées : déjà une demande en attente vers elles. */
  alreadyPending: number;
};

/** Équipe gérée + droit `manage_scrims`, sinon 403 (message historique). */
async function managedTeamId(
  ctx: DemandesCtx,
  requestedTeamId: string | null
): Promise<string> {
  const access = await getManagedTeam(
    ctx.userId,
    ctx.tenantId,
    requestedTeamId
  );
  if (!access) throw new LegacyAdminError(403, TEAM_MANAGEMENT_FORBIDDEN);
  const denied = assertTeamPermission(access, 'manage_scrims');
  if (denied) throw new LegacyAdminError(denied.status, denied.error);
  return access.teamId;
}

/** Audience résolue : destinataires, moins les équipes déjà sollicitées. */
async function resolveAudience(
  ctx: DemandesCtx,
  myTeamId: string,
  audience: ScrimBroadcastAudience,
  announcedSr: number | null
): Promise<Audience> {
  const [teams, searching, pending] = await Promise.all([
    listActiveTeamsWithSkill(ctx.db, ctx.tenantId),
    listSearchingTeamIds(ctx.db, ctx.tenantId),
    listPendingScrimTargets(ctx.db, ctx.tenantId, ctx.userId),
  ]);
  if (teams.error || searching.error || pending.error) {
    ctx.logger.error('[demandes/scrim-broadcast] audience error', null, {
      tenantId: ctx.tenantId,
    });
    throw new LegacyAdminError(500, 'Verification error.');
  }

  const candidates: BroadcastCandidate[] = teams.teams.map((t) => ({
    id: t.id,
    name: t.name,
    skillRating:
      resolveTeamSkillRating(t.skill_rating, t.team_members)?.average ?? null,
    searching: searching.ids.has(t.id),
  }));
  const mine = candidates.find((c) => c.id === myTeamId);
  if (!mine) throw new LegacyAdminError(404, 'Team introuvable.');

  const selected = selectBroadcastTargets(candidates, {
    myTeamId,
    audience,
    referenceSr: announcedSr ?? mine.skillRating,
  });
  const targets = selected.filter((c) => !pending.teamIds.has(c.id));
  return {
    myTeam: { id: mine.id, name: mine.name, skillRating: mine.skillRating },
    targets,
    alreadyPending: selected.length - targets.length,
  };
}

/* ---------------------------------------------------------------------------
 * GET — aperçu : qui recevrait la demande
 * ------------------------------------------------------------------------ */

export async function previewScrimBroadcast(
  ctx: DemandesCtx,
  query: { audience: ScrimBroadcastAudience; announcedSr?: number },
  requestedTeamId: string | null
) {
  const myTeamId = await managedTeamId(ctx, requestedTeamId);
  const { myTeam, targets, alreadyPending } = await resolveAudience(
    ctx,
    myTeamId,
    query.audience,
    query.announcedSr ?? null
  );
  return {
    audience: query.audience,
    /** SR de l'équipe, pour préremplir le niveau annoncé. */
    teamSkillRating: myTeam.skillRating,
    count: targets.length,
    alreadyPending,
    teams: targets.map((t) => ({
      id: t.id,
      name: t.name,
      skillRating: t.skillRating,
      searching: t.searching,
    })),
  };
}

/* ---------------------------------------------------------------------------
 * POST — l'envoi
 * ------------------------------------------------------------------------ */

export async function submitScrimBroadcast(
  ctx: DemandesCtx,
  raw: unknown,
  requestedTeamId: string | null
) {
  const parsed = ScrimBroadcastBody.safeParse(raw ?? {});
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new LegacyAdminError(400, first?.message || 'Requête invalide.', {
      extra: {
        field: first?.path?.join('.') || undefined,
        fields: zodIssueFields(parsed.error),
      },
    });
  }
  const body = parsed.data;
  const myTeamId = await managedTeamId(ctx, requestedTeamId);

  const slotsResult = normalizeSlots(body.proposedSlots);
  if (!slotsResult.ok) throw new LegacyAdminError(400, slotsResult.error);
  const slots = slotsResult.slots;
  if (slots.some((s) => Date.parse(s) < Date.now())) {
    throw new LegacyAdminError(400, 'Les créneaux doivent être dans le futur.');
  }

  const announcedSr = body.announcedSr ?? null;
  const { myTeam, targets, alreadyPending } = await resolveAudience(
    ctx,
    myTeamId,
    body.audience,
    announcedSr
  );
  if (targets.length === 0) {
    throw new LegacyAdminError(
      400,
      alreadyPending > 0
        ? 'Toutes les équipes de cette audience ont déjà une demande de ta part en attente.'
        : 'Aucune équipe ne correspond à cette audience.'
    );
  }

  const message = body.message?.trim()?.slice(0, 1000) || null;
  const broadcast = {
    id: randomUUID(),
    audience: body.audience,
    target_count: targets.length,
  };
  const base = {
    user_email: ctx.user.email,
    user_display_name: displayNameOf(ctx.user),
    from_team_id: myTeam.id,
    from_team_name: myTeam.name,
    preferred_date: slots[0],
    announced_sr: announcedSr,
    broadcast,
  };

  const { demandes, error } = await insertDemandes(
    ctx.db,
    ctx.tenantId,
    targets.map((target) => ({
      user_id: ctx.userId,
      team_id: target.id,
      type: 'scrim' as const,
      comment: message,
      payload: {
        ...base,
        target_team_name: target.name,
        scrim_nego: {
          slots,
          proposed_by: myTeam.id,
          rounds: 1,
          agreed_slot: null,
        },
      },
    }))
  );
  if (error) {
    ctx.logger.error('[demandes/scrim-broadcast] insert error:', error);
    throw new LegacyAdminError(500, 'Failed to create request.');
  }

  // Staff : UN message pour tout l'envoi (fire-and-forget).
  notifyScrimRequest({
    fromTeamName: myTeam.name,
    targetTeamName: `${targets.length} équipes (demande groupée)`,
    preferredDate: slots[0],
    message,
    requesterDisplayName:
      (base.user_display_name as string | null) ||
      (ctx.user.email as string | null),
  });

  // Chaque équipe destinataire : e-mail + MP, best-effort. Le niveau annoncé
  // précède le message — les canaux existants n'ont pas de champ dédié.
  const srLine = announcedSrLabel(announcedSr);
  const notifyMessage = [srLine, message].filter(Boolean).join(' — ') || null;
  const idByTeam = new Map(demandes.map((d) => [d.team_id, d.id]));
  for (const target of targets) {
    const notifyArgs = {
      tenantId: ctx.tenantId,
      targetTeamId: target.id,
      demandeId: idByTeam.get(target.id) ?? null,
      slots,
      opponentName: myTeam.name,
      dateLabel: formatScrimDateFr(slots),
      message: notifyMessage,
      requesterName: myTeam.name,
      isExternal: false,
    };
    void notifyScrimRequestEmail(notifyArgs).catch(() => {});
    void notifyScrimRequestDm(notifyArgs).catch(() => {});
  }

  return {
    success: true,
    broadcastId: broadcast.id,
    sent: targets.length,
    alreadyPending,
    teams: targets.map((t) => t.name),
    message: `Ta demande de scrim a été envoyée à ${targets.length} équipe${targets.length > 1 ? 's' : ''}.`,
  };
}
