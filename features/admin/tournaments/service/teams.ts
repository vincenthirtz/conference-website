// features/admin/tournaments/service/teams.ts — équipes d'un tournoi côté
// staff : inscriptions (liste, ajout, modification, retrait) et relance des
// responsables d'équipe à l'ouverture des inscriptions.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import type { TablesUpdate } from '@/types/database.generated';
import { isValidUUID } from '@/utils/apiHelpers';
import { oneRelation, type Relation } from '@/utils/supabase/relation';
import { sendTournamentNotificationEmail } from '@/utils/email';
import type { Audited } from '../../_shared/audited';
import * as tRepo from '../repository/tournaments';
import * as repo from '../repository/teams';
import { fail, staffIdOf } from './common';

/* ---------------------------------------------------------------------------
 * Inscriptions
 * ------------------------------------------------------------------------ */

export async function listEntries(ctx: ServiceContext, tournamentId: string) {
  const { data, error } = await repo.listEntries(
    ctx.db,
    ctx.tenantId,
    tournamentId
  );
  if (error) {
    ctx.logger.error('admin GET tournament teams error:', error);
    fail(500, 'Failed to fetch tournament teams');
  }
  return { teams: data ?? [] };
}

export async function addEntry(
  ctx: ServiceContext,
  tournamentId: string,
  body: Record<string, unknown>
) {
  const { seed, status } = body;
  if (
    !body.team_id ||
    typeof body.team_id !== 'string' ||
    !isValidUUID(body.team_id)
  ) {
    fail(400, 'team_id is required');
  }
  const teamId = body.team_id as string;

  const { data: tournament, error: tErr } = await tRepo.findTournament(
    ctx.db,
    ctx.tenantId,
    tournamentId
  );
  if (tErr || !tournament) fail(404, 'Tournament not found');

  const { data: team, error: teamErr } = await repo.findTeam(
    ctx.db,
    ctx.tenantId,
    teamId
  );
  if (teamErr || !team) fail(404, 'Team not found');

  if (tournament.min_players) {
    const { count, error } = await repo.countTeamMembers(
      ctx.db,
      ctx.tenantId,
      teamId
    );
    if (error) {
      ctx.logger.error('Error counting team members:', error);
      fail(500, 'Failed to verify team size');
    }
    if ((count || 0) < tournament.min_players) {
      fail(
        400,
        `Team must have at least ${tournament.min_players} player(s) to register. Current: ${count || 0} member(s).`
      );
    }
  }

  if (await repo.findEntryByTeam(ctx.db, ctx.tenantId, tournamentId, teamId)) {
    fail(400, 'Team already registered in this tournament');
  }

  if (tournament.max_teams) {
    const count = await repo.countEntries(ctx.db, ctx.tenantId, tournamentId);
    if (count && count >= tournament.max_teams) {
      fail(400, 'Tournament has reached maximum team capacity');
    }
  }

  const { data, error } = await repo.insertEntry(ctx.db, {
    tenant_id: ctx.tenantId,
    tournament_id: tournamentId,
    team_id: teamId,
    seed: (seed as number | null | undefined) ?? null,
    status: (status as string | null | undefined) ?? 'registered',
  });
  if (error || !data) {
    ctx.logger.error('admin POST tournament team error:', error);
    fail(500, 'Failed to add team to tournament');
  }

  // La candidature de cette équipe, s'il y en avait une, est désormais SANS
  // OBJET : l'équipe est inscrite. La laisser `pending` la garde dans
  // /admin/demandes et bloque la carte d'inscription du capitaine (vécu par
  // trois équipes de la Cup 2026). Best-effort : l'inscription a réussi.
  try {
    const { error: demandeErr } = await repo.approvePendingRegistrations(
      ctx.db,
      ctx.tenantId,
      tournamentId,
      teamId,
      staffIdOf(ctx)
    );
    if (demandeErr) {
      ctx.logger.error(
        'admin POST tournament team: close demande error',
        demandeErr
      );
    }
  } catch (e) {
    ctx.logger.error('admin POST tournament team: close demande exception', e);
  }

  // Actualité automatique : l'équipe rejoint le tournoi.
  try {
    await repo.insertNews(ctx.db, {
      tenant_id: ctx.tenantId,
      title: `${team.name} rejoint le tournoi ${tournament.name}`,
      slug: `tournament-${tournamentId}-team-${teamId}-${Date.now().toString(36)}`,
      tag: 'tournaments',
      excerpt: `${team.name} s'est inscrite au tournoi ${tournament.name}.`,
      content: `L'équipe ${team.name} est désormais inscrite au tournoi ${tournament.name}. Bonne chance !`,
      image_url:
        oneRelation(data.team as Relation<{ logo_url: string | null }>)
          ?.logo_url ?? null,
      team_id: teamId,
      status: 'published',
      published_at: new Date().toISOString(),
    });
  } catch (newsErr) {
    ctx.logger.error('[admin/tournament/teams] create news error:', newsErr);
  }

  return {
    result: { team: data },
    audit: {
      entity_type: 'tournament_team',
      entity_id: data.id,
      tournament_id: tournamentId,
      payload: { team_id: teamId, team_name: team.name, seed },
    },
  } satisfies Audited<unknown>;
}

/** L'inscription doit appartenir au tournoi de l'URL (sinon 404). */
export async function getEntry(
  ctx: ServiceContext,
  tournamentId: string,
  entryId: string
) {
  const { data, error } = await repo.getEntry(
    ctx.db,
    ctx.tenantId,
    tournamentId,
    entryId
  );
  if (error || !data) fail(404, 'Tournament team entry not found');
  return { team: data };
}

function teamNameOf(row: { team: unknown }): string | undefined {
  return oneRelation(row.team as Relation<{ name: string }>)?.name;
}

export async function patchEntry(
  ctx: ServiceContext,
  tournamentId: string,
  entryId: string,
  body: Record<string, unknown>
) {
  const { seed, status } = body;
  const { data: before, error: fetchErr } = await repo.getEntryBefore(
    ctx.db,
    ctx.tenantId,
    tournamentId,
    entryId
  );
  if (fetchErr || !before) fail(404, 'Tournament team entry not found');

  const patch: Record<string, unknown> = {};
  if (seed !== undefined) patch.seed = seed;
  if (status !== undefined) patch.status = status;
  if (Object.keys(patch).length === 0) fail(400, 'No fields to update');

  const { data, error } = await repo.updateEntry(
    ctx.db,
    ctx.tenantId,
    tournamentId,
    entryId,
    patch as TablesUpdate<'tournament_teams'>
  );
  if (error || !data) {
    ctx.logger.error('admin PATCH tournament team error:', error);
    fail(500, 'Failed to update tournament team');
  }

  return {
    result: { team: data },
    audit: {
      entity_type: 'tournament_team',
      entity_id: entryId,
      tournament_id: tournamentId,
      payload: {
        before: { seed: before.seed, status: before.status },
        after: patch,
        team_name: teamNameOf(before),
      },
    },
  } satisfies Audited<unknown>;
}

export async function deleteEntry(
  ctx: ServiceContext,
  tournamentId: string,
  entryId: string
) {
  const { data: before, error: fetchErr } = await repo.getEntryBefore(
    ctx.db,
    ctx.tenantId,
    tournamentId,
    entryId
  );
  if (fetchErr || !before) fail(404, 'Tournament team entry not found');

  const { error } = await repo.deleteEntry(
    ctx.db,
    ctx.tenantId,
    tournamentId,
    entryId
  );
  if (error) {
    ctx.logger.error('admin DELETE tournament team error:', error);
    fail(500, 'Failed to remove team from tournament');
  }

  return {
    result: { success: true },
    audit: {
      entity_type: 'tournament_team',
      entity_id: entryId,
      tournament_id: tournamentId,
      payload: {
        team_id: before.team_id,
        team_name: teamNameOf(before),
        seed: before.seed,
      },
    },
  } satisfies Audited<unknown>;
}

/* ---------------------------------------------------------------------------
 * Relance des capitaines et managers (ouverture des inscriptions)
 * ------------------------------------------------------------------------ */

type NotifyCaptainsResult = {
  success: boolean;
  notified: number;
  message: string;
  emailsSent?: number;
  messagesSent?: number;
  errors?: string[];
};

export async function notifyCaptains(
  ctx: ServiceContext,
  body: Record<string, unknown>
): Promise<Audited<NotifyCaptainsResult>> {
  const { tournamentId } = body;
  if (
    !tournamentId ||
    typeof tournamentId !== 'string' ||
    !isValidUUID(tournamentId)
  ) {
    fail(400, 'tournamentId invalide.');
  }

  const { data: tournament, error: tErr } = await tRepo.findTournament(
    ctx.db,
    ctx.tenantId,
    tournamentId
  );
  if (tErr || !tournament) fail(404, 'Tournoi introuvable.');

  const { data: teams, error: teamsErr } = await repo.activeTeams(
    ctx.db,
    ctx.tenantId
  );
  if (teamsErr) {
    ctx.logger.error('[notify-captains] teams error:', teamsErr);
    fail(500, 'Echec du chargement des equipes.');
  }
  if (!teams || teams.length === 0) {
    // Rien d'envoyé : rien à journaliser (comportement d'origine).
    return {
      result: { success: true, notified: 0, message: 'Aucune equipe active.' },
      audit: { skip: true },
    } satisfies Audited<unknown>;
  }

  const { data: managers, error: mgrErr } = await repo.teamManagers(
    ctx.db,
    ctx.tenantId,
    teams.map((t) => t.id)
  );
  if (mgrErr) ctx.logger.error('[notify-captains] managers error:', mgrErr);

  // Destinataires par équipe : capitaine + managers (dédoublonnés).
  const recipientsByTeam = new Map<string, Set<string>>();
  for (const t of teams) {
    const set = new Set<string>();
    if (t.captain_id) set.add(t.captain_id);
    recipientsByTeam.set(t.id, set);
  }
  for (const m of managers || []) {
    const set = recipientsByTeam.get(m.team_id);
    if (set && m.user_id) set.add(m.user_id);
  }

  let emailsSent = 0;
  let messagesSent = 0;
  const errors: string[] = [];
  const uniqueRecipients = new Set<string>();

  const startDateStr = tournament.start_date
    ? new Date(tournament.start_date).toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
    : null;
  const messageContent =
    `Le tournoi "${tournament.name}" est ouvert aux inscriptions !` +
    (startDateStr ? ` Il debutera le ${startDateStr}.` : '') +
    ` Inscris ton equipe des maintenant sur le site.`;

  for (const team of teams) {
    const userIds = Array.from(recipientsByTeam.get(team.id) || []);
    if (userIds.length === 0) continue;

    // Un seul message interne par équipe (conversation ancrée sur l'équipe).
    const { error: msgErr } = await repo.insertDemande(ctx.db, {
      tenant_id: ctx.tenantId,
      user_id: null,
      team_id: team.id,
      type: 'captain_message',
      status: 'pending',
      comment: messageContent,
      source: 'system',
      payload: {
        conversation_id: `system_${team.id}`,
        from_team_id: 'system',
        from_team_name: "OW Women's Cup",
        target_team_name: team.name,
        sender_display_name: 'Organisateur',
        notification_type: 'tournament_open',
        tournament_id: tournament.id,
        tournament_name: tournament.name,
      },
    });
    if (msgErr) {
      errors.push(`Message echoue pour team ${team.name}: ${msgErr.message}`);
    } else {
      messagesSent++;
    }

    for (const userId of userIds) {
      uniqueRecipients.add(userId);
      try {
        const recipientEmail = await repo.authUserEmail(ctx.db, userId);
        if (!recipientEmail) continue;
        const emailResult = await sendTournamentNotificationEmail(
          recipientEmail,
          tournament.name,
          tournament.start_date,
          tournament.slug,
          ctx.tenantId
        );
        if (emailResult.success) emailsSent++;
        else {
          errors.push(
            `Email echoue pour ${recipientEmail}: ${emailResult.error}`
          );
        }
      } catch (err: unknown) {
        errors.push(`Erreur destinataire ${userId}: ${(err as Error).message}`);
      }
    }
  }

  const notified = uniqueRecipients.size;
  return {
    result: {
      success: true,
      notified,
      emailsSent,
      messagesSent,
      errors: errors.length > 0 ? errors : undefined,
      message: `${notified} responsable(s) notifie(s) : ${emailsSent} email(s) + ${messagesSent} message(s).`,
    },
    audit: {
      entity_type: 'tournament',
      entity_id: tournament.id,
      tournament_id: tournament.id,
      payload: {
        tournament_name: tournament.name,
        recipients_count: notified,
        emails_sent: emailsSent,
        messages_sent: messagesSent,
        errors: errors.length > 0 ? errors : undefined,
      },
    },
  } satisfies Audited<unknown>;
}
