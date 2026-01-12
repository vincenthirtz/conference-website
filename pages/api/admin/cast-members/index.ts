import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { getStaffContextFromRequest, hasAtLeastRole } from '@/utils/staff';

type CastMemberPayload = {
  name?: string;
  title?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  twitchUrl?: string | null;
  city?: string | null;
  isActive?: boolean;
  isPromo?: boolean;
  sortOrder?: number;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Service Supabase indisponible (service role manquant).' });
  }
  const admin = supabaseAdmin!;

  const ctx = await getStaffContextFromRequest(req, res);
  if (!hasAtLeastRole(ctx.role, 'admin')) {
    return res.status(403).json({ error: 'Accès réservé aux admins.' });
  }

  if (req.method === 'GET') {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 100));
    const includeInactive = req.query.includeInactive === 'true';

    let query = admin
      .from('cast_members')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[admin/cast-members] list error', error);
      return res
        .status(500)
        .json({ error: 'Impossible de charger les casteuses.' });
    }

    return res.status(200).json({ items: data ?? [] });
  }

  if (req.method === 'POST') {
    const body = req.body as CastMemberPayload;
    if (!body.name) {
      return res
        .status(400)
        .json({ error: 'Le nom est obligatoire.' });
    }

    // Récupérer le prochain sort_order
    const { data: maxOrder } = await admin
      .from('cast_members')
      .select('sort_order')
      .order('sort_order', { ascending: false })
      .limit(1)
      .single();

    const nextOrder = (maxOrder?.sort_order ?? 0) + 1;

    const insertPayload = {
      name: body.name.trim(),
      title: body.title?.trim() || null,
      description: body.description?.trim() || null,
      image_url: body.imageUrl?.trim() || null,
      twitch_url: body.twitchUrl?.trim() || null,
      city: body.city?.trim() || null,
      is_active: body.isActive ?? true,
      is_promo: body.isPromo ?? false,
      sort_order: body.sortOrder ?? nextOrder,
    };

    const { data, error } = await admin
      .from('cast_members')
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.error('[admin/cast-members] create error', error);
      return res
        .status(500)
        .json({ error: 'Impossible de créer la casteuse.', detail: error.message });
    }

    return res.status(201).json(data);
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
}
