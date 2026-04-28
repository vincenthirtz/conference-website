// pages/api/auth/forgot-password.ts
// Public endpoint that issues a password reset link via Supabase admin API
// and emails it through our branded Brevo template, in place of the native
// Supabase reset email.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { sendPasswordResetEmail } from '@/utils/email';
import { applyRateLimit } from '@/utils/rateLimit';

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.SITE_URL ||
  'https://owwomenscup.fr';

const DEFAULT_REDIRECT_PATH = '/admin/reset-password';

const ALLOWED_REDIRECT_PATHS = new Set([
  '/admin/reset-password',
]);

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function buildRedirectUrl(rawPath: unknown): string {
  const path =
    typeof rawPath === 'string' && ALLOWED_REDIRECT_PATHS.has(rawPath)
      ? rawPath
      : DEFAULT_REDIRECT_PATH;
  return `${SITE_URL.replace(/\/$/, '')}${path}`;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (
    applyRateLimit(req, res, { max: 5, windowMs: 60 * 60_000 }, 'forgot-password')
  ) {
    return;
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Service indisponible' });
  }

  const { email, redirectPath } = req.body || {};

  if (typeof email !== 'string' || !isValidEmail(email.trim())) {
    return res.status(400).json({ error: 'Email invalide' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const redirectTo = buildRedirectUrl(redirectPath);

  // Generic success response — never disclose whether the account exists.
  const ok = {
    success: true,
    message:
      'Si un compte existe avec cet email, un lien de réinitialisation vient d\'être envoyé.',
  };

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email: cleanEmail,
    options: { redirectTo },
  });

  if (error) {
    // Treat "user not found" as a no-op success to avoid account enumeration.
    const status = (error as { status?: number }).status;
    if (status === 404 || /not.?found/i.test(error.message)) {
      return res.status(200).json(ok);
    }
    console.error('[api/auth/forgot-password] generateLink error:', error);
    return res.status(500).json({ error: 'Échec de la génération du lien' });
  }

  const actionLink = data?.properties?.action_link;
  if (!actionLink) {
    console.error(
      '[api/auth/forgot-password] generateLink returned no action_link'
    );
    return res.status(500).json({ error: 'Échec de la génération du lien' });
  }

  void sendPasswordResetEmail({ to: cleanEmail, actionLink }).catch((e) =>
    console.error('[api/auth/forgot-password] email send error:', e)
  );

  return res.status(200).json(ok);
}
