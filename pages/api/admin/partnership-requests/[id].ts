import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, StaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import { applyRateLimit } from '@/utils/rateLimit';

type UpdatePayload = {
  status?:
    | 'new'
    | 'read'
    | 'contacted'
    | 'negotiating'
    | 'accepted'
    | 'declined'
    | 'archived';
  adminNotes?: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: StaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'admin-partnership-req'
    )
  )
    return;
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }
  const admin = supabaseAdmin!;

  const { id } = req.query;
  if (!id || typeof id !== 'string' || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Request ID required.' });
  }

  if (req.method === 'GET') {
    const { data, error } = await admin
      .from('partnership_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Request not found.' });
    }

    // Mark as read if new
    if (data.status === 'new') {
      await admin
        .from('partnership_requests')
        .update({ status: 'read', read_at: new Date().toISOString() })
        .eq('id', id);
      data.status = 'read';
      data.read_at = new Date().toISOString();
    }

    return res.status(200).json(data);
  }

  if (req.method === 'PATCH') {
    const body = req.body as UpdatePayload;
    const updates: Record<string, unknown> = {};

    if (body.status !== undefined) {
      const validStatuses = [
        'new',
        'read',
        'contacted',
        'negotiating',
        'accepted',
        'declined',
        'archived',
      ];
      if (!validStatuses.includes(body.status)) {
        return res.status(400).json({ error: 'Invalid status.' });
      }
      updates.status = body.status;

      // Set timestamp for status changes
      if (body.status === 'read' && !updates.read_at) {
        updates.read_at = new Date().toISOString();
      }
      if (body.status === 'contacted') {
        updates.contacted_at = new Date().toISOString();
      }
    }

    if (body.adminNotes !== undefined) {
      updates.admin_notes = body.adminNotes || null;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No changes provided.' });
    }

    // Fetch the current request data before update (needed for auto-creating partner)
    const { data: currentRequest } = await admin
      .from('partnership_requests')
      .select('*')
      .eq('id', id)
      .single();

    const { data, error } = await admin
      .from('partnership_requests')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    // If status changed to 'accepted', auto-create a disabled partner
    if (
      body.status === 'accepted' &&
      currentRequest &&
      currentRequest.status !== 'accepted'
    ) {
      const partnerCategory =
        currentRequest.category === 'other'
          ? 'cultural'
          : currentRequest.category;

      const { data: newPartner, error: partnerError } = await admin
        .from('partners')
        .insert({
          name: currentRequest.company_name,
          description:
            currentRequest.message ||
            `Partenaire ${currentRequest.company_name}`,
          category: partnerCategory,
          website_url: currentRequest.website || null,
          is_active: false,
          display_order: 0,
        })
        .select('id')
        .single();

      if (partnerError) {
        console.error(
          '[admin/partnership-requests] auto-create partner error',
          partnerError
        );
      } else if (ctx.staff?.id && newPartner) {
        await logStaffAction({
          staff_id: ctx.staff.id,
          action: 'settings_update' as any,
          entity_type: 'partner',
          entity_id: newPartner.id,
          payload: {
            autoCreated: true,
            fromPartnershipRequest: id,
            companyName: currentRequest.company_name,
          },
        });
      }
    }

    if (error) {
      console.error('[admin/partnership-requests] update error', error);
      return res.status(500).json({ error: 'Failed to update the request.' });
    }

    if (!data) {
      return res.status(404).json({ error: 'Request not found.' });
    }

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'settings_update' as any,
        entity_type: 'partnership_request',
        entity_id: id,
        payload: { updates },
      });
    }

    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { data: existing } = await admin
      .from('partnership_requests')
      .select('id, company_name')
      .eq('id', id)
      .single();

    if (!existing) {
      return res.status(404).json({ error: 'Request not found.' });
    }

    const { error } = await admin
      .from('partnership_requests')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[admin/partnership-requests] delete error', error);
      return res.status(500).json({ error: 'Failed to delete the request.' });
    }

    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'settings_update' as any,
        entity_type: 'partnership_request',
        entity_id: id,
        payload: { companyName: existing.company_name, deleted: true },
      });
    }

    return res.status(200).json({ success: true });
  }

  res.setHeader('Allow', 'GET,PATCH,DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, 'admin');
