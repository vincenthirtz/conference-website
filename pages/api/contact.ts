import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';

type ContactPayload = {
  name?: string;
  email?: string;
  subject?: string;
  message?: string;
};

// Simple rate limiting in memory (per IP)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 5; // Max 5 submissions
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // Per hour

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return false;
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return true;
  }

  record.count += 1;
  return false;
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
      .json({ error: 'Service indisponible.' });
  }

  // Get IP for rate limiting and logging
  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown';

  // Rate limiting
  if (isRateLimited(ip)) {
    return res.status(429).json({
      error: 'Trop de messages envoyés. Réessaie dans une heure.',
    });
  }

  const body = req.body as ContactPayload;

  // Validation
  if (!body.name?.trim()) {
    return res.status(400).json({ error: 'Le nom est obligatoire.' });
  }
  if (!body.email?.trim() || !isValidEmail(body.email)) {
    return res.status(400).json({ error: 'Email invalide.' });
  }
  if (!body.subject?.trim()) {
    return res.status(400).json({ error: 'Le sujet est obligatoire.' });
  }
  if (!body.message?.trim()) {
    return res.status(400).json({ error: 'Le message est obligatoire.' });
  }
  if (body.message.trim().length < 10) {
    return res.status(400).json({ error: 'Le message est trop court.' });
  }
  if (body.message.trim().length > 5000) {
    return res.status(400).json({ error: 'Le message est trop long (max 5000 caractères).' });
  }

  // Get user agent
  const userAgent = req.headers['user-agent'] || null;

  // Insert into database
  const { data, error } = await supabaseAdmin
    .from('contact_submissions')
    .insert({
      name: body.name.trim(),
      email: body.email.trim().toLowerCase(),
      subject: body.subject.trim(),
      message: body.message.trim(),
      status: 'new',
      ip_address: ip,
      user_agent: userAgent,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[api/contact] insert error', error);
    return res.status(500).json({ error: 'Impossible de sauvegarder le message.' });
  }

  return res.status(201).json({
    ok: true,
    message: 'Message envoyé avec succès.',
    id: data.id,
  });
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
