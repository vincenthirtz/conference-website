import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { contactSchema, formatZodError } from '@/utils/validation';

const RATE_LIMIT_MAX = 5;

async function isRateLimited(ip: string): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await supabaseAdmin
    .from('contact_submissions')
    .select('*', { count: 'exact', head: true })
    .eq('ip_address', ip)
    .gte('created_at', oneHourAgo);

  if (error) {
    console.error('[api/contact] rate limit check error', error);
    return false;
  }

  return (count ?? 0) >= RATE_LIMIT_MAX;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Service unavailable.' });
  }

  // Get IP for rate limiting and logging
  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown';

  // Rate limiting
  if (await isRateLimited(ip)) {
    return res.status(429).json({
      error: 'Trop de messages envoyés. Réessaie dans une heure.',
    });
  }

  // Validation
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: formatZodError(parsed.error) });
  }
  const { name, email, subject, message } = parsed.data;

  // Get user agent
  const userAgent = req.headers['user-agent'] || null;

  // Insert into database
  const { data, error } = await supabaseAdmin
    .from('contact_submissions')
    .insert({
      name,
      email,
      subject,
      message,
      status: 'new',
      ip_address: ip,
      user_agent: userAgent,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[api/contact] insert error', error);
    return res.status(500).json({ error: 'Failed to save message.' });
  }

  return res.status(201).json({
    ok: true,
    message: 'Message envoyé avec succès.',
    id: data.id,
  });
}
