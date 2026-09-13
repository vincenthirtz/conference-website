// utils/twitchIdentity.ts
//
// OAuth Twitch CÔTÉ JOUEUSE — prouver « ce compte Twitch est le mien ».
//
// POURQUOI CE MODULE N'EST PAS `utils/twitchBroadcaster.ts`. Celui-là fait
// consentir une CHAÎNE à douze scopes d'écriture (prédictions, modération,
// clips, chat) et conserve ses jetons chiffrés pour agir en son nom. Ici, on ne
// veut rien faire au nom de personne : on veut savoir QUI vient de cliquer.
// Mélanger les deux flux ferait demander à une spectatrice les droits de
// modération d'une chaîne pour recevoir une carte — un consentement
// disproportionné, et un jeton d'écriture à garder pour rien.
//
// AUCUN SCOPE DEMANDÉ, ET C'EST LE POINT. Twitch rend l'identité de la
// personne connectée (`GET /helix/users` sans `id`) avec un simple jeton
// utilisateur sans scope. On ne demande donc RIEN : ni email, ni abonnements,
// ni chat. Le consentement affiché à la spectatrice se réduit à « ce site
// veut connaître votre nom d'utilisateur », ce qui est exactement vrai.
//
// LE JETON N'EST JAMAIS CONSERVÉ. On l'échange, on lit l'identité, on l'oublie.
// Rien à chiffrer, rien à rafraîchir, rien à révoquer côté serveur — contrairement
// au flux chaîne, qui a besoin de `TWITCH_TOKEN_ENC_KEY`. Moins on garde, moins
// on a à protéger.
//
// UNE URL DE RETOUR DÉDIÉE. `TWITCH_REDIRECT_URI` sert déjà le flux chaîne.
// Twitch accepte plusieurs URLs de retour par application, et les distinguer
// évite qu'un code destiné à un flux atterrisse dans l'autre — où le state,
// signé différemment, le ferait échouer sans que rien n'explique pourquoi.
//
// Le state reprend la forme éprouvée de `utils/battlenet.ts` : `<corps>.<sig>`
// HMAC, portant le nonce CSRF, le compte initiateur et le chemin de retour.

import crypto from 'crypto';

import { clientCreds } from '@/utils/twitch';
import { logger } from '@/utils/logger';

const AUTHORIZE_ENDPOINT = 'https://id.twitch.tv/oauth2/authorize';
const TOKEN_ENDPOINT = 'https://id.twitch.tv/oauth2/token';
const HELIX_USERS = 'https://api.twitch.tv/helix/users';

/** Un state plus vieux que ça est refusé, même bien signé. */
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

export type TwitchIdentityConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

/**
 * Configuration du flux joueuse, ou `null` si la fonctionnalité est dormante.
 *
 * `TWITCH_PLAYER_REDIRECT_URI` est DISTINCTE de `TWITCH_REDIRECT_URI` (flux
 * chaîne) — cf. l'en-tête. Les identifiants d'application, eux, sont partagés :
 * c'est la même application Twitch.
 */
export function twitchIdentityConfig(): TwitchIdentityConfig | null {
  const creds = clientCreds();
  const redirectUri = process.env.TWITCH_PLAYER_REDIRECT_URI?.trim();
  if (!creds || !redirectUri) return null;
  return {
    clientId: creds.id,
    clientSecret: creds.secret,
    redirectUri,
  };
}

/** Vrai seulement si CLIENT_ID + CLIENT_SECRET + PLAYER_REDIRECT_URI sont là. */
export function isTwitchIdentityConfigured(): boolean {
  return twitchIdentityConfig() !== null;
}

/**
 * L'URL d'autorisation vers laquelle le navigateur est redirigé.
 *
 * `scope` est VOLONTAIREMENT vide : cf. l'en-tête. `force_verify=true` oblige
 * Twitch à redemander le consentement à chaque fois — sans quoi une personne
 * déjà connectée à Twitch sur un poste partagé lierait le compte de la
 * précédente sans s'en apercevoir.
 *
 * @throws si la fonctionnalité est dormante (garder avec `isTwitchIdentityConfigured`).
 */
export function buildTwitchIdentityAuthorizeUrl(state: string): string {
  const cfg = twitchIdentityConfig();
  if (!cfg) throw new Error('Twitch identity OAuth not configured');
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: '',
    state,
    force_verify: 'true',
  });
  return `${AUTHORIZE_ENDPOINT}?${params.toString()}`;
}

/* -----------------------------------------------------------
 * Échange du code + lecture de l'identité
 * ---------------------------------------------------------*/

export type TwitchIdentity = {
  /** Identifiant numérique STABLE. C'est lui qui fait foi. */
  twitchUserId: string;
  /** Pseudo affichable — se renomme, ne décide de rien. */
  login: string;
  displayName: string;
};

/**
 * Échange le code contre un jeton utilisateur, puis lit l'identité.
 *
 * Rend `null` sur tout échec, en journalisant sans jamais écrire le code ni le
 * jeton : ce sont des secrets de courte vie, mais des secrets.
 */
export async function exchangeCodeForIdentity(
  code: string
): Promise<TwitchIdentity | null> {
  const cfg = twitchIdentityConfig();
  if (!cfg) return null;

  let accessToken: string;
  try {
    const body = new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: cfg.redirectUri,
    });
    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      logger.error('[twitchIdentity] échange refusé: HTTP %s', res.status);
      return null;
    }
    const json = (await res.json()) as { access_token?: string };
    if (!json.access_token) {
      logger.error('[twitchIdentity] échange sans access_token');
      return null;
    }
    accessToken = json.access_token;
  } catch (err) {
    logger.error('[twitchIdentity] échange impossible', err);
    return null;
  }

  try {
    // Sans paramètre `id` ni `login`, Helix rend l'utilisateur DU JETON : c'est
    // précisément la question posée, et la seule réponse qu'on puisse prouver.
    const res = await fetch(HELIX_USERS, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Client-Id': cfg.clientId,
      },
    });
    if (!res.ok) {
      logger.error('[twitchIdentity] helix/users: HTTP %s', res.status);
      return null;
    }
    const json = (await res.json()) as {
      data?: Array<{ id?: string; login?: string; display_name?: string }>;
    };
    const row = json.data?.[0];
    if (!row?.id) {
      logger.error('[twitchIdentity] helix/users sans identifiant');
      return null;
    }
    return {
      twitchUserId: String(row.id),
      login: row.login ?? '',
      displayName: row.display_name || row.login || '',
    };
  } catch (err) {
    logger.error('[twitchIdentity] helix/users impossible', err);
    return null;
  }
}

/* -----------------------------------------------------------
 * State signé (CSRF)
 * ---------------------------------------------------------*/

export type TwitchIdentityStatePayload = {
  nonce: string;
  authUserId: string;
  returnTo: string;
  issuedAt: number;
};

function stateSecret(): string {
  const secret =
    process.env.TWITCH_CLIENT_SECRET?.trim() ||
    process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secret) throw new Error('No secret available to sign Twitch state');
  return secret;
}

function b64urlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function b64urlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function hmac(body: string): string {
  return crypto.createHmac('sha256', stateSecret()).update(body).digest('hex');
}

export function generateStateNonce(): string {
  return crypto.randomBytes(24).toString('hex');
}

/** Signe un payload de state en `<corps>.<sig>` opaque. */
export function signTwitchIdentityState(
  payload: Omit<TwitchIdentityStatePayload, 'issuedAt'> & { issuedAt?: number }
): string {
  const full: TwitchIdentityStatePayload = {
    nonce: payload.nonce,
    authUserId: payload.authUserId,
    returnTo: payload.returnTo,
    issuedAt: payload.issuedAt ?? Date.now(),
  };
  const body = b64urlEncode(JSON.stringify(full));
  return `${body}.${hmac(body)}`;
}

/**
 * Vérifie + décode un state. Rend `null` sur altération, signature invalide,
 * payload malformé ou expiration.
 *
 * Comparaison en TEMPS CONSTANT : une comparaison naïve laisse fuir, par son
 * temps d'exécution, le préfixe correct d'une signature forgée.
 */
export function verifyTwitchIdentityState(
  state: string | undefined | null,
  opts: { maxAgeMs?: number; now?: number } = {}
): TwitchIdentityStatePayload | null {
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

  let parsed: TwitchIdentityStatePayload;
  try {
    parsed = JSON.parse(b64urlDecode(body)) as TwitchIdentityStatePayload;
  } catch {
    return null;
  }
  if (
    typeof parsed?.nonce !== 'string' ||
    typeof parsed?.authUserId !== 'string' ||
    typeof parsed?.returnTo !== 'string' ||
    typeof parsed?.issuedAt !== 'number'
  ) {
    return null;
  }

  const now = opts.now ?? Date.now();
  const maxAge = opts.maxAgeMs ?? STATE_MAX_AGE_MS;
  if (now - parsed.issuedAt > maxAge) return null;
  // Un state daté du futur est aberrant : horloge trafiquée ou rejeu construit.
  if (parsed.issuedAt - now > 60_000) return null;

  return parsed;
}
