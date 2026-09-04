// utils/tenants/botInvite.ts
//
// Le lien d'invitation du bot — celui d'un ESPACE, pas celui de la plateforme.
//
// Jusqu'ici l'URL était la même pour tout le monde : on l'ouvrait, on choisissait
// un serveur sur Discord, puis il fallait revenir, rafraîchir la file d'attente,
// reconnaître le bon serveur parmi ceux qui attendent, et le rattacher au bon
// espace. Trois occasions de se tromper — de serveur, d'espace, ou d'avoir vu
// l'attente purgée entre-temps — pour un geste qui se pense comme un seul.
//
// Le lien peut porter l'espace. Discord sait renvoyer l'utilisateur chez nous
// après l'installation (`response_type=code` + `redirect_uri`), avec le
// `guild_id` choisi et un `state` opaque qu'on a signé. Le rattachement se fait
// alors tout seul, sur l'espace voulu, par la personne qui vient d'installer.
//
// DEUX MODES, et l'écran doit dire lequel :
//
//   - `direct` : `DISCORD_OAUTH_REDIRECT_URI` est configurée ET déclarée dans
//     le portail développeur Discord. Le retour est automatique.
//   - `manual` : elle ne l'est pas. On rend le lien générique d'avant, et le
//     rattachement reste manuel. Rien ne casse — mais rien ne s'améliore, et
//     mieux vaut le dire que laisser croire à une panne.
//
// Le `state` est signé (HMAC) et daté : sans ça, n'importe qui pourrait forger
// un retour et rattacher un serveur à un espace qui n'est pas le sien.

import crypto from 'crypto';

/** Fenêtre de validité du state : le temps d'installer un bot, pas plus. */
export const INVITE_STATE_MAX_AGE_MS = 30 * 60 * 1000;

export type InviteMode = 'direct' | 'manual';

export type BotInviteStatePayload = {
  tenantId: string;
  /** Qui a demandé le lien — tracé au retour, et jamais élargi. */
  staffId: string;
  nonce: string;
  issuedAt: number;
};

/**
 * Clé HMAC du state. Dérivée du secret client Discord (aucune variable
 * supplémentaire : sans lui, il n'y a de toute façon pas d'invitation), avec
 * `CRON_SECRET` en défense en profondeur.
 */
function stateSecret(): string {
  const key =
    process.env.DISCORD_CLIENT_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    '';
  if (!key) throw new Error('Bot invite state secret unavailable');
  return key;
}

const b64urlEncode = (v: string) =>
  Buffer.from(v, 'utf8').toString('base64url');
const b64urlDecode = (v: string) =>
  Buffer.from(v, 'base64url').toString('utf8');

function hmac(body: string): string {
  return crypto
    .createHmac('sha256', stateSecret())
    .update(body)
    .digest('base64url');
}

export function signInviteState(
  payload: Omit<BotInviteStatePayload, 'nonce' | 'issuedAt'> & {
    nonce?: string;
    issuedAt?: number;
  }
): string {
  const full: BotInviteStatePayload = {
    tenantId: payload.tenantId,
    staffId: payload.staffId,
    nonce: payload.nonce ?? crypto.randomBytes(16).toString('hex'),
    issuedAt: payload.issuedAt ?? Date.now(),
  };
  const body = b64urlEncode(JSON.stringify(full));
  return `${body}.${hmac(body)}`;
}

/**
 * Vérifie et décode un state. `null` sur toute altération, signature invalide,
 * payload malformé ou expiration — jamais d'exception : un retour douteux se
 * refuse, il ne fait pas tomber la route.
 */
export function verifyInviteState(
  state: string | undefined | null,
  opts: { maxAgeMs?: number; now?: number } = {}
): BotInviteStatePayload | null {
  if (!state || typeof state !== 'string') return null;
  const dot = state.indexOf('.');
  if (dot <= 0) return null;
  const body = state.slice(0, dot);
  const sig = state.slice(dot + 1);

  let expected: string;
  try {
    expected = hmac(body);
  } catch {
    return null;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let parsed: BotInviteStatePayload;
  try {
    parsed = JSON.parse(b64urlDecode(body)) as BotInviteStatePayload;
  } catch {
    return null;
  }
  if (
    !parsed ||
    typeof parsed.tenantId !== 'string' ||
    typeof parsed.staffId !== 'string' ||
    typeof parsed.nonce !== 'string' ||
    typeof parsed.issuedAt !== 'number'
  ) {
    return null;
  }

  const now = opts.now ?? Date.now();
  const maxAge = opts.maxAgeMs ?? INVITE_STATE_MAX_AGE_MS;
  // Un state daté du futur est un state forgé, ou une horloge folle : refus.
  if (now - parsed.issuedAt > maxAge || parsed.issuedAt > now + 60_000) {
    return null;
  }
  return parsed;
}

/** L'URI de retour, si l'opérateur l'a configurée ET déclarée chez Discord. */
export function inviteRedirectUri(): string | null {
  const raw = process.env.DISCORD_OAUTH_REDIRECT_URI?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    // Discord refuse tout ce qui n'est pas https (hors localhost de dev).
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') return null;
    return url.toString();
  } catch {
    return null;
  }
}

export type BotInviteLink = {
  url: string | null;
  mode: InviteMode;
  /** Renseigné en mode direct : c'est ce qui rattache au retour. */
  state: string | null;
};

/**
 * Construit le lien d'invitation.
 *
 * `guildId` pré-sélectionne un serveur (ré-invitation d'un serveur connu) : la
 * liste déroulante de Discord est alors verrouillée dessus, ce qui supprime le
 * dernier endroit où l'on pouvait se tromper de serveur.
 */
export function buildTenantBotInvite(opts: {
  tenantId: string;
  staffId: string;
  guildId?: string | null;
}): BotInviteLink {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) return { url: null, mode: 'manual', state: null };

  const permissions = process.env.DISCORD_BOT_PERMISSIONS ?? '1099780063312';
  const params = new URLSearchParams({
    client_id: clientId,
    scope: 'bot applications.commands',
    permissions,
  });

  if (opts.guildId) {
    params.set('guild_id', opts.guildId);
    // Sans ça, le serveur pré-sélectionné reste modifiable dans la liste.
    params.set('disable_guild_select', 'true');
  }

  const redirectUri = inviteRedirectUri();
  if (!redirectUri) {
    return {
      url: `https://discord.com/oauth2/authorize?${params.toString()}`,
      mode: 'manual',
      state: null,
    };
  }

  let state: string;
  try {
    state = signInviteState({
      tenantId: opts.tenantId,
      staffId: opts.staffId,
    });
  } catch {
    // Pas de secret de signature : on ne fabrique PAS un lien de retour qu'on
    // serait incapable de vérifier.
    return {
      url: `https://discord.com/oauth2/authorize?${params.toString()}`,
      mode: 'manual',
      state: null,
    };
  }

  params.set('response_type', 'code');
  params.set('redirect_uri', redirectUri);
  params.set('state', state);

  return {
    url: `https://discord.com/oauth2/authorize?${params.toString()}`,
    mode: 'direct',
    state,
  };
}
