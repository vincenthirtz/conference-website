import type { NextApiRequest, NextApiResponse } from 'next';
import { contactSchema, formatZodError } from '@/utils/validation';
import { sendEmail } from '@/utils/email';

const CONTACT_EMAIL = 'owwomenscup@gmail.com';

// Simple in-memory rate limiting (resets on server restart)
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(ip) ?? [];
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  rateLimitMap.set(ip, recent);
  return recent.length >= RATE_LIMIT_MAX;
}

function recordRequest(ip: string) {
  const timestamps = rateLimitMap.get(ip) ?? [];
  timestamps.push(Date.now());
  rateLimitMap.set(ip, timestamps);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get IP for rate limiting
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

  // Validation
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: formatZodError(parsed.error) });
  }
  const { name, email, subject, message } = parsed.data;

  // Send email via Resend
  const result = await sendEmail({
    to: CONTACT_EMAIL,
    subject: `[Contact] ${subject} — ${name}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #222;">
        <h2 style="color: #6d28d9;">Nouveau message de contact</h2>
        <table style="border-collapse: collapse; margin: 16px 0; width: 100%;">
          <tr>
            <td style="padding: 8px 12px; font-weight: bold; vertical-align: top;">Nom</td>
            <td style="padding: 8px 12px;">${escapeHtml(name)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; font-weight: bold; vertical-align: top;">Email</td>
            <td style="padding: 8px 12px;"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; font-weight: bold; vertical-align: top;">Sujet</td>
            <td style="padding: 8px 12px;">${escapeHtml(subject)}</td>
          </tr>
        </table>
        <div style="margin: 16px 0; padding: 16px; background: #f3f4f6; border-radius: 8px; white-space: pre-wrap;">${escapeHtml(message)}</div>
        <p style="margin-top: 24px; font-size: 13px; color: #888;">
          Répondre directement à <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>
        </p>
      </div>
    `,
  });

  if (!result.success) {
    console.error('[api/contact] email send error:', result.error);
    return res.status(500).json({ error: "Erreur lors de l'envoi du message." });
  }

  recordRequest(ip);

  return res.status(201).json({
    ok: true,
    message: 'Message envoyé avec succès.',
  });
}
