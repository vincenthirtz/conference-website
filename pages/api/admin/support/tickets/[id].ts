// pages/api/admin/support/tickets/[id].ts
// Admin: get / update / delete a single support ticket.
// PATCH body: { status?, resolution_note? }

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';

import { logger } from '../../../../../utils/logger';
const VALID_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;

export default withStaffRoute(handler, 'admin');

async function handler(req: NextApiRequest, res: NextApiResponse, ctx: AuthenticatedStaffContext) {
  const { id } = req.query;
  if (!id || Array.isArray(id) || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid ticket id' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Service indisponible' });
  }

  const ticketId = String(id);

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('support_tickets')
        .select('*')
        .eq('id', ticketId)
        .maybeSingle();

      if (error || !data) {
        return res.status(404).json({ error: 'Ticket introuvable' });
      }
      return res.status(200).json({ ticket: data });
    }

    if (req.method === 'PATCH') {
      const { status, resolution_note } = req.body || {};

      const update: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (status !== undefined) {
        if (
          typeof status !== 'string' ||
          !(VALID_STATUSES as readonly string[]).includes(status)
        ) {
          return res.status(400).json({
            error: `Statut invalide. Valeurs : ${VALID_STATUSES.join(', ')}`,
          });
        }
        update.status = status;

        if (status === 'resolved' || status === 'closed') {
          update.resolved_at = new Date().toISOString();
          update.resolved_by = ctx?.staff?.auth_user_id ?? null;
        }
      }

      if (resolution_note !== undefined) {
        if (resolution_note !== null && typeof resolution_note !== 'string') {
          return res.status(400).json({ error: 'resolution_note invalide' });
        }
        update.resolution_note = resolution_note
          ? String(resolution_note).slice(0, 2000)
          : null;
      }

      if (Object.keys(update).length === 1) {
        return res.status(400).json({ error: 'Rien à mettre à jour' });
      }

      const { data, error } = await supabaseAdmin
        .from('support_tickets')
        .update(update)
        .eq('id', ticketId)
        .select('*')
        .maybeSingle();

      if (error || !data) {
        logger.error('[admin/support/tickets/id] update error:', error);
        return res.status(500).json({ error: 'Échec de la mise à jour' });
      }

      if (ctx?.staff?.id) {
        await logStaffAction({
          staff_id: ctx.staff.id,
          action: 'update_support_ticket',
          entity_type: 'support_ticket',
          entity_id: ticketId,
          tournament_id: data.tournament_id ?? null,
          payload: {
            new_status: update.status ?? null,
            has_note: !!update.resolution_note,
          },
        });
      }

      return res.status(200).json({ ticket: data });
    }

    if (req.method === 'DELETE') {
      const { error } = await supabaseAdmin
        .from('support_tickets')
        .delete()
        .eq('id', ticketId);

      if (error) {
        logger.error('[admin/support/tickets/id] delete error:', error);
        return res.status(500).json({ error: 'Échec de la suppression' });
      }

      if (ctx?.staff?.id) {
        await logStaffAction({
          staff_id: ctx.staff.id,
          action: 'update_support_ticket',
          entity_type: 'support_ticket',
          entity_id: ticketId,
          tournament_id: null,
          payload: { deleted: true },
        });
      }

      return res.status(200).json({ success: true });
    }

    res.setHeader('Allow', 'GET,PATCH,DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    logger.error('[admin/support/tickets/id] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
