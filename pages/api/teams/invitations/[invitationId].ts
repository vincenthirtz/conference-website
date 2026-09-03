// pages/api/teams/invitations/[invitationId].ts
//
// Actions sur UNE invitation en attente, depuis l'espace équipe :
//   POST   — relancer (nouveau lien privé + expiration repoussée + email) ;
//   DELETE — annuler.
//
// Pendant de `GET /api/teams/invitations` : une fois les invitations visibles,
// il faut pouvoir agir dessus, sinon on ne fait que constater. Le cas réel qui
// a motivé les deux : une équipe inscrite dont les joueuses n'avaient rien vu
// passer (email en spam, adresse mal saisie) et dont l'invitation expirait au
// bout de 7 jours sans que personne côté équipe puisse la relancer.
//
// Gate : `manage_roster`, la même que la création. Volontairement PAS
// « l'émetteur seul » (ce que fait `cancelInvitation` côté bot) : sur le site,
// l'équipe est gérée à plusieurs — une capitaine doit pouvoir annuler une
// invitation envoyée par son manager, et réciproquement. Le scope reste
// l'équipe gérée par l'appelante, vérifié avant toute écriture.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withSubjectRoute } from '@/utils/subject';
import { sendTeamInviteLinkEmail } from '@/utils/email';
import {
  assertTeamPermission,
  TEAM_MANAGEMENT_FORBIDDEN,
} from '@/utils/teams/managementAccess';
import { getManagedTeamForRequest } from '@/utils/teams/teamScope';
import {
  listPendingInvitationsForTeam,
  refreshInvitationToken,
} from '@/utils/teams/invitations';
import {
  buildInviteUrl,
  generateInviteToken,
  hashInviteToken,
} from '@/utils/teams/inviteLinks';
import { logger } from '@/utils/logger';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default withSubjectRoute(
  async function handler(
    req: NextApiRequest,
    res: NextApiResponse,
    { subject }
  ) {
    // Verbes écrits positivement : cf. la note de invitations/index.ts — le
    // détecteur de dérive OpenAPI doit pouvoir les lire.
    switch (req.method) {
      case 'POST':
      case 'DELETE':
        break;
      default:
        res.setHeader('Allow', 'POST, DELETE');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Service unavailable.' });
    }

    // La relance envoie un email : même plafond que la création d'invitation.
    if (
      applyRateLimit(
        req,
        res,
        { max: 10, windowMs: 10 * 60 * 1000 },
        'team-invite-action'
      )
    ) {
      return;
    }

    const invitationId = String(req.query.invitationId ?? '');
    if (!UUID_RE.test(invitationId)) {
      return res
        .status(400)
        .json({ error: 'Invitation invalide.', code: 'INVALID_ID' });
    }

    const { userId, tenantId } = subject;

    const access = await getManagedTeamForRequest(req, userId, tenantId);
    if (!access) {
      return res
        .status(403)
        .json({ error: TEAM_MANAGEMENT_FORBIDDEN, code: 'FORBIDDEN' });
    }
    const denied = assertTeamPermission(access, 'manage_roster');
    if (denied) {
      return res
        .status(denied.status)
        .json({ error: denied.error, code: 'FORBIDDEN' });
    }

    // Scope : l'invitation DOIT appartenir à l'équipe gérée par l'appelante.
    // On la cherche dans la liste de l'équipe plutôt que de la charger par id
    // puis comparer — un `team_id` qui ne correspond pas devient alors un 404
    // indistinguable d'un id inexistant, et l'appartenance d'une invitation à
    // une autre équipe ne fuit pas.
    const listed = await listPendingInvitationsForTeam(tenantId, access.teamId);
    if (!listed.ok) {
      return res
        .status(listed.status)
        .json({ error: listed.error, code: 'LIST_FAILED' });
    }
    const invitation = listed.data.find((row) => row.id === invitationId);
    if (!invitation) {
      return res.status(404).json({
        error: "Cette invitation n'existe plus ou a déjà été traitée.",
        code: 'INVITATION_NOT_FOUND',
      });
    }

    if (req.method === 'DELETE') {
      const { error } = await supabaseAdmin
        .from('demandes')
        .update({ status: 'cancelled', processed_at: new Date().toISOString() })
        .eq('tenant_id', tenantId)
        .eq('id', invitation.id)
        // CAS : si l'invitée vient d'accepter, l'annulation ne doit pas
        // ressusciter une invitation déjà consommée.
        .eq('status', 'pending');
      if (error) {
        logger.error('[teams/invitations/:id] cancel error', error);
        return res
          .status(500)
          .json({ error: "Échec de l'annulation.", code: 'CANCEL_FAILED' });
      }
      return res.status(200).json({ status: 'cancelled', id: invitation.id });
    }

    // POST → relance.
    const email = invitation.payload?.invite_email ?? null;
    if (!email) {
      return res.status(400).json({
        error:
          "Cette invitation n'a pas d'email associé : elle ne peut pas être relancée.",
        code: 'NO_INVITE_EMAIL',
      });
    }

    const token = generateInviteToken();
    const refreshed = await refreshInvitationToken(
      tenantId,
      invitation.id,
      hashInviteToken(token)
    );
    if (!refreshed.ok) {
      return res
        .status(refreshed.status)
        .json({ error: refreshed.error, code: 'RESEND_FAILED' });
    }

    const { data: team } = await supabaseAdmin
      .from('teams')
      .select('name')
      .eq('id', access.teamId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    const inviteUrl = buildInviteUrl(token);

    // Email best-effort, comme à la création : le lien est de toute façon
    // renvoyé à l'appelante, qui peut le transmettre par ses propres moyens
    // (Discord, SMS…). Un échec d'envoi ne doit pas annuler la relance déjà
    // persistée — l'ancien lien, lui, est déjà invalidé.
    let emailSent = false;
    try {
      const sendResult = await sendTeamInviteLinkEmail({
        tenantId,
        to: email,
        teamName: team?.name ?? 'ton équipe',
        role: invitation.payload?.desired_role ?? 'player',
        asCaptain: Boolean(invitation.payload?.set_captain),
        inviteUrl,
      });
      emailSent = !!sendResult?.success;
    } catch (err) {
      logger.error('[teams/invitations/:id] resend email failed', err);
    }

    return res.status(200).json({
      status: 'resent',
      id: invitation.id,
      email,
      // Jeton en clair renvoyé UNE SEULE FOIS, comme à la création.
      invite_url: inviteUrl,
      email_sent: emailSent,
      expires_at: refreshed.data.payload?.expires_at ?? null,
    });
  },
  { tenantResolution: 'async', allowActAs: true }
);
