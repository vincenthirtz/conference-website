// features/admin/demandes/service/demandes.ts — fiche staff d'une demande et
// relance Discord des capitaines d'une demande de scrim.
//
// La relance est la MÊME mécanique que l'envoi automatique à la création
// (`notifyScrimRequestDm`) : mêmes destinataires (capitaine, manager,
// coach), mêmes boutons, même trace `scrim.request.dispatched` dans le salon
// d'actions du bot. L'email n'est PAS renvoyé (un second email à la même
// adresse ressemble à du spam).

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { LegacyAdminError } from '@/utils/admin/errors';
import {
  formatScrimDateFr,
  notifyScrimRequestDm,
} from '@/utils/scrimRequestNotify';
import { readScrimNego } from '@/utils/teams/scrimNegotiation';
import type { Audited } from '../../_shared/audited';
import {
  type AssignmentAction,
  type AssignmentResult,
  setAssignment,
} from '../../_shared/staffAssignment';
import * as demandes from '../repository/demandes';

const fail = (status: number, error: string) =>
  new LegacyAdminError(status, error);

/** Demande + relations, enrichie du demandeur (Auth) et du staff traitant. */
export async function getDemande(ctx: ServiceContext, id: string) {
  const { row, error } = await demandes.getDemandeDetail(
    ctx.db,
    ctx.tenantId,
    id
  );
  if (error) {
    ctx.logger.error('[admin/demandes/:id] fetch error:', error);
    throw fail(500, 'Failed to fetch demande');
  }
  if (!row) throw fail(404, 'Demande not found');

  const demande = { ...row } as Record<string, unknown> & {
    user_id: string | null;
  };

  if (demande.user_id) {
    try {
      const user = await demandes.getAuthUser(ctx.db, demande.user_id);
      if (user) {
        const meta = user.user_metadata ?? {};
        demande.user = {
          id: demande.user_id,
          email: user.email ?? null,
          display_name:
            (meta.display_name as string) ||
            (meta.full_name as string) ||
            user.email ||
            null,
          battle_tag: (meta.battle_tag as string) || null,
          discord: (meta.discord as string) || null,
        };
      }
    } catch (e) {
      ctx.logger.error('[admin/demandes/:id] user fetch error:', e);
    }
  }

  const processedBy = demande.processed_by_staff_id as string | null;
  if (processedBy) {
    try {
      const staff = await demandes.getStaffBrief(ctx.db, processedBy);
      if (staff) demande.handled_by = staff;
    } catch (e) {
      ctx.logger.error('[admin/demandes/:id] staff fetch error:', e);
    }
  }

  return { demande };
}

/**
 * « Je prends » / « Libérer » une demande (cf. _shared/staffAssignment.ts).
 * Journal : `process_demande` + `payload.assignment`, avec la personne qui
 * l'avait avant (une libération par un tiers reste traçable).
 */
export async function assignDemande(
  ctx: ServiceContext,
  id: string,
  action: AssignmentAction
): Promise<Audited<{ assignment: AssignmentResult }>> {
  const { before, after } = await setAssignment(ctx, 'demandes', id, action);
  return {
    result: { assignment: after },
    audit: {
      entity_type: 'demande',
      entity_id: id,
      payload: {
        assignment: action,
        previous_staff_id: before,
        assigned_staff_id: after.assigned_staff_id,
      },
    },
  };
}

/**
 * Relance des capitaines d'une demande de scrim EN ATTENTE. Le nombre de DM
 * réellement partis n'est pas connu ici (outbox du bot) : le message le dit.
 */
export async function notifyScrimCaptains(
  ctx: ServiceContext,
  demandeId: string
): Promise<Audited<{ success: true; message: string }>> {
  const demande = await demandes.getDemandeForNotify(
    ctx.db,
    ctx.tenantId,
    demandeId
  );
  if (!demande) throw fail(404, 'Demande introuvable.');
  if (demande.type !== 'scrim') {
    throw fail(400, 'Seules les demandes de scrim déclenchent des DM.');
  }
  // Une demande tranchée : les boutons envoyés ne pourraient plus rien faire.
  if (demande.status !== 'pending') {
    throw fail(
      400,
      'Cette demande est déjà traitée : il n’y a plus rien à relancer.'
    );
  }

  const payload = (demande.payload as Record<string, unknown>) || {};
  const nego = readScrimNego(payload);
  const targetTeamId = (demande.team_id as string | null) ?? null;
  if (!targetTeamId) throw fail(400, 'Cette demande ne vise aucune équipe.');

  await notifyScrimRequestDm({
    tenantId: ctx.tenantId,
    targetTeamId,
    demandeId,
    slots: nego.slots,
    opponentName: (payload.from_team_name as string) || 'Une équipe',
    dateLabel: formatScrimDateFr(nego.slots),
    message: null,
    requesterName: (payload.requester_name as string) || null,
    isExternal: (payload.requester_email as string | undefined) != null,
  });

  return {
    result: {
      success: true,
      message:
        'Relance envoyée. Le salon d’actions du bot indiquera qui a été joint.',
    },
    audit: { entity_type: 'demande', entity_id: demandeId },
  };
}
