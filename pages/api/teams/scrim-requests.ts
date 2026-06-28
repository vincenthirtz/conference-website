// pages/api/teams/scrim-requests.ts
// API capitaine : négociation multi-créneaux des scrims (proposition /
// contre-proposition).
// - GET  : lister les scrims EN ATTENTE DE MON ACTION dans les DEUX sens
//          (je suis participant ET scrim_nego.proposed_by != ma team).
// - POST : accept / counter / reject / report sur une demande scrim.
//
// La négociation vit dans demandes.payload.scrim_nego (cf.
// utils/teams/scrimNegotiation.ts). Un capitaine/manager de l'UNE OU L'AUTRE
// des deux équipes participantes peut agir (getManagedTeam).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit, applyActorRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { withAuthRoute } from '@/utils/staff';
import {
  getManagedTeam,
  TEAM_MANAGEMENT_FORBIDDEN,
} from '@/utils/teams/managementAccess';
import { resolveTenantIdForUserRequest } from '@/utils/tenant';
import { readScrimNego, normalizeSlots } from '@/utils/teams/scrimNegotiation';
import { notifyScrimCounterProposal } from '@/utils/discord';
import { emitScrimEvent } from '@/utils/scrimEvents';

import { logger } from '../../../utils/logger';

type DemandeRow = Record<string, any>;

/** Enrich a scrim demande with sender info (auth user OR public contact). */
async function enrichScrim(
  d: DemandeRow,
  myTeamId: string
): Promise<Record<string, unknown>> {
  let userInfo: {
    id: string | null;
    email: string | null;
    display_name: string | null;
    discord: string | null;
  } | null = null;

  if (d.user_id) {
    try {
      const { data: u } = await supabaseAdmin!.auth.admin.getUserById(
        d.user_id
      );
      if (u?.user) {
        const meta = u.user.user_metadata ?? {};
        userInfo = {
          id: d.user_id,
          email: u.user.email || null,
          display_name: meta.display_name || meta.full_name || null,
          discord: meta.discord || null,
        };
      }
    } catch {
      // best-effort enrichment
    }
  } else if (d.source === 'public' && d.payload) {
    const p = d.payload as Record<string, any>;
    userInfo = {
      id: null,
      email: p.requester_email || null,
      display_name: p.requester_name || null,
      discord: p.requester_discord || null,
    };
  }

  const payload = (d.payload as Record<string, unknown>) || {};
  const nego = readScrimNego(payload);
  const fromTeamId = (payload.from_team_id as string | null) ?? null;

  return {
    id: d.id,
    user_id: d.user_id,
    source: d.source,
    status: d.status,
    comment: d.comment,
    payload: d.payload,
    created_at: d.created_at,
    user: userInfo,
    // Negotiation contract fields.
    scrimNego: {
      slots: nego.slots,
      proposedBy: nego.proposed_by,
      rounds: nego.rounds,
      agreedSlot: nego.agreed_slot,
    },
    iAmRequester: myTeamId === fromTeamId,
    myTeamId,
  };
}

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (applyRateLimit(req, res, { max: 20, windowMs: 60_000 }, 'scrim-requests'))
    return;

  const userId = user.id;
  const tenantId = resolveTenantIdForUserRequest(req, { authUserId: userId });

  // Per-user cap : refuser le spam de scrim accept/reject (a chaque
  // accept, on cree un scrim draft cote /admin/demandes auto-process).
  if (
    applyActorRateLimit(
      res,
      userId,
      { max: 5, windowMs: 60_000 },
      'scrim-requests'
    )
  )
    return;

  // Check if user can manage a team (captain or manager)
  const access = await getManagedTeam(userId, tenantId);
  if (!access) {
    return res.status(403).json({ error: TEAM_MANAGEMENT_FORBIDDEN });
  }

  const { data: captainTeam, error: teamErr } = await supabaseAdmin
    .from('teams')
    .select('id, name, logo_url')
    .eq('id', access.teamId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (teamErr || !captainTeam) {
    return res.status(404).json({ error: 'Team introuvable.' });
  }

  const myTeamId = captainTeam.id as string;

  if (req.method === 'GET') {
    // Scrims AWAITING MY ACTION in both directions :
    //  - I am a participant (target via team_id OR requester via payload), AND
    //  - the current proposal was NOT made by my team.
    // The unit-test supabase mock treats .or() as a no-op, so we run TWO
    // queries (one per direction) and merge + dedupe in code.
    try {
      const [asTargetRes, asRequesterRes] = await Promise.all([
        supabaseAdmin
          .from('demandes')
          .select('*')
          .eq('team_id', myTeamId)
          .eq('tenant_id', tenantId)
          .eq('type', 'scrim')
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
        supabaseAdmin
          .from('demandes')
          .select('*')
          .filter('payload->>from_team_id', 'eq', myTeamId)
          .eq('tenant_id', tenantId)
          .eq('type', 'scrim')
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
      ]);

      if (asTargetRes.error || asRequesterRes.error) {
        logger.error(
          '[scrim-requests] GET error:',
          asTargetRes.error || asRequesterRes.error
        );
        return res.status(500).json({ error: 'Echec du chargement.' });
      }

      const byId = new Map<string, DemandeRow>();
      for (const d of [
        ...(asTargetRes.data || []),
        ...(asRequesterRes.data || []),
      ]) {
        byId.set(d.id as string, d);
      }

      // Keep only the demandes where it's MY turn (non-proposer).
      const awaitingMe = Array.from(byId.values()).filter((d) => {
        const nego = readScrimNego(
          (d.payload as Record<string, unknown>) || {}
        );
        return nego.proposed_by !== myTeamId;
      });

      const enriched = await Promise.all(
        awaitingMe.map((d) => enrichScrim(d, myTeamId))
      );

      return res.status(200).json({ demandes: enriched });
    } catch (err) {
      logger.error('[scrim-requests] GET exception:', err);
      return res.status(500).json({ error: 'Echec du chargement.' });
    }
  }

  if (req.method === 'POST') {
    const { demandeId, action, slot, slots } = req.body || {};

    if (
      !demandeId ||
      typeof demandeId !== 'string' ||
      !isValidUUID(demandeId)
    ) {
      return res.status(400).json({ error: 'demandeId invalide.' });
    }

    const validActions = ['accept', 'approve', 'counter', 'reject', 'report'];
    if (!validActions.includes(action)) {
      return res.status(400).json({
        error:
          'Action invalide. Utilise "accept", "counter", "reject" ou "report".',
      });
    }

    // Load the scrim demande tenant-scoped (NOT pre-filtered by team_id : the
    // caller may be the requester team, not the target). Must still be pending.
    const { data: demande, error: fetchErr } = await supabaseAdmin
      .from('demandes')
      .select('*')
      .eq('id', demandeId)
      .eq('tenant_id', tenantId)
      .eq('type', 'scrim')
      .eq('status', 'pending')
      .maybeSingle();

    if (fetchErr || !demande) {
      return res
        .status(404)
        .json({ error: 'Demande introuvable ou deja traitee.' });
    }

    const payload = (demande as DemandeRow).payload || {};
    const fromTeamId = (payload.from_team_id as string | null) ?? null;
    const targetTeamId = (demande as DemandeRow).team_id as string | null;
    const nego = readScrimNego(payload as Record<string, unknown>);
    const proposer = nego.proposed_by ?? fromTeamId;
    const currentSlots = nego.slots;

    // Authz : caller must manage one of the two participating teams.
    const isParticipant = myTeamId === fromTeamId || myTeamId === targetTeamId;
    if (!isParticipant) {
      return res.status(403).json({
        error: 'Tu ne participes pas à cette négociation de scrim.',
      });
    }

    const isProposer = myTeamId === proposer;

    // 'report' is only valid for public (external) scrim requests.
    if (action === 'report' && (demande as DemandeRow).source !== 'public') {
      return res.status(400).json({
        error: 'Seules les demandes externes peuvent être signalées.',
      });
    }

    /* ---- action: reject ---- */
    if (action === 'reject') {
      const { error: updateErr } = await supabaseAdmin
        .from('demandes')
        .update({
          status: 'rejected',
          processed_at: new Date().toISOString(),
          staff_note: `Refusé par le capitaine (${userId})`,
        })
        .eq('id', demandeId)
        .eq('tenant_id', tenantId);

      if (updateErr) {
        logger.error('[scrim-requests] reject error:', updateErr);
        return res.status(500).json({ error: 'Echec de la mise a jour.' });
      }
      return res.status(200).json({
        success: true,
        demandeId,
        newStatus: 'rejected',
        message: 'Demande de scrim refusee.',
      });
    }

    /* ---- action: report (spam, public only) ---- */
    if (action === 'report') {
      const { error: updateErr } = await supabaseAdmin
        .from('demandes')
        .update({
          status: 'cancelled',
          processed_at: new Date().toISOString(),
          staff_note: `Signalée comme spam par le capitaine (${userId})`,
        })
        .eq('id', demandeId)
        .eq('tenant_id', tenantId);

      if (updateErr) {
        logger.error('[scrim-requests] report error:', updateErr);
        return res.status(500).json({ error: 'Echec de la mise a jour.' });
      }
      return res.status(200).json({
        success: true,
        demandeId,
        newStatus: 'cancelled',
        message: 'Demande signalée. Le staff la passera en revue.',
      });
    }

    /* ---- action: counter ---- */
    if (action === 'counter') {
      // Only the NON-proposer may counter.
      if (isProposer) {
        return res.status(400).json({
          error:
            "Tu as déjà proposé ces créneaux ; c'est à l'équipe adverse de répondre.",
        });
      }

      const slotsResult = normalizeSlots(slots);
      if (!slotsResult.ok) {
        return res.status(400).json({ error: slotsResult.error });
      }
      const newSlots = slotsResult.slots;

      const newNego = {
        slots: newSlots,
        proposed_by: myTeamId,
        rounds: nego.rounds + 1,
        agreed_slot: null,
      };
      const newPayload = {
        ...(payload as Record<string, unknown>),
        scrim_nego: newNego,
        preferred_date: newSlots[0],
      };

      const { error: updateErr } = await supabaseAdmin
        .from('demandes')
        .update({ status: 'pending', payload: newPayload })
        .eq('id', demandeId)
        .eq('tenant_id', tenantId);

      if (updateErr) {
        logger.error('[scrim-requests] counter error:', updateErr);
        return res.status(500).json({ error: 'Echec de la mise a jour.' });
      }

      // Notify the OTHER team (the one whose turn it now is).
      const counterTargetTeamId =
        myTeamId === fromTeamId ? targetTeamId : fromTeamId;
      let counterTargetName: string | null = null;
      if (counterTargetTeamId) {
        const { data: t } = await supabaseAdmin
          .from('teams')
          .select('name')
          .eq('id', counterTargetTeamId)
          .eq('tenant_id', tenantId)
          .maybeSingle();
        counterTargetName = t?.name ?? null;
      }

      void notifyScrimCounterProposal({
        fromTeamName: captainTeam.name as string,
        targetTeamName: counterTargetName || 'Équipe adverse',
        proposedSlots: newSlots,
        rounds: newNego.rounds,
        message: (demande as DemandeRow).comment ?? null,
        requesterDisplayName:
          (user.user_metadata?.display_name as string | null) ||
          (user.user_metadata?.full_name as string | null) ||
          (user.email as string | null),
      });

      return res.status(200).json({
        success: true,
        demandeId,
        newStatus: 'pending',
        scrimNego: {
          slots: newNego.slots,
          proposedBy: newNego.proposed_by,
          rounds: newNego.rounds,
          agreedSlot: newNego.agreed_slot,
        },
        message: 'Contre-proposition envoyée.',
      });
    }

    /* ---- action: accept / approve ---- */
    // Only the NON-proposer may accept the slots on the table.
    if (isProposer) {
      return res.status(400).json({
        error:
          "Tu as proposé ces créneaux ; c'est à l'équipe adverse d'accepter.",
      });
    }

    // Resolve which slot is being accepted.
    let agreedSlot: string | null = null;
    if (typeof slot === 'string' && slot.trim()) {
      const d = new Date(slot.trim());
      if (isNaN(d.getTime())) {
        return res.status(400).json({ error: 'Créneau invalide.' });
      }
      agreedSlot = d.toISOString();
      if (!currentSlots.includes(agreedSlot)) {
        return res.status(400).json({
          error: 'Ce créneau ne fait pas partie des créneaux proposés.',
        });
      }
    } else {
      // Legacy single-slot demande : 'approve' with no slot accepts the lone slot.
      if (currentSlots.length === 1) {
        agreedSlot = currentSlots[0];
      } else {
        return res.status(400).json({
          error: 'Précise le créneau accepté (slot).',
        });
      }
    }

    const newPayload = {
      ...(payload as Record<string, unknown>),
      preferred_date: agreedSlot,
      scrim_nego: {
        slots: currentSlots,
        proposed_by: proposer,
        rounds: nego.rounds,
        agreed_slot: agreedSlot,
      },
    };

    const { error: updateErr } = await supabaseAdmin
      .from('demandes')
      .update({
        status: 'approved',
        processed_at: new Date().toISOString(),
        staff_note: `Accepté par le capitaine (${userId})`,
        payload: newPayload,
      })
      .eq('id', demandeId)
      .eq('tenant_id', tenantId);

    if (updateErr) {
      logger.error('[scrim-requests] accept error:', updateErr);
      return res.status(500).json({ error: 'Echec de la mise a jour.' });
    }

    // Side-effects (mirror the admin approve side-effect in
    // pages/api/admin/demandes/index.ts) : notification demande + draft scrim
    // with scheduled_date = agreed_slot.
    const fromTeamName =
      (payload.from_team_name as string) || 'Equipe inconnue';
    const targetTeamName =
      (payload.target_team_name as string) || (captainTeam.name as string);

    await supabaseAdmin.from('demandes').insert({
      user_id: null,
      team_id: targetTeamId,
      type: 'other',
      status: 'pending',
      source: 'website',
      comment:
        `Scrim accepte : ${fromTeamName} vs ${targetTeamName}` +
        (agreedSlot
          ? ` (date : ${new Date(agreedSlot).toLocaleDateString('fr-FR')})`
          : '') +
        ((demande as DemandeRow).comment
          ? ` — "${(demande as DemandeRow).comment}"`
          : ''),
      payload: {
        notification_type: 'scrim_accepted',
        from_team_id: fromTeamId,
        from_team_name: fromTeamName,
        target_team_id: targetTeamId,
        target_team_name: targetTeamName,
        preferred_date: agreedSlot,
        original_demande_id: demandeId,
      },
      tenant_id: tenantId,
    });

    // Draft scrim entity (idempotent on source_demande_id) — uses agreed_slot
    // as scheduled_date so the negotiated time is carried into the session.
    try {
      const { data: existingScrim } = await supabaseAdmin
        .from('scrims')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('source_demande_id', demandeId)
        .maybeSingle();

      if (!existingScrim) {
        const scrimName = `${fromTeamName} vs ${targetTeamName}`;
        const slugBase =
          `${fromTeamName}-vs-${targetTeamName}-${demandeId.slice(0, 8)}`
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');

        const { data: createdScrim, error: scrimErr } = await supabaseAdmin
          .from('scrims')
          .insert({
            tenant_id: tenantId,
            name: scrimName,
            slug: slugBase || null,
            status: 'draft',
            team1_id: fromTeamId,
            team2_id: targetTeamId,
            scheduled_date: agreedSlot,
            is_public: false,
            source_demande_id: demandeId,
            description: (demande as DemandeRow).comment ?? null,
          })
          .select('*')
          .maybeSingle();

        if (scrimErr) {
          logger.error('[scrim-requests] scrim auto-create error:', scrimErr);
        } else if (createdScrim) {
          void emitScrimEvent('scrim.created', createdScrim, tenantId, {
            autoCreatedFromDemande: true,
          });
        }
      }
    } catch (scrimEx) {
      logger.error('[scrim-requests] scrim auto-create exception:', scrimEx);
    }

    return res.status(200).json({
      success: true,
      demandeId,
      newStatus: 'approved',
      agreedSlot,
      message: "Scrim accepte ! L'equipe organisatrice a ete notifiee.",
    });
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
});
