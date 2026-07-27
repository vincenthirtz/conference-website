// POST /api/bot/v1/teams/messages
//
// Déclenche l'envoi d'un message personnalisé dans le salon textuel de chaque
// équipe inscrite au tournoi (rappel roster automatique ou gabarit libre).
// Pendant « bot » de /api/admin/team-messages : même cœur (utils/teamMessages),
// même sémantique dryRun, mais authentifié x-api-key + acteur staff Discord.
//
// Sert deux usages :
//   - le script one-shot `scripts/send-team-roster-reminder.js` (repo bot) ;
//   - une future commande slash staff (`/equipe rappel-roster`).
//
// Body :
//   actorDiscordUserId (staff admin/owner)   — requis
//   preset?      'roster-reminder' (défaut) | 'custom'
//   template?    gabarit libre si preset='custom' ({equipe}, {titulaires}, …)
//   teamIds?     restreint aux équipes ciblées
//   only?        'all' (défaut) | 'incomplete' | 'needs_attention'
//   mention?     ping le rôle d'équipe (défaut false)
//   tournamentId? défaut = tournoi en cours
//   dryRun?      défaut TRUE — renvoie l'aperçu sans rien poster

import { z } from 'zod';
import type { NextApiResponse } from 'next';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { requireBotStaff, logBotStaffAction } from '@/utils/botActor';
import { discordIdSchema } from '@/utils/botValidation';
import {
  loadTeamRosterStates,
  composeTeamMessages,
  sendTeamMessages,
} from '@/utils/teamMessages';
import { logger } from '@/utils/logger';

const bodySchema = z.object({
  actorDiscordUserId: discordIdSchema,
  preset: z.enum(['roster-reminder', 'custom']).default('roster-reminder'),
  template: z.string().max(4000).optional(),
  teamIds: z.array(z.string().uuid()).max(200).optional(),
  only: z.enum(['all', 'incomplete', 'needs_attention']).optional(),
  mention: z.boolean().optional(),
  tournamentId: z.string().uuid().optional(),
  dryRun: z.boolean().default(true),
});

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const input = req.botInput as z.infer<typeof bodySchema>;

  const actor = await requireBotStaff(
    req,
    res,
    (req.body ?? {}) as Record<string, unknown>
  );
  if (!actor) return;

  if (input.preset === 'custom' && !input.template?.trim()) {
    return res
      .status(400)
      .json({ error: 'template requis quand preset=custom' });
  }

  try {
    const rosterCtx = await loadTeamRosterStates(
      input.tournamentId ?? null,
      req.botContext.tenantId
    );
    if (!rosterCtx) {
      return res.status(409).json({ error: 'Aucun tournoi en cours' });
    }

    const messages = composeTeamMessages(rosterCtx, {
      preset: input.preset,
      template: input.template,
      mention: input.mention,
      teamIds: input.teamIds,
      only: input.only,
    });

    const preview = messages.map((m) => ({
      teamId: m.team.teamId,
      teamName: m.team.teamName,
      kind: m.kind,
      deliverable: m.deliverable,
      starters: m.team.starters,
      missingStarters: m.team.missingStarters,
      neverLoggedIn: m.team.neverLoggedIn,
      content: m.content,
    }));

    if (input.dryRun) {
      return res.status(200).json({
        dryRun: true,
        tournament: {
          id: rosterCtx.tournamentId,
          name: rosterCtx.tournamentName,
        },
        messages: preview,
      });
    }

    const result = await sendTeamMessages(messages, {
      tenantId: req.botContext.tenantId,
      tournamentId: rosterCtx.tournamentId,
      source: 'bot',
      actor: actor.staffId,
    });

    await logBotStaffAction({
      staffId: actor.staffId,
      action: 'send_team_message',
      entity_type: 'team_message',
      entity_id: rosterCtx.tournamentId,
      tournament_id: rosterCtx.tournamentId,
      payload: {
        action_type: 'send_team_message',
        source: 'bot',
        preset: input.preset,
        only: input.only ?? 'all',
        mention: Boolean(input.mention),
        sent: result.sent,
        skipped: result.skipped,
      },
    });

    return res.status(200).json({
      dryRun: false,
      tournament: {
        id: rosterCtx.tournamentId,
        name: rosterCtx.tournamentName,
      },
      ...result,
      messages: preview,
    });
  } catch (err) {
    logger.error('[bot/teams/messages] error:', err);
    return res.status(500).json({ error: "Échec de l'envoi" });
  }
}

export default withBotRoute(handler, {
  methods: ['POST'],
  rateLimit: {
    max: 10,
    key: 'bot-team-messages',
    perActor: { max: 3, windowMs: 60_000 },
  },
  idempotent: true,
  bodySchema,
});
