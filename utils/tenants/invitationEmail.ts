// utils/tenants/invitationEmail.ts
//
// L'email d'invitation à rejoindre un espace.
//
// Volontairement séparé de `utils/emailOnboard.ts` : celui-ci parle au nom de la
// PLATEFORME (« votre demande de bot »), celui-là parle au nom d'un ESPACE, avec
// son compte d'envoi. Mélanger les deux mènerait à des emails signés du mauvais
// expéditeur — la faute la plus banale d'un produit multi-organisation.
//
// Le gabarit reste minimal et en tableau : ce sont des clients mail, pas des
// navigateurs.

const TEXT = '#C6BED9';
const ACCENT = '#7bc96a';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Libellés de rôle côté invité : « caster » ne veut rien dire hors du code. */
const ROLE_LABELS: Record<string, string> = {
  owner: 'propriétaire',
  admin: 'administration',
  caster: 'cast et régie',
};

export function invitationUrl(token: string, siteUrl?: string): string {
  const base = (
    siteUrl ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    'https://owwomenscup.fr'
  ).replace(/\/$/, '');
  return `${base}/invitation/${encodeURIComponent(token)}`;
}

export function buildInvitationEmail(opts: {
  tenantName: string;
  role: string;
  token: string;
  expiresAt: string;
  siteUrl?: string;
}): { subject: string; html: string } {
  const url = invitationUrl(opts.token, opts.siteUrl);
  const name = escapeHtml(opts.tenantName);
  const roleLabel = ROLE_LABELS[opts.role] ?? opts.role;

  // Une date lisible, pas un ISO : l'invité n'est pas une machine. Une date
  // invalide vaut mieux tue que rendue « Invalid Date ».
  const d = new Date(opts.expiresAt);
  const expiry = Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });

  return {
    subject: `Rejoindre ${opts.tenantName}`,
    html: `
<div style="background:#14101f;padding:32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#1c1730;border-radius:12px;padding:28px;">
    <tr><td>
      <h1 style="margin:0 0 16px;font-size:21px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">
        Vous êtes invité·e à rejoindre ${name}
      </h1>
      <p style="margin:0 0 16px;font-size:15px;color:${TEXT};line-height:1.6;">
        On vous donne un accès <strong style="color:#ffffff;">${escapeHtml(roleLabel)}</strong>
        à l'espace ${name}. En acceptant, vous pourrez gérer ce qui s'y passe :
        équipes, tournois, matchs.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;">
        <tr><td align="center" style="background:${ACCENT};border-radius:8px;">
          <a href="${url}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:600;color:#14101f;text-decoration:none;">
            Accepter l'invitation
          </a>
        </td></tr>
      </table>
      ${
        expiry
          ? `<p style="margin:0 0 12px;font-size:13px;color:#8E85A6;line-height:1.5;">
               Ce lien est valable jusqu'au ${escapeHtml(expiry)}.
             </p>`
          : ''
      }
      <p style="margin:0;font-size:12px;color:#675788;line-height:1.5;">
        Lien direct : <a href="${url}" style="color:#9081B0;word-break:break-all;">${escapeHtml(url)}</a>
      </p>
      <p style="margin:16px 0 0;font-size:12px;color:#675788;line-height:1.5;">
        Si vous ne connaissez pas ${name}, ignorez cet email : le lien expirera
        tout seul et aucun accès ne sera créé.
      </p>
    </td></tr>
  </table>
</div>`.trim(),
  };
}
