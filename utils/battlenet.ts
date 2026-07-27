// utils/battlenet.ts
//
// Client OAuth « maison » pour Battle.net (Blizzard) — vérification d'identité
// BattleTag (anti-smurf Tier 1). Modelé sur le flux Twitch maison
// (pages/api/twitch/oauth-callback.ts + exchange.ts) et le style fetchJson +
// AbortController de utils/gameHeroesSync.ts.
//
// DORMANT par défaut : sans BLIZZARD_CLIENT_ID + BLIZZARD_CLIENT_SECRET, la
// feature est désactivée et les endpoints répondent proprement (503) — voir
// isBattlenetConfigured().
//
// Régions : EU/US/KR partagent le même hôte oauth.battle.net ; la base est
// rendue configurable via BLIZZARD_OAUTH_BASE (défaut https://oauth.battle.net).
//
// Env :
//   BLIZZARD_CLIENT_ID       (requis pour activer)
//   BLIZZARD_CLIENT_SECRET   (requis pour activer ; sert aussi de clé HMAC du state)
//   BLIZZARD_REGION          (défaut 'eu' ; purement informatif, stocké sur le lien)
//   BLIZZARD_REDIRECT_URI    (doit correspondre à l'URI déclarée côté Blizzard)
//   BLIZZARD_OAUTH_BASE      (défaut 'https://oauth.battle.net')

import crypto from 'crypto';

const FETCH_TIMEOUT_MS = 15_000;
const DEFAULT_OAUTH_BASE = 'https://oauth.battle.net';

/* -----------------------------------------------------------
 * Config / env
 * ---------------------------------------------------------*/

export type BattlenetConfig = {
  clientId: string;
  clientSecret: string;
  region: string;
  redirectUri: string;
  oauthBase: string;
};

function oauthBase(): string {
  const raw = (process.env.BLIZZARD_OAUTH_BASE || DEFAULT_OAUTH_BASE).trim();
  // Strip a trailing slash so `${base}/authorize` never double-slashes.
  return raw.replace(/\/+$/, '') || DEFAULT_OAUTH_BASE;
}

export function battlenetRegion(): string {
  return (process.env.BLIZZARD_REGION || 'eu').trim().toLowerCase() || 'eu';
}

/**
 * Reads the Blizzard OAuth credentials from env. Returns null if either the
 * client id or secret is missing (feature dormant). Callers decide how to
 * surface that without leaking which var is absent.
 */
export function battlenetConfig(): BattlenetConfig | null {
  const clientId = process.env.BLIZZARD_CLIENT_ID?.trim();
  const clientSecret = process.env.BLIZZARD_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    region: battlenetRegion(),
    redirectUri: (process.env.BLIZZARD_REDIRECT_URI || '').trim(),
    oauthBase: oauthBase(),
  };
}

/** True only when CLIENT_ID + CLIENT_SECRET are both present. */
export function isBattlenetConfigured(): boolean {
  return battlenetConfig() !== null;
}

/* -----------------------------------------------------------
 * Authorize URL
 * ---------------------------------------------------------*/

/**
 * Builds the Blizzard authorize URL the browser is redirected to.
 * `state` is an opaque, signed value (see signBattlenetState) carrying the CSRF
 * nonce + the initiating auth user id + returnTo.
 * @throws if Battle.net is not configured (guard with isBattlenetConfigured()).
 */
export function buildAuthorizeUrl(state: string): string {
  const cfg = battlenetConfig();
  if (!cfg) throw new Error('Battle.net not configured');
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: 'openid',
    state,
  });
  return `${cfg.oauthBase}/authorize?${params.toString()}`;
}

/* -----------------------------------------------------------
 * Token exchange + userinfo
 * ---------------------------------------------------------*/

type BlizzardTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
};

export type BattlenetToken = {
  accessToken: string;
  tokenType: string | null;
  expiresIn: number | null;
};

type BlizzardUserinfoResponse = {
  sub?: string | number;
  id?: string | number;
  battletag?: string;
};

export type BattlenetUserinfo = {
  /** Stable Blizzard account id (`sub`/`id`) — the anti-smurf pivot. */
  battleNetId: string;
  /** The verified BattleTag (e.g. `Name#0000`). */
  battleTag: string;
  /** Region taken from config (userinfo doesn't return it). */
  region: string;
};

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  label: string
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      throw new Error(`${label}: HTTP ${res.status}`);
    }
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Exchanges an authorization `code` for an access token.
 * Uses HTTP Basic (client_id:client_secret) per Blizzard's token endpoint.
 * @throws Error(`... HTTP <status>`) on non-2xx or network/timeout.
 */
export async function exchangeCodeForToken(
  code: string
): Promise<BattlenetToken> {
  const cfg = battlenetConfig();
  if (!cfg) throw new Error('Battle.net not configured');

  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString(
    'base64'
  );
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: cfg.redirectUri,
  });

  const res = await fetchWithTimeout(
    `${cfg.oauthBase}/token`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    },
    'battlenet token'
  );

  const json = (await res.json()) as BlizzardTokenResponse;
  if (!json?.access_token) {
    throw new Error('battlenet token: missing access_token');
  }
  return {
    accessToken: json.access_token,
    tokenType: json.token_type ?? null,
    expiresIn: typeof json.expires_in === 'number' ? json.expires_in : null,
  };
}

/**
 * Fetches the verified BattleTag + stable account id from Blizzard's userinfo.
 * @throws Error(`... HTTP <status>`) on non-2xx, or if the payload is missing
 *         the required fields.
 */
export async function fetchBattlenetUserinfo(
  accessToken: string
): Promise<BattlenetUserinfo> {
  const cfg = battlenetConfig();
  if (!cfg) throw new Error('Battle.net not configured');

  const res = await fetchWithTimeout(
    `${cfg.oauthBase}/oauth/userinfo`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    },
    'battlenet userinfo'
  );

  const json = (await res.json()) as BlizzardUserinfoResponse;
  const rawId = json?.sub ?? json?.id;
  const battleNetId = rawId != null ? String(rawId).trim() : '';
  const battleTag = (json?.battletag ?? '').trim();
  if (!battleNetId) {
    throw new Error('battlenet userinfo: missing sub/id');
  }
  if (!battleTag) {
    throw new Error('battlenet userinfo: missing battletag');
  }
  return { battleNetId, battleTag, region: cfg.region };
}

/* -----------------------------------------------------------
 * Signed OAuth state (CSRF nonce + session binding), pure/testable
 * ---------------------------------------------------------*/

export type BattlenetStatePayload = {
  /** Random CSRF nonce, also mirrored in an httpOnly cookie (double-submit). */
  nonce: string;
  /** auth.users id that initiated the flow (session binding). */
  authUserId: string;
  /** Internal relative path to return to after the callback. */
  returnTo: string;
  /** Epoch ms the state was issued (TTL enforcement on verify). */
  issuedAt: number;
};

const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

/**
 * HMAC key for the state signature. Derived from the Blizzard client secret so
 * no extra env is needed (the feature is dormant without it anyway). Falls back
 * to CRON_SECRET for defense-in-depth in odd deploy states.
 */
function stateSecret(): string {
  const key =
    process.env.BLIZZARD_CLIENT_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    '';
  if (!key) throw new Error('Battle.net state secret unavailable');
  return key;
}

function b64urlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function b64urlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function hmac(body: string): string {
  return crypto
    .createHmac('sha256', stateSecret())
    .update(body)
    .digest('base64url');
}

/** Generates a fresh random CSRF nonce (hex). */
export function generateStateNonce(): string {
  return crypto.randomBytes(24).toString('hex');
}

/** Signs a state payload into an opaque `<body>.<sig>` string. */
export function signBattlenetState(
  payload: Omit<BattlenetStatePayload, 'issuedAt'> & { issuedAt?: number }
): string {
  const full: BattlenetStatePayload = {
    nonce: payload.nonce,
    authUserId: payload.authUserId,
    returnTo: payload.returnTo,
    issuedAt: payload.issuedAt ?? Date.now(),
  };
  const body = b64urlEncode(JSON.stringify(full));
  return `${body}.${hmac(body)}`;
}

/**
 * Verifies + decodes a state string. Returns null on any tampering, bad
 * signature, malformed payload, or expiry (> STATE_MAX_AGE_MS).
 */
export function verifyBattlenetState(
  state: string | undefined | null,
  opts: { maxAgeMs?: number; now?: number } = {}
): BattlenetStatePayload | null {
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

  let parsed: BattlenetStatePayload;
  try {
    parsed = JSON.parse(b64urlDecode(body)) as BattlenetStatePayload;
  } catch {
    return null;
  }
  if (
    !parsed ||
    typeof parsed.nonce !== 'string' ||
    typeof parsed.authUserId !== 'string' ||
    typeof parsed.returnTo !== 'string' ||
    typeof parsed.issuedAt !== 'number'
  ) {
    return null;
  }

  const now = opts.now ?? Date.now();
  const maxAge = opts.maxAgeMs ?? STATE_MAX_AGE_MS;
  if (now - parsed.issuedAt > maxAge || parsed.issuedAt > now + 60_000) {
    return null;
  }
  return parsed;
}

/* -----------------------------------------------------------
 * State du flux « connexion » (anonyme), distinct de la vérification
 * ---------------------------------------------------------*/

/**
 * State du flux de CONNEXION Battle.net. Contrairement au state de
 * vérification, il n'y a pas de session à lier (la joueuse n'est pas connectée)
 * — la protection CSRF repose donc uniquement sur le double-submit du nonce.
 *
 * `purpose: 'login'` est une séparation de domaine OBLIGATOIRE : les deux flux
 * partagent la même clé HMAC, donc sans ce discriminant un state de
 * vérification signé pourrait être rejoué sur le callback de connexion. La
 * réciproque est déjà couverte : `verifyBattlenetState` exige un `authUserId`,
 * absent d'un state de connexion.
 */
export type BattlenetLoginStatePayload = {
  nonce: string;
  purpose: 'login';
  /** Chemin interne où atterrir une fois la session établie. */
  returnTo: string;
  issuedAt: number;
};

/** Signe un state de connexion en `<body>.<sig>`. */
export function signBattlenetLoginState(payload: {
  nonce: string;
  returnTo: string;
  issuedAt?: number;
}): string {
  const full: BattlenetLoginStatePayload = {
    nonce: payload.nonce,
    purpose: 'login',
    returnTo: payload.returnTo,
    issuedAt: payload.issuedAt ?? Date.now(),
  };
  const body = b64urlEncode(JSON.stringify(full));
  return `${body}.${hmac(body)}`;
}

/**
 * Vérifie + décode un state de connexion. Renvoie null sur signature invalide,
 * payload malformé, expiration, ou `purpose` différent de 'login' (donc un
 * state de vérification est rejeté ici).
 */
export function verifyBattlenetLoginState(
  state: string | undefined | null,
  opts: { maxAgeMs?: number; now?: number } = {}
): BattlenetLoginStatePayload | null {
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

  let parsed: BattlenetLoginStatePayload;
  try {
    parsed = JSON.parse(b64urlDecode(body)) as BattlenetLoginStatePayload;
  } catch {
    return null;
  }
  if (
    !parsed ||
    parsed.purpose !== 'login' ||
    typeof parsed.nonce !== 'string' ||
    typeof parsed.returnTo !== 'string' ||
    typeof parsed.issuedAt !== 'number'
  ) {
    return null;
  }

  const now = opts.now ?? Date.now();
  const maxAge = opts.maxAgeMs ?? STATE_MAX_AGE_MS;
  if (now - parsed.issuedAt > maxAge || parsed.issuedAt > now + 60_000) {
    return null;
  }
  return parsed;
}
