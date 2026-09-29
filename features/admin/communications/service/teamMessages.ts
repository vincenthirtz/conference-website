// features/admin/communications/service/teamMessages.ts — contacter les
// équipes d'un tournoi dans LEUR salon textuel Discord (provisionné par le
// bot sur `team.created`).
//
// `dryRun` (défaut VRAI) : aperçu rendu par équipe, rien n'est envoyé.

import { z } from 'zod';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import type { AuditDetails } from '@/utils/admin/defineAdminRoute';
import { AdminError, LegacyAdminError } from '@/utils/admin/errors';
import {
  loadTeamRosterStates,
  composeTeamMessages,
  sendTeamMessages,
  classifyRoster,
  TEMPLATE_VARIABLES,
  TEAM_MESSAGE_MAX,
  type RenderedTeamMessage,
} from '@/utils/teamMessages';

const bodySchema = z.object({
  preset: z.enum(['roster-reminder', 'custom']).default('roster-reminder'),
  template: z.string().max(4000).optional(),
  teamIds: z.array(z.string().uuid()).max(200).optional(),
  mention: z.boolean().optional(),
  only: z.enum(['all', 'incomplete', 'needs_attention']).optional(),
  tournamentId: z.string().uuid().optional(),
  // Défaut PRUDENT : sans `dryRun: false` explicite, on ne fait qu'un aperçu.
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

/** GET : état roster de chaque équipe inscrite + capacité de livraison. */
export async function getTeamMessagesState(
  ctx: ServiceContext,
  q: Record<string, unknown>
) {
  const tournamentId =
    typeof q.tournamentId === 'string' ? q.tournamentId : null;
  try {
    const rosterCtx = await loadTeamRosterStates(tournamentId, ctx.tenantId);
    if (!rosterCtx) {
      return {
        tournament: null,
        teams: [],
        variables: TEMPLATE_VARIABLES,
        maxLength: TEAM_MESSAGE_MAX,
      };
    }
    return {
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
    };
  } catch (err) {
    ctx.logger.error('[admin/team-messages] GET error:', err);
    throw new LegacyAdminError(500, 'Erreur lors du chargement');
  }
}

/** POST : aperçu, ou envoi d'un event `team.message` par équipe livrable. */
export async function sendTeamMessagesFromAdmin(
  ctx: ServiceContext,
  raw: unknown,
  staffId: string
): Promise<{ result: Record<string, unknown>; audit: AuditDetails }> {
  const parsed = bodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    throw new LegacyAdminError(400, 'Paramètres invalides', {
      extra: { details: parsed.error.issues.map((i) => i.message) },
    });
  }
  const body = parsed.data;
  if (body.preset === 'custom' && !body.template?.trim()) {
    throw new LegacyAdminError(
      400,
      'Un gabarit est requis pour un message personnalisé'
    );
  }

  try {
    const rosterCtx = await loadTeamRosterStates(
      body.tournamentId ?? null,
      ctx.tenantId
    );
    if (!rosterCtx) throw new LegacyAdminError(409, 'Aucun tournoi en cours');

    const messages = composeTeamMessages(rosterCtx, {
      preset: body.preset,
      template: body.template,
      mention: body.mention,
      teamIds: body.teamIds,
      only: body.only,
    });
    const tournament = {
      id: rosterCtx.tournamentId,
      name: rosterCtx.tournamentName,
    };

    if (body.dryRun) {
      return {
        result: { dryRun: true, tournament, messages: serialize(messages) },
        // Un aperçu n'envoie rien : rien à journaliser.
        audit: { skip: true },
      };
    }

    const sent = await sendTeamMessages(messages, {
      tenantId: ctx.tenantId,
      tournamentId: rosterCtx.tournamentId,
      source: 'admin',
      actor: staffId,
    });

    return {
      result: {
        dryRun: false,
        tournament,
        ...sent,
        messages: serialize(messages),
      },
      audit: {
        entity_type: 'team_message',
        entity_id: rosterCtx.tournamentId,
        tournament_id: rosterCtx.tournamentId,
        payload: {
          preset: body.preset,
          mention: Boolean(body.mention),
          only: body.only ?? 'all',
          sent: sent.sent,
          skipped: sent.skipped,
          teams: sent.teams,
        },
      },
    };
  } catch (err) {
    if (err instanceof AdminError) throw err;
    ctx.logger.error('[admin/team-messages] POST error:', err);
    throw new LegacyAdminError(500, "Erreur lors de l'envoi");
  }
}
