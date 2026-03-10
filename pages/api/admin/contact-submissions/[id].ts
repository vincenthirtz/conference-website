import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, hasAtLeastRole, type StaffContext } from '@/utils/staff';

type UpdatePayload = {
  status?: 'new' | 'read' | 'replied' | 'archived' | 'spam';
  adminNotes?: string | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: StaffContext
) {
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }
  const admin = supabaseAdmin!;

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Missing ID.' });
  }

  if (req.method === 'GET') {
    const { data, error } = await admin
      .from('contact_submissions')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('[admin/contact-submissions] get error', error);
      return res
        .status(404)
        .json({ error: 'Message not found.' });
    }
    return res.status(200).json(data);
  }

  if (req.method === 'PATCH') {
    const body = req.body as UpdatePayload;
    const updatePayload: Record<string, any> = {};

    if (body.status) {
      const validStatuses = ['new', 'read', 'replied', 'archived', 'spam'];
      if (!validStatuses.includes(body.status)) {
        return res.status(400).json({ error: 'Invalid status.' });
      }
      updatePayload.status = body.status;

      // Auto-set timestamps
      if (body.status === 'read' || body.status === 'replied' || body.status === 'archived') {
        updatePayload.read_at = new Date().toISOString();
      }
      if (body.status === 'replied') {
        updatePayload.replied_at = new Date().toISOString();
      }
    }

    if ('adminNotes' in body) {
      updatePayload.admin_notes = body.adminNotes?.trim() || null;
    }

    const { data, error } = await admin
      .from('contact_submissions')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[admin/contact-submissions] update error', error);
      return res
        .status(500)
        .json({ error: 'Failed to update the message.' });
    }

    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    // Only admins can delete
    if (!hasAtLeastRole(ctx.role, 'admin')) {
      return res.status(403).json({ error: 'Only admins can delete.' });
    }

    const { error } = await admin
      .from('contact_submissions')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[admin/contact-submissions] delete error', error);
      return res
        .status(500)
        .json({ error: 'Failed to delete the message.' });
    }

    return res.status(204).end();
  }

  res.setHeader('Allow', 'GET,PATCH,DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(handler, 'manager');
