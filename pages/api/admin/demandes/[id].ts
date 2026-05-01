// pages/api/admin/demandes/[id].ts
// Admin: récupère une demande par son ID avec toutes ses relations.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { isValidUUID } from '@/utils/apiHelpers';

import { logger } from '../../../../utils/logger';
export default withStaffRoute(handler, 'caster');

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin not configured' });
  }

  const rawId = req.query.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  if (!id || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid demande id' });
  }

  const { data, error } = await supabaseAdmin
    .from('demandes')
    .select(
      `
      id,
      user_id,
      team_id,
      tournament_id,
      type,
      status,
      comment,
      staff_note,
      processed_by_staff_id,
      processed_at,
      source,
      payload,
      created_at,
      updated_at,
      team:teams!demandes_team_id_fkey(id, name, short_name, logo_url),
      tournament:tournaments!demandes_tournament_id_fkey(id, name, slug)
      `
    )
    .eq('id', id)
    .maybeSingle();

  if (error) {
    logger.error('[admin/demandes/:id] fetch error:', error);
    return res.status(500).json({ error: 'Failed to fetch demande' });
  }

  if (!data) {
    return res.status(404).json({ error: 'Demande not found' });
  }

  const demande = data as Record<string, unknown> & { user_id: string | null };

  // Enrich with user info from Supabase Auth
  if (demande.user_id) {
    try {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(
        demande.user_id
      );
      if (userData?.user) {
        const meta = userData.user.user_metadata ?? {};
        demande.user = {
          id: demande.user_id,
          email: userData.user.email ?? null,
          display_name:
            (meta.display_name as string) ||
            (meta.full_name as string) ||
            userData.user.email ||
            null,
          battle_tag: (meta.battle_tag as string) || null,
          discord: (meta.discord as string) || null,
        };
      }
    } catch (e) {
      logger.error('[admin/demandes/:id] user fetch error:', e);
    }
  }

  // Enrich with handler (staff) info
  const processedBy = demande.processed_by_staff_id as string | null;
  if (processedBy) {
    try {
      const { data: staffData } = await supabaseAdmin
        .from('staff')
        .select('id, display_name, role')
        .eq('id', processedBy)
        .maybeSingle();
      if (staffData) {
        demande.handled_by = staffData;
      }
    } catch (e) {
      logger.error('[admin/demandes/:id] staff fetch error:', e);
    }
  }

  return res.status(200).json({ demande });
}
