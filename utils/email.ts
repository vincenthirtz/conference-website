// utils/email.ts
// Lightweight email utility using Resend API (no package needed).
// Free tier: 100 emails/day — https://resend.com
//
// Required env vars:
//   RESEND_API_KEY   – API key from resend.com dashboard
//   EMAIL_FROM       – Sender address (e.g. "Tournoi <noreply@yourdomain.com>")

const RESEND_API_URL = 'https://api.resend.com/emails';

type SendEmailOptions = {
  to: string;
  subject: string;
  html: string;
};

type SendEmailResult = {
  success: boolean;
  id?: string;
  error?: string;
};

/**
 * Send an email via Resend API.
 * Fails silently (logs error, returns { success: false }) so it never blocks
 * the main flow (user creation, team join, etc.).
 */
export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'Tournoi <onboarding@resend.dev>';

  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY not set — skipping email');
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
      }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const msg = data?.message || `HTTP ${res.status}`;
      console.error('[email] Resend error:', msg);
      return { success: false, error: msg };
    }

    return { success: true, id: data?.id };
  } catch (err: any) {
    console.error('[email] fetch error:', err);
    return { success: false, error: err?.message || 'Network error' };
  }
}

// ─── Email templates ───────────────────────────────────────────

/**
 * Welcome email sent when a user account is auto-created.
 */
export function sendWelcomeEmail(to: string, password: string): Promise<SendEmailResult> {
  return sendEmail({
    to,
    subject: 'Bienvenue — Votre compte a été créé',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #222;">
        <h2 style="color: #6d28d9;">Bienvenue !</h2>
        <p>Un compte a été créé pour vous sur notre plateforme de tournoi.</p>
        <p>Voici vos identifiants :</p>
        <table style="border-collapse: collapse; margin: 16px 0;">
          <tr>
            <td style="padding: 6px 12px; font-weight: bold;">Email</td>
            <td style="padding: 6px 12px;">${escapeHtml(to)}</td>
          </tr>
          <tr>
            <td style="padding: 6px 12px; font-weight: bold;">Mot de passe</td>
            <td style="padding: 6px 12px; font-family: monospace; background: #f3f4f6; border-radius: 4px;">${escapeHtml(password)}</td>
          </tr>
        </table>
        <p style="color: #b91c1c; font-size: 14px;">
          Nous vous recommandons de changer votre mot de passe dès votre première connexion.
        </p>
        <p style="margin-top: 24px; font-size: 13px; color: #888;">
          Cet email a été envoyé automatiquement. Si vous n'êtes pas à l'origine de cette inscription,
          vous pouvez ignorer ce message.
        </p>
      </div>
    `,
  });
}

/**
 * Notification sent when a user is added to a team.
 */
export function sendTeamJoinEmail(
  to: string,
  teamName: string,
  role: string
): Promise<SendEmailResult> {
  return sendEmail({
    to,
    subject: `Vous avez rejoint l'équipe ${teamName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #222;">
        <h2 style="color: #6d28d9;">Bienvenue dans ${escapeHtml(teamName)} !</h2>
        <p>Vous avez été ajouté(e) à l'équipe <strong>${escapeHtml(teamName)}</strong> en tant que <strong>${escapeHtml(role)}</strong>.</p>
        <p>Connectez-vous pour voir votre équipe et les prochains matchs.</p>
        <p style="margin-top: 24px; font-size: 13px; color: #888;">
          Si vous pensez que c'est une erreur, contactez l'organisateur du tournoi.
        </p>
      </div>
    `,
  });
}

/**
 * Notification sent when a user account is deleted.
 */
export function sendAccountDeletedEmail(to: string): Promise<SendEmailResult> {
  return sendEmail({
    to,
    subject: 'Votre compte a été supprimé',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #222;">
        <h2 style="color: #6d28d9;">Compte supprimé</h2>
        <p>Votre compte a été supprimé de notre plateforme de tournoi.</p>
        <p>Toutes vos données ont été retirées. Si vous étiez membre d'une équipe, vous en avez été retiré(e).</p>
        <p style="margin-top: 24px; font-size: 13px; color: #888;">
          Si vous pensez que c'est une erreur, contactez l'organisateur du tournoi.
        </p>
      </div>
    `,
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
