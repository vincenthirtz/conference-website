// utils/teams/scrimRequestActions.ts
//
// Cœur de la négociation de scrim : accepter, contre-proposer, refuser,
// signaler. PARTAGÉ entre le site et le bot.
//
// POURQUOI EXTRAIT. La logique vivait dans `pages/api/teams/scrim-requests.ts`,
// soudée à la session du navigateur. Pour qu'une capitaine puisse répondre
// depuis un message privé Discord, il fallait la même logique appelée par une
// route bot — et la dupliquer aurait garanti la divergence : deux endroits où
// créer le scrim draft, deux endroits où poser `agreed_slot`, un seul corrigé
// le jour d'un bug. Même patron que `utils/taskBoard.ts` pour le Kanban.
//
// L'AUTHZ RESTE À L'APPELANT. Le site l'obtient par la session
// (`getManagedTeamForRequest` + `assertTeamPermission`), le bot par
// l'identifiant Discord de l'actrice. Ce module reçoit une équipe DÉJÀ
// autorisée et ne vérifie plus que les règles PROPRES à la négociation : la
// demande existe, elle est en attente, l'équipe y participe, et ce n'est pas
// celle qui a proposé qui accepte sa propre proposition.

import { supabaseAdmin } from '@/utils/supabase';
import { readScrimNego, normalizeSlots } from './scrimNegotiation';
import { notifyScrimCounterProposal } from '@/utils/discord';
import { emitScrimEvent } from '@/utils/scrimEvents';
import { emitBotEvent } from '@/utils/botEvents';
import { logger } from '@/utils/logger';

type DemandeRow = Record<string, unknown>;

export const SCRIM_ACTIONS = [
  'accept',
  'approve',
  'counter',
  'reject',
  'report',
] as const;

export type ScrimAction = (typeof SCRIM_ACTIONS)[number];

export function isScrimAction(v: unknown): v is ScrimAction {
  return (
    typeof v === 'string' && (SCRIM_ACTIONS as readonly string[]).includes(v)
  );
}

/** L'équipe qui agit, déjà autorisée par l'appelant. */
export type ScrimActor = {
  /** `auth.users.id` — tracé dans `staff_note`. */
  userId: string;
  teamId: string;
  teamName: string;
  /** Affiché dans la notification Discord de contre-proposition. */
  displayName?: string | null;
  /**
   * Vrai quand un admin tranche à la place de l'équipe (capitaine injoignable).
   * Ne change RIEN au traitement — seulement la trace : `staff_note` doit dire
   * qui a décidé, sinon l'historique laisse croire que l'équipe a répondu.
   */
  onBehalfOfTeam?: boolean;
};

export type ScrimActionInput = {
  tenantId: string;
  demandeId: string;
  action: ScrimAction;
  /** `accept` : le créneau retenu parmi ceux sur la table. */
  slot?: unknown;
  /** `counter` : les nouveaux créneaux proposés. */
  slots?: unknown;
  actor: ScrimActor;
};

/**
 * Résultat transportable tel quel dans une réponse HTTP. `status` porte le code
 * pour que les deux routes répondent la même chose au même cas — un refus
 * identique côté site et côté bot.
 */
export type ScrimActionResult =
  | { ok: true; status: number; body: Record<string, unknown> }
  | { ok: false; status: number; error: string };

const fail = (status: number, error: string): ScrimActionResult => ({
  ok: false,
  status,
  error,
});

/**
 * Trace de la décision. Un admin qui débloque une demande laissée sans réponse
 * doit apparaître comme tel : « Accepté par le capitaine » serait faux, et
 * c'est précisément la ligne qu'on relira en cas de contestation.
 */
function noteFor(verb: string, actor: ScrimActor): string {
  return actor.onBehalfOfTeam
    ? `${verb} par le staff au nom de ${actor.teamName} (${actor.userId})`
    : `${verb} par le capitaine (${actor.userId})`;
}

/**
 * Trace la décision dans le salon d'actions du bot.
 *
 * Émise depuis le CŒUR et non depuis les routes : une capitaine qui répond
 * depuis le site doit apparaître au même titre qu'une qui clique dans Discord.
 * Sinon le salon ne montrerait que la moitié des décisions, et le staff
 * relancerait des équipes qui ont déjà répondu.
 */
function emitResolved(
  tenantId: string,
  demandeId: string,
  outcome: 'accepted' | 'rejected' | 'countered' | 'reported',
  actor: ScrimActor,
  extra: Record<string, unknown> = {}
): void {
  void emitBotEvent(
    'scrim.request.resolved',
    {
      demandeId,
      outcome,
      teamName: actor.teamName,
      byStaff: Boolean(actor.onBehalfOfTeam),
      actorName: actor.displayName ?? null,
      ...extra,
    },
    tenantId
  ).catch((e) => logger.error('[scrimActions] emit resolved error: %s', e));
}

/**
 * Applique une action de négociation. Ne lève jamais sur un cas métier : les
 * refus reviennent en `{ ok: false }` avec le code HTTP qui convient.
 */
export async function applyScrimRequestAction(
  input: ScrimActionInput
): Promise<ScrimActionResult> {
  if (!supabaseAdmin) {
    return fail(500, 'Service base de données indisponible.');
  }
  const { tenantId, demandeId, action, actor } = input;

  // La demande est chargée SANS filtre sur l'équipe : l'actrice peut être du
  // côté demandeur comme du côté cible. Le contrôle de participation vient
  // juste après.
  const { data: demande, error: fetchErr } = await supabaseAdmin
    .from('demandes')
    .select('*')
    .eq('id', demandeId)
    .eq('tenant_id', tenantId)
    .eq('type', 'scrim')
    .eq('status', 'pending')
    .maybeSingle();

  if (fetchErr || !demande) {
    return fail(404, 'Demande introuvable ou deja traitee.');
  }

  const row = demande as DemandeRow;
  const payload = (row.payload as Record<string, unknown>) || {};
  const fromTeamId = (payload.from_team_id as string | null) ?? null;
  const targetTeamId = (row.team_id as string | null) ?? null;
  const nego = readScrimNego(payload);
  const proposer = nego.proposed_by ?? fromTeamId;
  const currentSlots = nego.slots;

  const myTeamId = actor.teamId;
  if (myTeamId !== fromTeamId && myTeamId !== targetTeamId) {
    return fail(403, 'Tu ne participes pas à cette négociation de scrim.');
  }
  const isProposer = myTeamId === proposer;

  if (action === 'report' && row.source !== 'public') {
    return fail(400, 'Seules les demandes externes peuvent être signalées.');
  }

  /* ---- reject ---- */
  if (action === 'reject') {
    const { error } = await supabaseAdmin
      .from('demandes')
      .update({
        status: 'rejected',
        processed_at: new Date().toISOString(),
        staff_note: noteFor('Refusé', actor),
      })
      .eq('id', demandeId)
      .eq('tenant_id', tenantId);

    if (error) {
      logger.error('[scrimActions] reject error:', error);
      return fail(500, 'Echec de la mise a jour.');
    }
    emitResolved(tenantId, demandeId, 'rejected', actor);
    return {
      ok: true,
      status: 200,
      body: {
        success: true,
        demandeId,
        newStatus: 'rejected',
        message: 'Demande de scrim refusee.',
      },
    };
  }

  /* ---- report (spam, demandes externes seulement) ---- */
  if (action === 'report') {
    const { error } = await supabaseAdmin
      .from('demandes')
      .update({
        status: 'cancelled',
        processed_at: new Date().toISOString(),
        staff_note: noteFor('Signalée comme spam', actor),
      })
      .eq('id', demandeId)
      .eq('tenant_id', tenantId);

    if (error) {
      logger.error('[scrimActions] report error:', error);
      return fail(500, 'Echec de la mise a jour.');
    }
    emitResolved(tenantId, demandeId, 'reported', actor);
    return {
      ok: true,
      status: 200,
      body: {
        success: true,
        demandeId,
        newStatus: 'cancelled',
        message: 'Demande signalée. Le staff la passera en revue.',
      },
    };
  }

  /* ---- counter ---- */
  if (action === 'counter') {
    if (isProposer) {
      return fail(
        400,
        "Tu as déjà proposé ces créneaux ; c'est à l'équipe adverse de répondre."
      );
    }

    const slotsResult = normalizeSlots(input.slots);
    if (!slotsResult.ok) return fail(400, slotsResult.error);
    const newSlots = slotsResult.slots;

    const newNego = {
      slots: newSlots,
      proposed_by: myTeamId,
      rounds: nego.rounds + 1,
      agreed_slot: null,
    };

    const { error } = await supabaseAdmin
      .from('demandes')
      .update({
        status: 'pending',
        payload: { ...payload, scrim_nego: newNego, preferred_date: newSlots[0] },
      })
      .eq('id', demandeId)
      .eq('tenant_id', tenantId);

    if (error) {
      logger.error('[scrimActions] counter error:', error);
      return fail(500, 'Echec de la mise a jour.');
    }

    // On prévient l'AUTRE équipe : c'est son tour.
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
      counterTargetName = (t?.name as string | undefined) ?? null;
    }

    void notifyScrimCounterProposal({
      fromTeamName: actor.teamName,
      targetTeamName: counterTargetName || 'Équipe adverse',
      proposedSlots: newSlots,
      rounds: newNego.rounds,
      message: (row.comment as string | null) ?? null,
      requesterDisplayName: actor.displayName ?? null,
    });

    emitResolved(tenantId, demandeId, 'countered', actor, { slots: newSlots });
    return {
      ok: true,
      status: 200,
      body: {
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
        counterTargetTeamId,
      },
    };
  }

  /* ---- accept / approve ---- */
  if (isProposer) {
    return fail(
      400,
      "Tu as proposé ces créneaux ; c'est à l'équipe adverse d'accepter."
    );
  }

  let agreedSlot: string | null = null;
  const rawSlot = input.slot;
  if (typeof rawSlot === 'string' && rawSlot.trim()) {
    const d = new Date(rawSlot.trim());
    if (Number.isNaN(d.getTime())) return fail(400, 'Créneau invalide.');
    agreedSlot = d.toISOString();
    if (!currentSlots.includes(agreedSlot)) {
      return fail(400, 'Ce créneau ne fait pas partie des créneaux proposés.');
    }
  } else if (currentSlots.length === 1) {
    // Demande mono-créneau : accepter sans préciser accepte le seul en lice.
    agreedSlot = currentSlots[0];
  } else {
    return fail(400, 'Précise le créneau accepté (slot).');
  }

  const { error: updateErr } = await supabaseAdmin
    .from('demandes')
    .update({
      status: 'approved',
      processed_at: new Date().toISOString(),
      staff_note: noteFor('Accepté', actor),
      payload: {
        ...payload,
        preferred_date: agreedSlot,
        scrim_nego: {
          slots: currentSlots,
          proposed_by: proposer,
          rounds: nego.rounds,
          agreed_slot: agreedSlot,
        },
      },
    })
    .eq('id', demandeId)
    .eq('tenant_id', tenantId);

  if (updateErr) {
    logger.error('[scrimActions] accept error:', updateErr);
    return fail(500, 'Echec de la mise a jour.');
  }

  const fromTeamName = (payload.from_team_name as string) || 'Equipe inconnue';
  const targetTeamName =
    (payload.target_team_name as string) || actor.teamName;

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
      (row.comment ? ` — "${row.comment as string}"` : ''),
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

  // Scrim draft, idempotent sur `source_demande_id` : le créneau négocié est
  // porté dans la session plutôt que redemandé.
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
          description: (row.comment as string | null) ?? null,
        })
        .select('*')
        .maybeSingle();

      if (scrimErr) {
        logger.error('[scrimActions] scrim auto-create error:', scrimErr);
      } else if (createdScrim) {
        void emitScrimEvent('scrim.created', createdScrim, tenantId, {
          autoCreatedFromDemande: true,
        });
      }
    }
  } catch (scrimEx) {
    logger.error('[scrimActions] scrim auto-create exception:', scrimEx);
  }

  emitResolved(tenantId, demandeId, 'accepted', actor, { agreedSlot });
  return {
    ok: true,
    status: 200,
    body: {
      success: true,
      demandeId,
      newStatus: 'approved',
      agreedSlot,
      message: "Scrim accepte ! L'equipe organisatrice a ete notifiee.",
    },
  };
}
