// pages/api/auth/forgot-password.ts
// Public endpoint that issues a password reset link via Supabase admin API
// and emails it through our branded Brevo template, in place of the native
// Supabase reset email.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { sendPasswordResetEmail } from '@/utils/email';
import { applyRateLimit } from '@/utils/rateLimit';

import { logger } from '../../../utils/logger';
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.SITE_URL ||
  'https://owwomenscup.fr';

const DEFAULT_REDIRECT_PATH = '/admin/reset-password';

const forgotPasswordSchema = z.object({
  email: z.string().email(),
  // Un redirectPath inconnu n'est PAS une erreur : on l'ignore et on retombe
  // sur le défaut (contrat historique). `.catch` neutralise la valeur invalide
  // sans rejeter toute la requête, tout en gardant l'allow-list de sécurité.
  redirectPath: z.enum(['/admin/reset-password']).optional().catch(undefined),
});

function buildRedirectUrl(path: string | undefined): string {
  return `${SITE_URL.replace(/\/$/, '')}${path ?? DEFAULT_REDIRECT_PATH}`;
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
    applyRateLimit(
      req,
      res,
      { max: 5, windowMs: 60 * 60_000 },
      'forgot-password'
    )
  ) {
    return;
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Service indisponible' });
  }

  const parsed = forgotPasswordSchema.safeParse(req.body || {});

  if (!parsed.success) {
    return res.status(400).json({ error: 'Email invalide' });
  }

  const cleanEmail = parsed.data.email.trim().toLowerCase();
  const redirectTo = buildRedirectUrl(parsed.data.redirectPath);

  // Generic success response — never disclose whether the account exists.
  const ok = {
    success: true,
    message:
      "Si un compte existe avec cet email, un lien de réinitialisation vient d'être envoyé.",
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
    logger.error('[api/auth/forgot-password] generateLink error:', error);
    return res.status(500).json({ error: 'Échec de la génération du lien' });
  }

  // On envoie un lien `token_hash` qui pointe DIRECTEMENT vers notre page de
  // reset, et non l'`action_link` (/auth/v1/verify, à usage unique) qui, en flux
  // PKCE, renvoie un ?code que le navigateur ne peut PAS échanger (le
  // code_verifier n'existe pas côté client : le lien est généré côté serveur).
  // Avec token_hash + verifyOtp côté page, aucune dépendance au code_verifier.
  // Cf. https://supabase.com/docs/guides/auth/auth-email-templates
  const tokenHash = data?.properties?.hashed_token;
  if (!tokenHash) {
    logger.error(
      '[api/auth/forgot-password] generateLink returned no hashed_token'
    );
    return res.status(500).json({ error: 'Échec de la génération du lien' });
  }
  const actionLink = `${redirectTo}?token_hash=${encodeURIComponent(
    tokenHash
  )}&type=recovery`;

  // On ATTEND l'envoi (plus de fire-and-forget) : si Brevo échoue (quota
  // 300/j atteint, erreur API…), l'ancien code renvoyait quand même un faux
  // « email envoyé ». On surface désormais l'échec pour que l'utilisateur
  // puisse réessayer au lieu d'attendre un email qui n'arrivera jamais.
  // Note anti-énumération : un compte inexistant repart en succès générique
  // plus haut (404 → ok) SANS tentative d'envoi ; seul un compte existant dont
  // l'envoi échoue voit ce 502 — compromis assumé (les échecs Brevo sont rares).
  let sendResult;
  try {
    sendResult = await sendPasswordResetEmail({ to: cleanEmail, actionLink });
  } catch (e) {
    sendResult = { success: false, error: (e as Error)?.message };
  }

  if (!sendResult?.success) {
    logger.error(
      '[api/auth/forgot-password] email send failed:',
      sendResult.error
    );
    return res.status(502).json({
      error:
        "L'email n'a pas pu être envoyé pour le moment. Réessayez dans quelques instants.",
    });
  }

  return res.status(200).json(ok);
}
