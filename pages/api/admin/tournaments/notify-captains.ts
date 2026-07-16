// pages/api/admin/tournaments/notify-captains.ts
// Staff endpoint: envoyer une notification aux capitaines pour un tournoi
// - POST { tournamentId } : envoie un email + message captain_message a tous les capitaines
//   Email envoye si le capitaine a un email renseigne, sinon fallback message interne uniquement.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import { sendTournamentNotificationEmail } from '@/utils/email';

import { logger } from '../../../../utils/logger';
export default withStaffRoute(handler, 'admin');

async function handler(req: NextApiRequest, res: NextApiResponse, ctx: AuthenticatedStaffContext) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { tournamentId } = req.body || {};

  if (
    !tournamentId ||
    typeof tournamentId !== 'string' ||
    !isValidUUID(tournamentId)
  ) {
    return res.status(400).json({ error: 'tournamentId invalide.' });
  }

  // Fetch tournament info
  const { data: tournament, error: tErr } = await supabaseAdmin!
    .from('tournaments')
    .select('id, name, slug, start_date, status')
    .eq('id', tournamentId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (tErr || !tournament) {
    return res.status(404).json({ error: 'Tournoi introuvable.' });
  }

  // Fetch all active teams (les managers comptent meme sans captain assigne)
  const { data: teams, error: teamsErr } = await supabaseAdmin!
    .from('teams')
    .select('id, name, captain_id')
    .eq('is_active', true)
    .eq('tenant_id', ctx.tenantId);

  if (teamsErr) {
    logger.error('[notify-captains] teams error:', teamsErr);
    return res.status(500).json({ error: 'Echec du chargement des equipes.' });
  }

  if (!teams || teams.length === 0) {
    return res.status(200).json({
      success: true,
      notified: 0,
      message: 'Aucune equipe active.',
    });
  }

  // Fetch managers pour ces equipes
  const teamIds = teams.map((t) => t.id);
  const { data: managers, error: mgrErr } = await supabaseAdmin!
    .from('team_members')
    .select('team_id, user_id')
    .eq('role', 'manager')
    .eq('tenant_id', ctx.tenantId)
    .in('team_id', teamIds);

  if (mgrErr) {
    logger.error('[notify-captains] managers error:', mgrErr);
  }

  // Recipients par team : capitaine + managers (dedup)
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

  // Build a notification message
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
    if (userIds.length === 0) continue; // pas de responsable, on saute

    // Un seul message interne par team (la conversation est ancree sur l'equipe)
    const { error: msgErr } = await supabaseAdmin!.from('demandes').insert({
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

    // Email a chaque responsable (capitaine + managers)
    for (const userId of userIds) {
      uniqueRecipients.add(userId);
      try {
        const { data: userData } =
          await supabaseAdmin!.auth.admin.getUserById(userId);
        const recipientEmail = userData?.user?.email;
        if (!recipientEmail) continue;

        const emailResult = await sendTournamentNotificationEmail(
          recipientEmail,
          tournament.name,
          tournament.start_date,
          tournament.slug
        );
        if (emailResult.success) {
          emailsSent++;
        } else {
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

  // Log the action
  if (ctx?.staff?.id) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'other',
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
      });
    } catch (logErr) {
      logger.error('[notify-captains] log error:', logErr);
    }
  }

  return res.status(200).json({
    success: true,
    notified,
    emailsSent,
    messagesSent,
    errors: errors.length > 0 ? errors : undefined,
    message: `${notified} responsable(s) notifie(s) : ${emailsSent} email(s) + ${messagesSent} message(s).`,
  });
}
