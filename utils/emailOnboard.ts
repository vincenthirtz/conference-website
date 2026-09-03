// utils/emailOnboard.ts
//
// Email templates dedicated to the self-service tenant onboarding flow.
// Kept out of `utils/email.ts` to avoid bloating that file — the layout/
// gradient helpers are duplicated locally and intentionally simple. If we
// ship a 4th onboarding email, factorise then.

import { sendEmail, type SendEmailResult } from './email';

const PRIMARY_COLOR = '#7bc96a';
const SECONDARY_COLOR = '#b24be0';
const TEXT_COLOR = '#C6BED9';
const BG_COLOR = '#130d22';
const CARD_BG = '#1b1130';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function layout(body: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:${BG_COLOR};font-family:'Work Sans',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BG_COLOR};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
        <tr><td style="background-color:${CARD_BG};border-radius:16px;border:1px solid rgba(255,255,255,0.1);padding:40px 32px;">
          <div style="height:3px;border-radius:2px;background:linear-gradient(90deg,${PRIMARY_COLOR},${SECONDARY_COLOR});margin:0 0 28px;"></div>
          ${body}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function ctaButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 0;">
    <tr><td align="center" style="background:linear-gradient(225deg,${PRIMARY_COLOR} 9%,${SECONDARY_COLOR} 88%);border-radius:8px;">
      <a href="${href}" target="_blank" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;letter-spacing:0.02em;">${escapeHtml(label)}</a>
    </td></tr>
  </table>`;
}

/**
 * Email #1: sent right after a user submits the tenant-request form.
 * Contains a one-time verification link.
 */
export function sendOnboardVerifyEmail(opts: {
  to: string;
  displayName: string | null;
  verifyUrl: string;
  requestedSlug: string;
  requestedName: string;
}): Promise<SendEmailResult> {
  const hello = opts.displayName
    ? `Hello ${escapeHtml(opts.displayName)},`
    : 'Hello,';

  return sendEmail({
    to: opts.to,
    subject: 'Confirmez votre demande de bot Conférence',
    tags: ['onboard-verify'],
    html: layout(`
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">Confirmez votre adresse</h1>
      <p style="margin:0 0 16px;font-size:15px;color:${TEXT_COLOR};line-height:1.6;">
        ${hello}
      </p>
      <p style="margin:0 0 16px;font-size:15px;color:${TEXT_COLOR};line-height:1.6;">
        Nous avons reçu votre demande de bot Discord pour l'organisation
        <strong style="color:#ffffff;">${escapeHtml(opts.requestedName)}</strong>
        (slug <code style="color:${PRIMARY_COLOR};font-family:'Fira Code',monospace;">${escapeHtml(opts.requestedSlug)}</code>).
      </p>
      <p style="margin:0 0 16px;font-size:15px;color:${TEXT_COLOR};line-height:1.6;">
        Cliquez sur le bouton ci-dessous pour confirmer votre adresse et passer à l'étape suivante
        (invitation du bot sur votre serveur Discord).
      </p>
      ${ctaButton(opts.verifyUrl, 'Confirmer ma demande')}
      <p style="margin:24px 0 0;font-size:12px;color:#675788;line-height:1.5;text-align:center;">
        Lien direct&nbsp;: <a href="${opts.verifyUrl}" style="color:#9081B0;word-break:break-all;">${escapeHtml(opts.verifyUrl)}</a>
      </p>
      <p style="margin:16px 0 0;font-size:12px;color:#675788;line-height:1.5;">
        Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email — le lien expirera et la demande sera abandonnée.
      </p>
    `),
  });
}

/**
 * Email #2: sent after the bot has been invited and the tenant has been
 * auto-created. Contains the single-use reveal URL where the operator picks
 * up their freshly minted bot API key + webhook secret.
 */
export function sendOnboardSuccessEmail(opts: {
  to: string;
  displayName: string | null;
  tenantName: string;
  tenantSlug: string;
  revealUrl: string;
  /** Racine du site, pour construire les liens du back-office. */
  siteUrl: string;
  /** Fin de l'essai gratuit ouvert à la création (ISO). */
  trialEndsAt: string | null;
}): Promise<SendEmailResult> {
  const settingsUrl = `${opts.siteUrl}/admin/site-settings?tab=email-sender`;
  const discordSettingsUrl = `${opts.siteUrl}/admin/site-settings?tab=discord`;
  const trialDate = (() => {
    if (!opts.trialEndsAt) return null;
    const d = new Date(opts.trialEndsAt);
    // `toLocaleDateString` ne jette pas sur une date invalide : elle rend
    // « Invalid Date ». Sans ce contrôle, l'email annoncerait sereinement un
    // essai « jusqu'au Invalid Date ».
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  })();
  const hello = opts.displayName
    ? `Hello ${escapeHtml(opts.displayName)},`
    : 'Hello,';

  return sendEmail({
    to: opts.to,
    subject: 'Votre bot Conférence est prêt 🎉',
    tags: ['onboard-success'],
    html: layout(`
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">Votre bot est prêt</h1>
      <p style="margin:0 0 16px;font-size:15px;color:${TEXT_COLOR};line-height:1.6;">
        ${hello}
      </p>
      <p style="margin:0 0 16px;font-size:15px;color:${TEXT_COLOR};line-height:1.6;">
        Le tenant <strong style="color:#ffffff;">${escapeHtml(opts.tenantName)}</strong>
        (<code style="color:${PRIMARY_COLOR};font-family:'Fira Code',monospace;">${escapeHtml(opts.tenantSlug)}</code>)
        a été créé et le bot Discord est désormais opérationnel sur votre serveur.
      </p>
      <p style="margin:0 0 16px;font-size:14px;color:#ffc1d0;line-height:1.5;background:rgba(231,70,148,0.08);border:1px solid rgba(231,70,148,0.15);border-radius:8px;padding:12px 14px;">
        <strong>Action requise :</strong> récupérez vos deux secrets bot (clé API + secret webhook) via le lien ci-dessous.
        Ce lien est <strong>consultable une seule fois</strong> et expire dans <strong>1 heure</strong>.
      </p>
      ${ctaButton(opts.revealUrl, 'Voir mes secrets bot')}
      <p style="margin:24px 0 0;font-size:12px;color:#675788;line-height:1.5;text-align:center;">
        Lien direct&nbsp;: <a href="${opts.revealUrl}" style="color:#9081B0;word-break:break-all;">${escapeHtml(opts.revealUrl)}</a>
      </p>
      <p style="margin:16px 0 0;font-size:12px;color:#675788;line-height:1.5;">
        Stockez ces secrets dans un coffre (1Password, Bitwarden, etc.) — ils ne pourront pas être affichés à nouveau.
        Vous pourrez les faire tourner via l'admin si besoin.
      </p>

      <div style="height:1px;background:rgba(255,255,255,0.1);margin:28px 0 24px;"></div>

      <h2 style="margin:0 0 12px;font-size:16px;font-weight:600;color:#ffffff;">Deux réglages à faire dans votre espace</h2>

      <p style="margin:0 0 8px;font-size:14px;color:${TEXT_COLOR};line-height:1.6;">
        <strong style="color:#ffffff;">1. Vos salons et vos rôles Discord.</strong>
        Tant qu'un salon n'est pas renseigné, la fonctionnalité correspondante
        reste simplement en veille — le bot ne publie rien au hasard.
        <a href="${discordSettingsUrl}" style="color:${PRIMARY_COLOR};">Réglages Discord</a>
      </p>

      <p style="margin:0 0 16px;font-size:14px;color:${TEXT_COLOR};line-height:1.6;">
        <strong style="color:#ffffff;">2. Votre compte d'envoi d'emails.</strong>
        Votre espace expédie depuis <em>son</em> compte Brevo : l'adresse
        d'expédition, le quota et la réputation vous appartiennent. Tant qu'il
        n'est pas renseigné, <strong>aucun email ne part</strong> — ni
        invitation d'équipe, ni rappel de check-in. Le bot, lui, fonctionne
        normalement.
        <a href="${settingsUrl}" style="color:${PRIMARY_COLOR};">Configurer l'envoi d'emails</a>
      </p>

      ${
        trialDate
          ? `<p style="margin:0;font-size:13px;color:#ffd9a0;line-height:1.5;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.15);border-radius:8px;padding:12px 14px;">
        Votre espace démarre avec un <strong>essai gratuit jusqu'au ${escapeHtml(trialDate)}</strong>.
        À cette date, il repasse sur le palier gratuit et le bot cesse de répondre — vous serez relancé avant.
      </p>`
          : ''
      }
    `),
  });
}
