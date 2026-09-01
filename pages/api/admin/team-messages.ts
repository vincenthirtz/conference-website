// pages/api/admin/team-messages.ts
//
// Contacter les équipes d'un tournoi dans LEUR salon textuel Discord
// (provisionné par le bot sur `team.created`).
//
// GET  — état roster de chaque équipe inscrite + capacité de livraison
//        (salon provisionné ou non). Alimente l'écran admin.
//        Query : ?tournamentId=<uuid>  (défaut : tournoi en cours)
//
// POST — { preset, template?, teamIds?, mention?, only?, tournamentId?, dryRun? }
//        `dryRun: true` (défaut) renvoie l'APERÇU rendu par équipe sans rien
//        envoyer. `dryRun: false` émet un event `team.message` par équipe
//        livrable et journalise l'action dans staff_logs.
//
// Auth : session staff `admin`+ (withStaffRoute).

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import {
  loadTeamRosterStates,
  composeTeamMessages,
  sendTeamMessages,
  classifyRoster,
  TEMPLATE_VARIABLES,
  TEAM_MESSAGE_MAX,
  type RenderedTeamMessage,
} from '@/utils/teamMessages';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';

const bodySchema = z.object({
  preset: z.enum(['roster-reminder', 'custom']).default('roster-reminder'),
  template: z.string().max(4000).optional(),
  teamIds: z.array(z.string().uuid()).max(200).optional(),
  mention: z.boolean().optional(),
  only: z.enum(['all', 'incomplete', 'needs_attention']).optional(),
  tournamentId: z.string().uuid().optional(),
  // Défaut PRUDENT : sans `dryRun: false` explicite, on ne fait qu'un aperçu.
  // Un client qui oublie le champ ne spamme pas 3 salons Discord.
  dryRun: z.boolean().default(true),
});

function serialize(messages: RenderedTeamMessage[]) {
  return messages.map((m) => ({
    teamId: m.team.teamId,
    teamName: m.team.teamName,
    kind: m.kind,
    deliverable: m.deliverable,
    content: m.content,
    starters: m.team.starters,
    substitutes: m.team.substitutes,
    missingStarters: m.team.missingStarters,
    neverLoggedIn: m.team.neverLoggedIn,
    missingBattleTags: m.team.missingBattleTags,
  }));
}

export default withStaffRoute(handler, { permission: 'manage_teams' });

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (req.method === 'GET') return handleGet(req, res, ctx);
  if (req.method === 'POST') return handlePost(req, res, ctx);
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const tournamentId =
    typeof req.query.tournamentId === 'string' ? req.query.tournamentId : null;

  try {
    const rosterCtx = await loadTeamRosterStates(tournamentId, ctx.tenantId);
    if (!rosterCtx) {
      return res.status(200).json({
        tournament: null,
        teams: [],
        variables: TEMPLATE_VARIABLES,
        maxLength: TEAM_MESSAGE_MAX,
      });
    }

    return res.status(200).json({
      tournament: {
        id: rosterCtx.tournamentId,
        name: rosterCtx.tournamentName,
        minPlayers: rosterCtx.minPlayers,
        startDate: rosterCtx.startDate,
        deadline: rosterCtx.deadline,
      },
      teams: rosterCtx.teams.map((team) => ({
        ...team,
        kind: classifyRoster(team, rosterCtx),
      })),
      variables: TEMPLATE_VARIABLES,
      maxLength: TEAM_MESSAGE_MAX,
    });
  } catch (err) {
    logger.error('[admin/team-messages] GET error:', err);
    return res.status(500).json({ error: 'Erreur lors du chargement' });
  }
}

async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Paramètres invalides',
      details: parsed.error.issues.map((i) => i.message),
    });
  }
  const body = parsed.data;

  if (body.preset === 'custom' && !body.template?.trim()) {
    return res
      .status(400)
      .json({ error: 'Un gabarit est requis pour un message personnalisé' });
  }

  try {
    const rosterCtx = await loadTeamRosterStates(
      body.tournamentId ?? null,
      ctx.tenantId
    );
    if (!rosterCtx) {
      return res.status(409).json({ error: 'Aucun tournoi en cours' });
    }

    const messages = composeTeamMessages(rosterCtx, {
      preset: body.preset,
      template: body.template,
      mention: body.mention,
      teamIds: body.teamIds,
      only: body.only,
    });

    if (body.dryRun) {
      return res.status(200).json({
        dryRun: true,
        tournament: {
          id: rosterCtx.tournamentId,
          name: rosterCtx.tournamentName,
        },
        messages: serialize(messages),
      });
    }

    const result = await sendTeamMessages(messages, {
      tenantId: ctx.tenantId,
      tournamentId: rosterCtx.tournamentId,
      source: 'admin',
      actor: ctx.staff.id,
    });

    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'send_team_message',
      entity_type: 'team_message',
      entity_id: rosterCtx.tournamentId,
      tournament_id: rosterCtx.tournamentId,
      tenant_id: ctx.tenantId,
      payload: {
        preset: body.preset,
        mention: Boolean(body.mention),
        only: body.only ?? 'all',
        sent: result.sent,
        skipped: result.skipped,
        teams: result.teams,
      },
    });

    return res.status(200).json({
      dryRun: false,
      tournament: {
        id: rosterCtx.tournamentId,
        name: rosterCtx.tournamentName,
      },
      ...result,
      messages: serialize(messages),
    });
  } catch (err) {
    logger.error('[admin/team-messages] POST error:', err);
    return res.status(500).json({ error: "Erreur lors de l'envoi" });
  }
}
