// pages/api/admin/tournaments/notify-captains.ts
// Staff endpoint: envoyer une notification aux capitaines pour un tournoi
// - POST { tournamentId } : envoie un email + message captain_message a tous les capitaines
//   Email envoye si le capitaine a un email renseigne, sinon fallback message interne uniquement.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import { sendTournamentNotificationEmail } from '@/utils/email';

import { logger } from '../../../../utils/logger';
export default withStaffRoute(handler, 'manager');

async function handler(req: NextApiRequest, res: NextApiResponse, ctx: any) {
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
    .maybeSingle();

  if (tErr || !tournament) {
    return res.status(404).json({ error: 'Tournoi introuvable.' });
  }

  // Fetch all active teams with captains
  const { data: teams, error: teamsErr } = await supabaseAdmin!
    .from('teams')
    .select('id, name, captain_id')
    .eq('is_active', true)
    .not('captain_id', 'is', null);

  if (teamsErr) {
    logger.error('[notify-captains] teams error:', teamsErr);
    return res.status(500).json({ error: 'Echec du chargement des equipes.' });
  }

  if (!teams || teams.length === 0) {
    return res.status(200).json({
      success: true,
      notified: 0,
      message: 'Aucune equipe active avec capitaine.',
    });
  }

  // Deduplicate captains (a captain can only have one team, but just in case)
  const captainIds = [
    ...new Set(teams.map((t) => t.captain_id).filter(Boolean)),
  ] as string[];

  let emailsSent = 0;
  let messagesSent = 0;
  const errors: string[] = [];

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

  for (const captainId of captainIds) {
    try {
      // Get captain email from auth
      const { data: userData } =
        await supabaseAdmin!.auth.admin.getUserById(captainId);
      const captainEmail = userData?.user?.email;

      // Find the team for this captain
      const captainTeam = teams.find((t) => t.captain_id === captainId);

      // Send email if available
      if (captainEmail) {
        const emailResult = await sendTournamentNotificationEmail(
          captainEmail,
          tournament.name,
          tournament.start_date,
          tournament.slug
        );
        if (emailResult.success) {
          emailsSent++;
        } else {
          errors.push(
            `Email echoue pour ${captainEmail}: ${emailResult.error}`
          );
        }
      }

      // Always send an internal message via the messaging system
      if (captainTeam) {
        const { error: msgErr } = await supabaseAdmin!.from('demandes').insert({
          user_id: null,
          team_id: captainTeam.id,
          type: 'captain_message',
          status: 'pending',
          comment: messageContent,
          source: 'system',
          payload: {
            conversation_id: `system_${captainTeam.id}`,
            from_team_id: 'system',
            from_team_name: "OW Women's Cup",
            target_team_name: captainTeam.name,
            sender_display_name: 'Organisateur',
            notification_type: 'tournament_open',
            tournament_id: tournament.id,
            tournament_name: tournament.name,
          },
        });

        if (msgErr) {
          errors.push(
            `Message echoue pour team ${captainTeam.name}: ${msgErr.message}`
          );
        } else {
          messagesSent++;
        }
      }
    } catch (err: unknown) {
      errors.push(`Erreur capitaine ${captainId}: ${(err as Error).message}`);
    }
  }

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
          captains_count: captainIds.length,
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
    notified: captainIds.length,
    emailsSent,
    messagesSent,
    errors: errors.length > 0 ? errors : undefined,
    message: `${captainIds.length} capitaine(s) notifie(s) : ${emailsSent} email(s) + ${messagesSent} message(s).`,
  });
}
