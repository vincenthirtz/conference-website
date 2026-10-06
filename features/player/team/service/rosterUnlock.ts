// features/player/team/service/rosterUnlock.ts — verrou de roster en
// self-service (lot P7).
//
// Deux gestes :
//   - LIRE l'état du verrou (ajouté à GET /api/player/team) : la capitaine le
//     voit AVANT de tenter un ajout, au lieu de le découvrir par une 409 ;
//   - DEMANDER une dérogation (POST /api/teams/roster-unlock-request) : un
//     ticket de support typé `roster_unlock`, que le staff traite dans
//     /admin/support en ouvrant une fenêtre (/api/admin/teams/[id]/roster-lock).
//
// On réutilise support_tickets plutôt qu'une table dédiée : le staff a déjà
// la file, les statuts, la notification Discord et l'historique.

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { Logger } from '@/utils/logger';
import { notifySupportTicket } from '@/utils/discord';
import { formatSiteDate } from '@/utils/timezone';
import { isTeamRosterLocked } from '@/utils/teams/rosterLock';
import {
  ROSTER_UNLOCK_SUBJECT_PREFIX,
  ROSTER_UNLOCK_TICKET_CATEGORY,
  rosterUnlockSubject,
  toRosterLockView,
  type RosterLockView,
  type RosterUnlockRequestView,
} from '@/utils/teams/rosterLockView';
import type { RosterUnlockRequestInput } from '../rosterUnlockSchemas';
import { fail, type ManagedTeamContext } from './context';

const SITE_URL =
  process.env.SITE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.URL ||
  'https://owwomenscup.fr';

/** Violation de CHECK : la catégorie `roster_unlock` n'est pas encore en base. */
const CHECK_VIOLATION = '23514';

/**
 * Demande de dérogation encore ouverte pour cette équipe sur ce tournoi.
 * Reconnue par le préfixe du sujet, pour couvrir aussi le repli en `other`.
 */
export async function findPendingRosterUnlockRequest(
  db: AdminDb,
  tenantId: string,
  tournamentId: string,
  teamName: string
): Promise<RosterUnlockRequestView | null> {
  const { data, error } = await db
    .from('support_tickets')
    .select('id, created_at')
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId)
    .in('category', [ROSTER_UNLOCK_TICKET_CATEGORY, 'other'])
    .in('status', ['open', 'in_progress'])
    .eq('reported_target_type', 'team')
    .eq('reported_target_name', teamName)
    .ilike('subject', `${ROSTER_UNLOCK_SUBJECT_PREFIX}%`)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  const row = data[0] as { id: string; created_at: string };
  return { ticketId: row.id, createdAt: row.created_at };
}

/**
 * État du verrou pour l'écran capitaine. Ne lève jamais : un échec de lecture
 * rend `null` (l'écran n'affiche rien), il ne doit pas casser GET « Mon
 * équipe », dont tout l'espace dépend.
 */
export async function loadRosterLockView(
  db: AdminDb,
  tenantId: string,
  team: { id: string; name: string },
  logger?: Logger
): Promise<RosterLockView | null> {
  try {
    const status = await isTeamRosterLocked(tenantId, team.id);
    const pending = status.locked
      ? await findPendingRosterUnlockRequest(
          db,
          tenantId,
          status.tournamentId,
          team.name
        )
      : null;
    return toRosterLockView(status, pending);
  } catch (err) {
    logger?.warn('[roster-lock] lecture de l’état impossible', err);
    return null;
  }
}

type ReporterIdentity = { name: string | null; email: string | null };

async function loadReporter(
  db: AdminDb,
  userId: string
): Promise<ReporterIdentity> {
  try {
    const { data } = await db.auth.admin.getUserById(userId);
    const user = data?.user;
    if (!user) return { name: null, email: null };
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const pick = (v: unknown) =>
      typeof v === 'string' && v.trim() ? v.trim().slice(0, 100) : null;
    return {
      name:
        pick(meta.display_name) ??
        pick(meta.full_name) ??
        pick(meta.name) ??
        null,
      email: user.email ? user.email.toLowerCase() : null,
    };
  } catch {
    return { name: null, email: null };
  }
}

/**
 * POST : demande de dérogation. Refusée (409) si le roster n'est pas
 * verrouillé, ou si une demande est déjà en attente — dans ce cas on renvoie
 * la demande existante pour que l'écran l'affiche.
 */
export async function requestRosterUnlock(
  ctx: ManagedTeamContext,
  body: RosterUnlockRequestInput
) {
  const teamId = ctx.team.teamId;
  const { data: teamRow } = await ctx.db
    .from('teams')
    .select('id, name')
    .eq('tenant_id', ctx.tenantId)
    .eq('id', teamId)
    .maybeSingle();
  if (!teamRow) throw fail(404, 'Équipe introuvable.', 'team_not_found');
  const teamName = (teamRow as { name: string }).name;

  const lock = await isTeamRosterLocked(ctx.tenantId, teamId);
  if (!lock.locked) {
    throw fail(409, 'Le roster n’est pas verrouillé.', 'roster_not_locked');
  }

  const pending = await findPendingRosterUnlockRequest(
    ctx.db,
    ctx.tenantId,
    lock.tournamentId,
    teamName
  );
  if (pending) {
    throw fail(
      409,
      'Une demande de dérogation est déjà en attente pour cette équipe.',
      'roster_unlock_already_requested',
      { request: pending }
    );
  }

  const reporter = await loadReporter(ctx.db, ctx.subject.userId);
  const subject = rosterUnlockSubject(teamName);
  const lockedSince = formatSiteDate(
    lock.lockedAt,
    'fr',
    { dateStyle: 'short', timeStyle: 'short' },
    lock.lockedAt
  );
  const tournamentLabel = lock.tournamentName || lock.tournamentId.slice(0, 8);
  // Le staff lit ce message dans /admin/support et sur Discord : tout ce qu'il
  // faut pour agir sans chercher (équipe, tournoi, depuis quand, où cliquer).
  const message = [
    body.reason,
    '',
    '—',
    `Équipe : ${teamName} (${teamId})`,
    `Tournoi : ${tournamentLabel} — verrouillé depuis le ${lockedSince}`,
    `Ouvrir une fenêtre : ${SITE_URL.replace(/\/$/, '')}/admin/teams/${teamId}`,
    ctx.subject.isActingAs ? 'Demande déposée par le staff (act-as).' : null,
  ]
    .filter((l): l is string => l !== null)
    .join('\n')
    .slice(0, 5000);

  const row = {
    tenant_id: ctx.tenantId,
    tournament_id: lock.tournamentId,
    reporter_user_id: ctx.subject.userId,
    reporter_name: reporter.name,
    reporter_email: reporter.email,
    is_anonymous: false,
    severity: 'medium',
    subject,
    message,
    status: 'open',
    source: 'web',
    reported_target_type: 'team',
    reported_target_name: teamName,
  };

  let category: 'roster_unlock' | 'other' = ROSTER_UNLOCK_TICKET_CATEGORY;
  let inserted = await ctx.db
    .from('support_tickets')
    .insert({ ...row, category })
    .select('id, created_at')
    .single();
  // Migration add_roster_unlock_category_to_support_tickets.sql pas encore
  // appliquée : on classe en `other`, le préfixe du sujet garde le type.
  if (inserted.error?.code === CHECK_VIOLATION) {
    category = 'other';
    inserted = await ctx.db
      .from('support_tickets')
      .insert({ ...row, category })
      .select('id, created_at')
      .single();
  }
  if (inserted.error || !inserted.data) {
    ctx.logger.error('[roster-unlock] insert error:', inserted.error);
    throw fail(500, 'Échec de l’envoi de la demande.');
  }
  const ticket = inserted.data as { id: string; created_at?: string | null };

  void notifySupportTicket({
    ticketId: ticket.id,
    tournamentId: lock.tournamentId,
    category,
    severity: 'medium',
    isAnonymous: false,
    reporterName: reporter.name,
    reporterEmail: reporter.email,
    subject,
    message,
    adminUrl: `${SITE_URL.replace(/\/$/, '')}/admin/support`,
    reportedTarget: { type: 'team', name: teamName, battleTag: null },
  })
    .then((r) => {
      if (!r.messageId) return undefined;
      return ctx.db
        .from('support_tickets')
        .update({ discord_message_id: r.messageId })
        .eq('id', ticket.id);
    })
    .catch((e) => ctx.logger.error('[roster-unlock] notify error:', e));

  return {
    success: true,
    request: {
      ticketId: ticket.id,
      createdAt: ticket.created_at ?? new Date().toISOString(),
    },
  };
}
