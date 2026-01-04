import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import {
  getStaffContextFromRequest,
  hasAtLeastRole,
} from '@/utils/staff';

type AnnouncementPayload = {
  title?: string;
  message?: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  isActive?: boolean;
  priority?: number;
};

function toISO(value?: string | null) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

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

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'ID manquant.' });
  }

  const ctx = await getStaffContextFromRequest(req, res);
  if (!hasAtLeastRole(ctx.role, 'admin')) {
    return res.status(403).json({ error: 'Accès réservé aux admins.' });
  }

  if (req.method === 'GET') {
    const { data, error } = await admin
      .from('announcements')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('[admin/announcements] get error', error);
      return res
        .status(404)
        .json({ error: "Annonce introuvable ou inaccessible." });
    }
    return res.status(200).json(data);
  }

  if (req.method === 'PATCH') {
    const body = req.body as AnnouncementPayload;
    const updatePayload: Record<string, any> = {};

    if (typeof body.title === 'string') updatePayload.title = body.title.trim();
    if (typeof body.message === 'string')
      updatePayload.message = body.message.trim();
    if ('ctaLabel' in body)
      updatePayload.cta_label = body.ctaLabel?.trim() || null;
    if ('ctaUrl' in body) updatePayload.cta_url = body.ctaUrl?.trim() || null;
    if ('isActive' in body) updatePayload.is_active = !!body.isActive;
    if ('priority' in body)
      updatePayload.priority = Number.isFinite(body.priority)
        ? Number(body.priority)
        : 0;
    if ('startsAt' in body) updatePayload.starts_at = toISO(body.startsAt);
    if ('endsAt' in body) updatePayload.ends_at = toISO(body.endsAt);

    const { data, error } = await admin
      .from('announcements')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[admin/announcements] update error', error);
      return res
        .status(500)
        .json({ error: "Impossible de mettre à jour l'annonce." });
    }

    return res.status(200).json(data);
  }

  if (req.method === 'DELETE') {
    const { error } = await admin
      .from('announcements')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[admin/announcements] delete error', error);
      return res
        .status(500)
        .json({ error: "Impossible de supprimer l'annonce." });
    }

    return res.status(204).end();
  }

  res.setHeader('Allow', 'GET,PATCH,DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
}
