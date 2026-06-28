import { logger } from './logger';
// utils/email.ts
// Lightweight email utility using Brevo (ex-Sendinblue) transactional API.
// Free tier: 300 emails/day — https://brevo.com
//
// Required env vars:
//   BREVO_API_KEY    – API key from app.brevo.com > SMTP & API > API Keys
//   EMAIL_FROM       – Sender address (e.g. "noreply@yourdomain.com")
//   EMAIL_FROM_NAME  – Sender display name (e.g. "Tournoi") — optional

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

type SendEmailOptions = {
  to: string;
  subject: string;
  html: string;
  tags?: string[];
};

export type SendEmailResult = {
  success: boolean;
  id?: string;
  error?: string;
};

/**
 * Send an email via Brevo transactional API.
 * Fails silently (logs error, returns { success: false }) so it never blocks
 * the main flow (user creation, team join, etc.).
 */
export async function sendEmail(
  opts: SendEmailOptions
): Promise<SendEmailResult> {
  const apiKey = process.env.BREVO_API_KEY;
  const fromEmail = process.env.EMAIL_FROM || 'noreply@example.com';
  const fromName = process.env.EMAIL_FROM_NAME || 'Tournoi';

  if (!apiKey) {
    logger.warn('[email] BREVO_API_KEY not set — skipping email');
    return { success: false, error: 'BREVO_API_KEY not configured' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);

    const res = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: fromName, email: fromEmail },
        to: [{ email: opts.to }],
        subject: opts.subject,
        htmlContent: opts.html,
        ...(opts.tags?.length ? { tags: opts.tags } : {}),
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const msg = data?.message || `HTTP ${res.status}`;
      logger.error('[email] Brevo error:', msg, JSON.stringify(data));
      return { success: false, error: msg };
    }

    logger.info(
      '[email] sent to=%s subject=%s messageId=%s',
      opts.to,
      opts.subject,
      data?.messageId
    );
    return { success: true, id: data?.messageId };
  } catch (err: unknown) {
    logger.error('[email] fetch error:', err);
    return {
      success: false,
      error: (err as Error)?.message || 'Network error',
    };
  }
}

// ─── Email layout ─────────────────────────────────────────────

const SITE_URL = 'https://owwomenscup.fr';
const LOGO_URL = `${SITE_URL}/img/logos/2025-logo.png`;
const DISCORD_URL = 'https://discord.gg/gERSsjC3Vd';

function emailLayout(body: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#130d22;font-family:'Work Sans',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#130d22;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
        <!-- Logo -->
        <tr><td align="center" style="padding:0 0 24px;">
          <a href="${SITE_URL}" target="_blank">
            <img src="${LOGO_URL}" alt="OW Women's Cup" width="180" style="display:block;border:0;height:auto;" />
          </a>
        </td></tr>
        <!-- Card -->
        <tr><td style="background-color:#1b1130;border-radius:16px;border:1px solid rgba(255,255,255,0.1);padding:40px 32px;">
          ${body}
        </td></tr>
        <!-- Footer -->
        <tr><td align="center" style="padding:24px 0 0;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="padding:0 8px;"><a href="${SITE_URL}" style="color:#9081B0;font-size:12px;text-decoration:none;">Site web</a></td>
            <td style="color:#453763;font-size:12px;">|</td>
            <td style="padding:0 8px;"><a href="${DISCORD_URL}" style="color:#9081B0;font-size:12px;text-decoration:none;">Discord</a></td>
          </tr></table>
          <p style="margin:12px 0 0;font-size:11px;color:#675788;line-height:1.4;">
            OW Women's Cup &mdash; Cet email a &eacute;t&eacute; envoy&eacute; automatiquement.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function gradientBar(): string {
  return '<div style="height:3px;border-radius:2px;background:linear-gradient(90deg,#2dccfd,#ad20e2);margin:0 0 28px;"></div>';
}

function ctaButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 0;">
    <tr><td align="center" style="background:linear-gradient(225deg,#2dccfd 9%,#ad20e2 88%);border-radius:8px;">
      <a href="${href}" target="_blank" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;letter-spacing:0.02em;">${label}</a>
    </td></tr>
  </table>`;
}

// ─── Email templates ───────────────────────────────────────────

/**
 * Welcome email sent when a user account is auto-created.
 */
export function sendWelcomeEmail(
  to: string,
  password: string
): Promise<SendEmailResult> {
  return sendEmail({
    to,
    subject: 'Bienvenue — Votre compte a été créé',
    tags: ['welcome'],
    html: emailLayout(`
      ${gradientBar()}
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">Bienvenue !</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#C6BED9;line-height:1.6;">
        Un compte a &eacute;t&eacute; cr&eacute;&eacute; pour vous sur la plateforme OW Women's Cup.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:rgba(255,255,255,0.05);border-radius:10px;border:1px solid rgba(255,255,255,0.08);margin:0 0 24px;">
        <tr>
          <td style="padding:14px 20px;border-bottom:1px solid rgba(255,255,255,0.06);">
            <span style="font-size:12px;color:#9081B0;text-transform:uppercase;letter-spacing:0.1em;">Email</span><br/>
            <span style="font-size:15px;color:#ffffff;font-weight:500;">${escapeHtml(to)}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 20px;">
            <span style="font-size:12px;color:#9081B0;text-transform:uppercase;letter-spacing:0.1em;">Mot de passe</span><br/>
            <code style="font-size:15px;color:#2dccfd;font-family:'Fira Code',monospace;font-weight:500;">${escapeHtml(password)}</code>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 20px;font-size:13px;color:#e74694;line-height:1.5;background:rgba(231,70,148,0.08);border:1px solid rgba(231,70,148,0.15);border-radius:8px;padding:10px 14px;">
        Nous vous recommandons de changer votre mot de passe d&egrave;s votre premi&egrave;re connexion.
      </p>
      ${ctaButton(SITE_URL + '/login', 'Se connecter')}
    `),
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
    tags: ['team-join'],
    html: emailLayout(`
      ${gradientBar()}
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">Bienvenue dans ${escapeHtml(teamName)} !</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#C6BED9;line-height:1.6;">
        Vous avez &eacute;t&eacute; ajout&eacute;(e) &agrave; l'&eacute;quipe
        <strong style="color:#ffffff;">${escapeHtml(teamName)}</strong>
        en tant que <strong style="color:#2dccfd;">${escapeHtml(role)}</strong>.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:rgba(255,255,255,0.05);border-radius:10px;border:1px solid rgba(255,255,255,0.08);margin:0 0 24px;">
        <tr><td style="padding:16px 20px;">
          <p style="margin:0 0 12px;font-size:14px;color:#E8E2F4;line-height:1.5;">
            Connectez-vous pour voir votre &eacute;quipe et les prochains matchs.
          </p>
          <p style="margin:0;font-size:14px;color:#E8E2F4;line-height:1.5;">
            <strong style="color:#ff9c29;">Important&nbsp;:</strong> rejoignez le
            <a href="${DISCORD_URL}" style="color:#5865F2;text-decoration:underline;font-weight:600;">Discord du tournoi</a>
            pour rester inform&eacute;(e) des matchs et annonces.
          </p>
        </td></tr>
      </table>
      ${ctaButton(SITE_URL + '/login', 'Voir mon équipe')}
    `),
  });
}

/**
 * Notification sent when a user account is deleted.
 */
export function sendAccountDeletedEmail(to: string): Promise<SendEmailResult> {
  return sendEmail({
    to,
    subject: 'Votre compte a été supprimé',
    tags: ['account-deleted'],
    html: emailLayout(`
      ${gradientBar()}
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">Compte supprim&eacute;</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#C6BED9;line-height:1.6;">
        Votre compte a &eacute;t&eacute; supprim&eacute; de la plateforme OW Women's Cup.
      </p>
      <p style="margin:0 0 20px;font-size:15px;color:#C6BED9;line-height:1.6;">
        Toutes vos donn&eacute;es ont &eacute;t&eacute; retir&eacute;es. Si vous &eacute;tiez membre d'une &eacute;quipe, vous en avez &eacute;t&eacute; retir&eacute;(e).
      </p>
      <p style="margin:0;font-size:13px;color:#675788;line-height:1.5;">
        Si vous pensez que c'est une erreur, contactez l'organisateur du tournoi.
      </p>
    `),
  });
}

/**
 * Test email for verifying Brevo configuration.
 */
export function sendTestEmail(to: string): Promise<SendEmailResult> {
  return sendEmail({
    to,
    subject: "[Test] Email de test — OW Women's Cup",
    tags: ['test'],
    html: emailLayout(`
      ${gradientBar()}
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">Test email</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#C6BED9;line-height:1.6;">
        Si vous recevez cet email, la configuration Brevo fonctionne correctement.
      </p>
      <p style="margin:0;font-size:13px;color:#675788;">
        Envoy&eacute; le ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}
      </p>
    `),
  });
}

/**
 * Broadcast email for the IDAHOBIT live (Journée mondiale contre les LGBTphobies).
 * One-shot campaign — Twitch URL is hardcoded by design.
 */
export const IDAHOBIT_LIVE_SUBJECT =
  'Live Twitch — Journée internationale contre les LGBTphobies, dimanche 17 mai à 14h';

export function buildIdahobitLiveEmailHtml(
  displayLabel: string | null
): string {
  const twitchUrl = 'https://www.twitch.tv/womens_cup';
  const greeting = displayLabel ? `Hey ${escapeHtml(displayLabel)},` : 'Hey,';

  return emailLayout(`
    ${gradientBar()}
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">
      On allume la cha&icirc;ne pour le 17 mai
    </h1>
    <p style="margin:0 0 16px;font-size:15px;color:#C6BED9;line-height:1.6;">
      ${greeting}
    </p>
    <p style="margin:0 0 20px;font-size:15px;color:#C6BED9;line-height:1.6;">
      Dimanche <strong style="color:#2dccfd;">17 mai &agrave; 14h</strong>, on se retrouve en direct sur Twitch pour la
      <strong style="color:#ffffff;">Journ&eacute;e mondiale contre l&rsquo;homophobie, la transphobie et la biphobie</strong>.
    </p>
    <p style="margin:0 0 20px;font-size:15px;color:#C6BED9;line-height:1.6;">
      Au programme&nbsp;: des <strong style="color:#ffffff;">scrims qui tournent</strong> tout l&rsquo;apr&egrave;s-midi,
      plusieurs &eacute;quipes au passage, et un moment communautaire pour porter un message qui nous tient &agrave; c&oelig;ur
      &mdash; visibilit&eacute;, soutien, et z&eacute;ro tol&eacute;rance pour les LGBTphobies, sur et hors du jeu.
    </p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:rgba(255,255,255,0.05);border-radius:10px;border:1px solid rgba(255,255,255,0.08);margin:0 0 24px;">
      <tr>
        <td style="padding:14px 20px;border-bottom:1px solid rgba(255,255,255,0.06);">
          <span style="font-size:12px;color:#9081B0;text-transform:uppercase;letter-spacing:0.1em;">Date</span><br/>
          <span style="font-size:15px;color:#ffffff;font-weight:500;">Dimanche 17 mai 2026 &mdash; 14h (Paris)</span>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 20px;border-bottom:1px solid rgba(255,255,255,0.06);">
          <span style="font-size:12px;color:#9081B0;text-transform:uppercase;letter-spacing:0.1em;">Format</span><br/>
          <span style="font-size:15px;color:#ffffff;font-weight:500;">Scrims en rotation, live comment&eacute;</span>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 20px;">
          <span style="font-size:12px;color:#9081B0;text-transform:uppercase;letter-spacing:0.1em;">Comment participer</span><br/>
          <span style="font-size:15px;color:#C6BED9;font-weight:400;">Rejoins le Discord pour t&rsquo;ins&eacute;rer dans une rotation, ou viens chiller dans le chat Twitch.</span>
        </td>
      </tr>
    </table>
    ${ctaButton(twitchUrl, 'Voir le live sur Twitch')}
    <p style="margin:24px 0 0;font-size:13px;color:#9081B0;line-height:1.5;text-align:center;">
      Pas dispo dimanche&nbsp;? Un VOD sera dispo apr&egrave;s le live sur la cha&icirc;ne.
    </p>
  `);
}

export function sendIdahobitLiveEmail(
  to: string,
  displayLabel: string | null
): Promise<SendEmailResult> {
  return sendEmail({
    to,
    subject: IDAHOBIT_LIVE_SUBJECT,
    tags: ['idahobit-live-2026'],
    html: buildIdahobitLiveEmailHtml(displayLabel),
  });
}

// ─── Generic campaign template ─────────────────────────────────
//
// Corps STRUCTURÉ d'une campagne créée depuis l'admin (table email_campaigns).
// Pas de HTML libre : on assemble heading + greeting + paragraphes + CTA +
// footer dans le wrapper de marque (emailLayout). Tout le texte fourni par
// l'admin est échappé (escapeHtml) — y compris l'URL du CTA (contexte attribut).

export type CampaignBody = {
  heading: string;
  greetingEnabled?: boolean;
  bodyParagraphs: string[];
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  footerNote?: string | null;
};

export function buildCampaignEmailHtml(
  body: CampaignBody,
  displayLabel: string | null
): string {
  const greeting =
    body.greetingEnabled !== false && displayLabel
      ? `<p style="margin:0 0 16px;font-size:15px;color:#C6BED9;line-height:1.6;">Hey ${escapeHtml(displayLabel)},</p>`
      : '';

  const paragraphs = (body.bodyParagraphs ?? [])
    .filter((p) => typeof p === 'string' && p.trim())
    .map(
      (p) =>
        `<p style="margin:0 0 20px;font-size:15px;color:#C6BED9;line-height:1.6;">${escapeHtml(p)}</p>`
    )
    .join('');

  const cta =
    body.ctaUrl && body.ctaUrl.trim() && body.ctaLabel && body.ctaLabel.trim()
      ? ctaButton(escapeHtml(body.ctaUrl.trim()), escapeHtml(body.ctaLabel.trim()))
      : '';

  const footer =
    body.footerNote && body.footerNote.trim()
      ? `<p style="margin:24px 0 0;font-size:13px;color:#9081B0;line-height:1.5;text-align:center;">${escapeHtml(body.footerNote.trim())}</p>`
      : '';

  return emailLayout(`
    ${gradientBar()}
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">${escapeHtml(body.heading)}</h1>
    ${greeting}
    ${paragraphs}
    ${cta}
    ${footer}
  `);
}

export function sendCampaignEmail(opts: {
  to: string;
  subject: string;
  body: CampaignBody;
  displayLabel: string | null;
  tags?: string[];
}): Promise<SendEmailResult> {
  return sendEmail({
    to: opts.to,
    subject: opts.subject,
    tags: opts.tags ?? ['campaign'],
    html: buildCampaignEmailHtml(opts.body, opts.displayLabel),
  });
}

/**
 * Notification sent to team captains when a tournament is open or approaching.
 */
export function sendTournamentNotificationEmail(
  to: string,
  tournamentName: string,
  startDate: string | null,
  tournamentSlug: string | null
): Promise<SendEmailResult> {
  const dateStr = startDate
    ? new Date(startDate).toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  const tournamentUrl = tournamentSlug
    ? `${SITE_URL}/tournaments/${tournamentSlug}`
    : `${SITE_URL}/tournaments`;

  return sendEmail({
    to,
    subject: `Tournoi ouvert : ${tournamentName}`,
    tags: ['tournament-notification'],
    html: emailLayout(`
      ${gradientBar()}
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">Nouveau tournoi !</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#C6BED9;line-height:1.6;">
        Le tournoi <strong style="color:#ffffff;">${escapeHtml(tournamentName)}</strong>
        est maintenant ouvert aux inscriptions${dateStr ? ` et d&eacute;butera le <strong style="color:#2dccfd;">${escapeHtml(dateStr)}</strong>` : ''}.
      </p>
      <p style="margin:0 0 24px;font-size:15px;color:#C6BED9;line-height:1.6;">
        En tant que capitaine d'&eacute;quipe, vous pouvez inscrire votre &eacute;quipe
        d&egrave;s maintenant. Les places sont limit&eacute;es !
      </p>
      ${ctaButton(tournamentUrl, 'Voir le tournoi')}
    `),
  });
}

/**
 * Match check-in email sent to the captain ~1h before kickoff.
 * Contains the unique check-in URL and a deadline.
 */
export function sendMatchCheckinEmail(opts: {
  to: string;
  teamName: string;
  opponentName: string;
  scheduledAt: string;
  checkinUrl: string;
  tournamentName: string;
}): Promise<SendEmailResult> {
  const dateStr = (() => {
    try {
      return new Date(opts.scheduledAt).toLocaleString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Paris',
      });
    } catch {
      return opts.scheduledAt;
    }
  })();

  return sendEmail({
    to: opts.to,
    subject: `Check-in : ${opts.teamName} vs ${opts.opponentName}`,
    tags: ['match-checkin'],
    html: emailLayout(`
      ${gradientBar()}
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">Check-in requis</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#C6BED9;line-height:1.6;">
        Votre prochain match d&eacute;bute dans environ <strong style="color:#2dccfd;">1 heure</strong>.
        Confirmez votre pr&eacute;sence pour &eacute;viter le forfait automatique.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:rgba(255,255,255,0.05);border-radius:10px;border:1px solid rgba(255,255,255,0.08);margin:0 0 24px;">
        <tr>
          <td style="padding:14px 20px;border-bottom:1px solid rgba(255,255,255,0.06);">
            <span style="font-size:12px;color:#9081B0;text-transform:uppercase;letter-spacing:0.1em;">Tournoi</span><br/>
            <span style="font-size:15px;color:#ffffff;font-weight:500;">${escapeHtml(opts.tournamentName)}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 20px;border-bottom:1px solid rgba(255,255,255,0.06);">
            <span style="font-size:12px;color:#9081B0;text-transform:uppercase;letter-spacing:0.1em;">Match</span><br/>
            <span style="font-size:15px;color:#ffffff;font-weight:500;">${escapeHtml(opts.teamName)} vs ${escapeHtml(opts.opponentName)}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 20px;">
            <span style="font-size:12px;color:#9081B0;text-transform:uppercase;letter-spacing:0.1em;">D&eacute;but pr&eacute;vu</span><br/>
            <span style="font-size:15px;color:#2dccfd;font-weight:500;">${escapeHtml(dateStr)}</span>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 8px;font-size:13px;color:#e74694;line-height:1.5;background:rgba(231,70,148,0.08);border:1px solid rgba(231,70,148,0.15);border-radius:8px;padding:10px 14px;">
        Sans check-in avant le d&eacute;but du match, votre &eacute;quipe sera d&eacute;clar&eacute;e forfait automatiquement.
      </p>
      ${ctaButton(opts.checkinUrl, 'Confirmer ma présence')}
      <p style="margin:24px 0 0;font-size:12px;color:#675788;line-height:1.5;text-align:center;">
        Lien direct&nbsp;: <a href="${opts.checkinUrl}" style="color:#9081B0;">${escapeHtml(opts.checkinUrl)}</a>
      </p>
    `),
  });
}

/**
 * Urgent check-in reminder sent at T-30 / T-15 to captains who have not yet
 * checked in. Uses the SAME check-in link/token as `sendMatchCheckinEmail`.
 * Critical-transactional — sent unconditionally (a missed reminder = forfeit),
 * no opt-out consulted, consistent with the T-60 check-in email.
 */
export function sendCheckinReminderEmail(opts: {
  to: string;
  teamName: string;
  opponentName: string;
  scheduledAt: string;
  checkinUrl: string;
  tournamentName: string;
  minutesBeforeKickoff: number;
}): Promise<SendEmailResult> {
  const dateStr = (() => {
    try {
      return new Date(opts.scheduledAt).toLocaleString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Paris',
      });
    } catch {
      return opts.scheduledAt;
    }
  })();

  const mins = opts.minutesBeforeKickoff;

  return sendEmail({
    to: opts.to,
    subject: `⏰ Check-in dans ${mins} min — ${opts.teamName} vs ${opts.opponentName}`,
    tags: ['match-checkin-reminder'],
    html: emailLayout(`
      ${gradientBar()}
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">Dernier rappel — check-in</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#C6BED9;line-height:1.6;">
        Votre match commence dans <strong style="color:#ff9c29;">${mins} minutes</strong>
        et votre &eacute;quipe n&apos;a <strong style="color:#e74694;">toujours pas confirm&eacute; sa pr&eacute;sence</strong>.
        Confirmez maintenant pour &eacute;viter le forfait automatique.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:rgba(255,255,255,0.05);border-radius:10px;border:1px solid rgba(255,255,255,0.08);margin:0 0 24px;">
        <tr>
          <td style="padding:14px 20px;border-bottom:1px solid rgba(255,255,255,0.06);">
            <span style="font-size:12px;color:#9081B0;text-transform:uppercase;letter-spacing:0.1em;">Tournoi</span><br/>
            <span style="font-size:15px;color:#ffffff;font-weight:500;">${escapeHtml(opts.tournamentName)}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 20px;border-bottom:1px solid rgba(255,255,255,0.06);">
            <span style="font-size:12px;color:#9081B0;text-transform:uppercase;letter-spacing:0.1em;">Match</span><br/>
            <span style="font-size:15px;color:#ffffff;font-weight:500;">${escapeHtml(opts.teamName)} vs ${escapeHtml(opts.opponentName)}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 20px;">
            <span style="font-size:12px;color:#9081B0;text-transform:uppercase;letter-spacing:0.1em;">D&eacute;but pr&eacute;vu</span><br/>
            <span style="font-size:15px;color:#2dccfd;font-weight:500;">${escapeHtml(dateStr)}</span>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 8px;font-size:13px;color:#e74694;line-height:1.5;background:rgba(231,70,148,0.08);border:1px solid rgba(231,70,148,0.15);border-radius:8px;padding:10px 14px;">
        Sans check-in avant le d&eacute;but du match, votre &eacute;quipe sera d&eacute;clar&eacute;e <strong>forfait</strong> automatiquement.
      </p>
      ${ctaButton(opts.checkinUrl, 'Confirmer ma présence maintenant')}
      <p style="margin:24px 0 0;font-size:12px;color:#675788;line-height:1.5;text-align:center;">
        Lien direct&nbsp;: <a href="${opts.checkinUrl}" style="color:#9081B0;">${escapeHtml(opts.checkinUrl)}</a>
      </p>
    `),
  });
}

/**
 * Confirmation email sent to a support ticket reporter (only when not anonymous).
 */
export function sendSupportConfirmationEmail(opts: {
  to: string;
  ticketId: string;
  category: 'dispute' | 'behavior' | 'technical' | 'other';
  severity: 'low' | 'medium' | 'high';
  subject: string | null;
}): Promise<SendEmailResult> {
  const categoryLabel: Record<typeof opts.category, string> = {
    dispute: 'Litige / Contestation',
    behavior: 'Comportement / Safety',
    technical: 'Problème technique',
    other: 'Autre',
  };
  const severityLabel: Record<typeof opts.severity, string> = {
    low: 'Basse',
    medium: 'Moyenne',
    high: 'Haute',
  };

  return sendEmail({
    to: opts.to,
    subject: "Signalement reçu — OW Women's Cup",
    tags: ['support-confirmation'],
    html: emailLayout(`
      ${gradientBar()}
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">Signalement reçu</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#C6BED9;line-height:1.6;">
        Merci pour votre signalement. Notre &eacute;quipe de mod&eacute;ration l&apos;examine.
        ${opts.severity === 'high' ? 'Compte tenu de la s&eacute;v&eacute;rit&eacute; haute, nous le traitons en priorit&eacute;.' : ''}
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:rgba(255,255,255,0.05);border-radius:10px;border:1px solid rgba(255,255,255,0.08);margin:0 0 24px;">
        <tr>
          <td style="padding:14px 20px;border-bottom:1px solid rgba(255,255,255,0.06);">
            <span style="font-size:12px;color:#9081B0;text-transform:uppercase;letter-spacing:0.1em;">R&eacute;f&eacute;rence ticket</span><br/>
            <code style="font-size:13px;color:#2dccfd;font-family:'Fira Code',monospace;">${escapeHtml(opts.ticketId.slice(0, 8))}</code>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 20px;border-bottom:1px solid rgba(255,255,255,0.06);">
            <span style="font-size:12px;color:#9081B0;text-transform:uppercase;letter-spacing:0.1em;">Cat&eacute;gorie</span><br/>
            <span style="font-size:15px;color:#ffffff;font-weight:500;">${escapeHtml(categoryLabel[opts.category])}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:14px 20px;${opts.subject ? 'border-bottom:1px solid rgba(255,255,255,0.06);' : ''}">
            <span style="font-size:12px;color:#9081B0;text-transform:uppercase;letter-spacing:0.1em;">S&eacute;v&eacute;rit&eacute;</span><br/>
            <span style="font-size:15px;color:${opts.severity === 'high' ? '#ef4444' : opts.severity === 'medium' ? '#f59e0b' : '#3b82f6'};font-weight:500;">${escapeHtml(severityLabel[opts.severity])}</span>
          </td>
        </tr>
        ${opts.subject ? `<tr><td style="padding:14px 20px;"><span style="font-size:12px;color:#9081B0;text-transform:uppercase;letter-spacing:0.1em;">Sujet</span><br/><span style="font-size:15px;color:#ffffff;">${escapeHtml(opts.subject)}</span></td></tr>` : ''}
      </table>
      <p style="margin:0;font-size:13px;color:#675788;line-height:1.5;">
        Vous serez recontact&eacute;(e) par mail si l&apos;&eacute;quipe a besoin d&apos;informations compl&eacute;mentaires.
        Pour toute urgence, contactez la mod&eacute;ration directement sur Discord.
      </p>
    `),
  });
}

/**
 * Default staff inbox for inbound notifications (contact, partnerships,
 * anonymous / HIGH severity support tickets). Override via STAFF_NOTIFY_EMAIL.
 */
const STAFF_NOTIFY_EMAIL =
  process.env.STAFF_NOTIFY_EMAIL || 'owwomenscup@gmail.com';

function detailsTable(
  rows: { label: string; value: string; isCode?: boolean }[]
): string {
  const last = rows.length - 1;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:rgba(255,255,255,0.05);border-radius:10px;border:1px solid rgba(255,255,255,0.08);margin:0 0 24px;">
    ${rows
      .map((r, i) => {
        const border =
          i < last ? 'border-bottom:1px solid rgba(255,255,255,0.06);' : '';
        const valueHtml = r.isCode
          ? `<code style="font-size:14px;color:#2dccfd;font-family:'Fira Code',monospace;">${escapeHtml(r.value)}</code>`
          : `<span style="font-size:15px;color:#ffffff;font-weight:500;">${escapeHtml(r.value)}</span>`;
        return `<tr><td style="padding:14px 20px;${border}"><span style="font-size:12px;color:#9081B0;text-transform:uppercase;letter-spacing:0.1em;">${escapeHtml(r.label)}</span><br/>${valueHtml}</td></tr>`;
      })
      .join('')}
  </table>`;
}

function preformattedBlock(text: string): string {
  return `<div style="white-space:pre-wrap;background-color:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px 18px;color:#E8E2F4;font-size:14px;line-height:1.6;margin:0 0 24px;">${escapeHtml(text)}</div>`;
}

const SUPPORT_CATEGORY_LABELS: Record<
  'dispute' | 'behavior' | 'technical' | 'other',
  string
> = {
  dispute: 'Litige / Contestation',
  behavior: 'Comportement / Safety',
  technical: 'Problème technique',
  other: 'Autre',
};

const SUPPORT_SEVERITY_LABELS: Record<'low' | 'medium' | 'high', string> = {
  low: 'Basse',
  medium: 'Moyenne',
  high: 'Haute',
};

const PARTNERSHIP_CATEGORY_LABELS: Record<
  'super' | 'major' | 'cultural' | 'other',
  string
> = {
  super: 'Super partenaire',
  major: 'Partenaire majeur',
  cultural: 'Partenaire culturel',
  other: 'Autre',
};

/**
 * Notification sent to staff when the public contact form is submitted.
 */
export function sendContactStaffEmail(opts: {
  name: string;
  email: string;
  subject: string;
  message: string;
}): Promise<SendEmailResult> {
  return sendEmail({
    to: STAFF_NOTIFY_EMAIL,
    subject: `[Contact] ${opts.subject} — ${opts.name}`,
    tags: ['contact-staff'],
    html: emailLayout(`
      ${gradientBar()}
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">Nouveau message de contact</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#C6BED9;line-height:1.6;">
        Un visiteur a soumis le formulaire de contact public.
      </p>
      ${detailsTable([
        { label: 'Nom', value: opts.name },
        { label: 'Email', value: opts.email },
        { label: 'Sujet', value: opts.subject },
      ])}
      <p style="margin:0 0 8px;font-size:12px;color:#9081B0;text-transform:uppercase;letter-spacing:0.1em;">Message</p>
      ${preformattedBlock(opts.message)}
      ${ctaButton('mailto:' + opts.email, 'Répondre par email')}
    `),
  });
}

/**
 * Notification sent to staff when a public partnership request is submitted.
 */
export function sendPartnershipStaffEmail(opts: {
  companyName: string;
  contactName: string;
  email: string;
  phone?: string | null;
  website?: string | null;
  category: 'super' | 'major' | 'cultural' | 'other';
  budgetRange?: string | null;
  message: string;
}): Promise<SendEmailResult> {
  const rows: { label: string; value: string }[] = [
    { label: 'Entreprise', value: opts.companyName },
    { label: 'Contact', value: opts.contactName },
    { label: 'Email', value: opts.email },
  ];
  if (opts.phone) rows.push({ label: 'Téléphone', value: opts.phone });
  if (opts.website) rows.push({ label: 'Site web', value: opts.website });
  rows.push({
    label: 'Catégorie',
    value: PARTNERSHIP_CATEGORY_LABELS[opts.category],
  });
  if (opts.budgetRange) rows.push({ label: 'Budget', value: opts.budgetRange });

  return sendEmail({
    to: STAFF_NOTIFY_EMAIL,
    subject: `[Partenariat] ${opts.companyName} — ${PARTNERSHIP_CATEGORY_LABELS[opts.category]}`,
    tags: ['partnership-staff'],
    html: emailLayout(`
      ${gradientBar()}
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">Nouvelle demande de partenariat</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#C6BED9;line-height:1.6;">
        Une entreprise a soumis une demande via le formulaire public.
      </p>
      ${detailsTable(rows)}
      <p style="margin:0 0 8px;font-size:12px;color:#9081B0;text-transform:uppercase;letter-spacing:0.1em;">Message</p>
      ${preformattedBlock(opts.message)}
      ${ctaButton('mailto:' + opts.email, 'Répondre par email')}
    `),
  });
}

/**
 * Confirmation sent to the partnership requester right after submission.
 */
export function sendPartnershipConfirmationEmail(opts: {
  to: string;
  contactName: string;
  companyName: string;
}): Promise<SendEmailResult> {
  return sendEmail({
    to: opts.to,
    subject: "Demande de partenariat reçue — OW Women's Cup",
    tags: ['partnership-confirmation'],
    html: emailLayout(`
      ${gradientBar()}
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">Merci ${escapeHtml(opts.contactName)} !</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#C6BED9;line-height:1.6;">
        Nous avons bien reçu votre demande de partenariat pour
        <strong style="color:#ffffff;">${escapeHtml(opts.companyName)}</strong>.
      </p>
      <p style="margin:0 0 24px;font-size:15px;color:#C6BED9;line-height:1.6;">
        Notre équipe l&apos;examine et reviendra vers vous sous quelques jours.
        Pour toute question urgente, vous pouvez répondre directement à cet email.
      </p>
      ${ctaButton(SITE_URL + '/partenaires', 'Voir nos partenaires')}
    `),
  });
}

/**
 * Password reset email — sent in place of the native Supabase reset email
 * so we control the design. The action link is generated server-side via
 * `supabaseAdmin.auth.admin.generateLink({ type: 'recovery' })`.
 */
export function sendPasswordResetEmail(opts: {
  to: string;
  actionLink: string;
}): Promise<SendEmailResult> {
  return sendEmail({
    to: opts.to,
    subject: "Réinitialisation de votre mot de passe — OW Women's Cup",
    tags: ['password-reset'],
    html: emailLayout(`
      ${gradientBar()}
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">Réinitialiser votre mot de passe</h1>
      <p style="margin:0 0 16px;font-size:15px;color:#C6BED9;line-height:1.6;">
        Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le bouton
        ci-dessous pour définir un nouveau mot de passe.
      </p>
      <p style="margin:0 0 20px;font-size:13px;color:#e74694;line-height:1.5;background:rgba(231,70,148,0.08);border:1px solid rgba(231,70,148,0.15);border-radius:8px;padding:10px 14px;">
        Ce lien est valable une heure. Si vous n&apos;êtes pas à l&apos;origine de cette
        demande, ignorez simplement cet email.
      </p>
      ${ctaButton(opts.actionLink, 'Définir un nouveau mot de passe')}
      <p style="margin:24px 0 0;font-size:12px;color:#675788;line-height:1.5;text-align:center;">
        Lien direct&nbsp;: <a href="${opts.actionLink}" style="color:#9081B0;word-break:break-all;">${escapeHtml(opts.actionLink)}</a>
      </p>
    `),
  });
}

/**
 * Staff notification for support tickets that bypass the reporter
 * confirmation flow: anonymous tickets and HIGH-severity tickets.
 */
export function sendSupportStaffNotificationEmail(opts: {
  ticketId: string;
  category: 'dispute' | 'behavior' | 'technical' | 'other';
  severity: 'low' | 'medium' | 'high';
  isAnonymous: boolean;
  reporterName: string | null;
  reporterEmail: string | null;
  subject: string | null;
  message: string;
  adminUrl: string;
}): Promise<SendEmailResult> {
  const ref = opts.ticketId.slice(0, 8);
  const isUrgent = opts.severity === 'high';

  const rows: { label: string; value: string; isCode?: boolean }[] = [
    { label: 'Référence', value: ref, isCode: true },
    { label: 'Catégorie', value: SUPPORT_CATEGORY_LABELS[opts.category] },
    { label: 'Sévérité', value: SUPPORT_SEVERITY_LABELS[opts.severity] },
    {
      label: 'Auteur',
      value: opts.isAnonymous
        ? 'Anonyme'
        : `${opts.reporterName || '—'}${opts.reporterEmail ? ` · ${opts.reporterEmail}` : ''}`,
    },
  ];
  if (opts.subject) rows.push({ label: 'Sujet', value: opts.subject });

  const subjectPrefix = isUrgent ? '[URGENT] ' : '[Signalement] ';
  const subjectTitle = opts.subject || SUPPORT_CATEGORY_LABELS[opts.category];

  return sendEmail({
    to: STAFF_NOTIFY_EMAIL,
    subject: `${subjectPrefix}${subjectTitle} (${ref})`,
    tags: ['support-staff', isUrgent ? 'support-urgent' : 'support-anonymous'],
    html: emailLayout(`
      ${gradientBar()}
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">
        ${isUrgent ? 'Signalement urgent' : 'Signalement anonyme'}
      </h1>
      <p style="margin:0 0 24px;font-size:15px;color:#C6BED9;line-height:1.6;">
        ${
          isUrgent
            ? 'Un signalement de sévérité <strong style="color:#ef4444;">haute</strong> vient d&apos;être déposé. Merci de le traiter en priorité.'
            : 'Un signalement anonyme vient d&apos;être déposé.'
        }
      </p>
      ${detailsTable(rows)}
      <p style="margin:0 0 8px;font-size:12px;color:#9081B0;text-transform:uppercase;letter-spacing:0.1em;">Message</p>
      ${preformattedBlock(opts.message)}
      ${ctaButton(opts.adminUrl, "Ouvrir dans l'admin")}
    `),
  });
}

/**
 * Generic digest email — one message aggregating several notification items
 * (the email counterpart of a Web Push fan-out). Each item is rendered as a
 * heading + body + CTA link. A footer "se désabonner" link is appended.
 *
 * Used by the email dispatcher (utils/emailDispatcher.ts) to batch a user's
 * pending events into a single message, staying well under Brevo's daily cap.
 * FR copy, consistent with the other branded templates.
 */
export function sendDigestEmail(opts: {
  to: string;
  items: Array<{ heading: string; body: string; url: string }>;
  unsubscribeUrl: string;
}): Promise<SendEmailResult> {
  const count = opts.items.length;
  const subject =
    count === 1
      ? `Notification — ${opts.items[0].heading}`
      : `${count} notifications — OW Women's Cup`;

  const intro =
    count === 1
      ? 'Vous avez une nouvelle notification&nbsp;:'
      : `Vous avez <strong style="color:#ffffff;">${count}</strong> nouvelles notifications&nbsp;:`;

  const itemsHtml = opts.items
    .map((item) => {
      // Les URLs rendues sont relatives ('/player', ...) ; on préfixe SITE_URL
      // si besoin pour produire un lien cliquable absolu dans l'email.
      const href = item.url.startsWith('http')
        ? item.url
        : `${SITE_URL}${item.url.startsWith('/') ? '' : '/'}${item.url}`;
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:rgba(255,255,255,0.05);border-radius:10px;border:1px solid rgba(255,255,255,0.08);margin:0 0 16px;">
        <tr><td style="padding:18px 20px;">
          <p style="margin:0 0 6px;font-size:16px;font-weight:600;color:#ffffff;line-height:1.4;">${escapeHtml(item.heading)}</p>
          <p style="margin:0 0 12px;font-size:14px;color:#C6BED9;line-height:1.6;">${escapeHtml(item.body)}</p>
          <a href="${href}" target="_blank" style="display:inline-block;font-size:13px;font-weight:600;color:#2dccfd;text-decoration:none;">Ouvrir &rarr;</a>
        </td></tr>
      </table>`;
    })
    .join('');

  return sendEmail({
    to: opts.to,
    subject,
    tags: ['digest'],
    html: emailLayout(`
      ${gradientBar()}
      <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">Vos notifications</h1>
      <p style="margin:0 0 24px;font-size:15px;color:#C6BED9;line-height:1.6;">
        ${intro}
      </p>
      ${itemsHtml}
      ${ctaButton(SITE_URL + '/player', 'Ouvrir mon espace')}
      <p style="margin:28px 0 0;font-size:12px;color:#675788;line-height:1.5;text-align:center;">
        Vous recevez cet email car vous avez activé les notifications par email.
        <a href="${opts.unsubscribeUrl}" style="color:#9081B0;text-decoration:underline;">Se désabonner</a>.
      </p>
    `),
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
