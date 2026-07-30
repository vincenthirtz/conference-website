// utils/twitchBroadcaster.ts
//
// Socle OAuth « broadcaster » Twitch + accès Helix ÉCRIVANT depuis la régie.
//
// L'app token (client_credentials) de utils/twitch.ts est read-only. Pour lancer
// des actions écrivantes sur la chaîne (predictions en V1, puis modération /
// points de chaîne / message chat), il faut un token OAuth du BROADCASTER, avec
// ses scopes, persisté (twitch_broadcaster_connections) et rafraîchi côté
// serveur. Les tokens sont CHIFFRÉS au repos (utils/crypto.ts, AES-256-GCM) :
// jamais en clair en base, jamais renvoyés à un client.
//
// Ce module est modelé sur utils/battlenet.ts :
//   - config()/isConfigured() : feature dormante sans TWITCH_CLIENT_ID/SECRET +
//     TWITCH_REDIRECT_URI (les endpoints répondent 503).
//   - state signé HMAC (signState/verifyState) : CSRF + binding session, TTL 10 min.
//   - exchange/refresh calqués sur pages/api/twitch/exchange.ts (POST id.twitch.tv).
//
// Env :
//   TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET  (via clientCreds())
//   TWITCH_REDIRECT_URI  (URL de NOTRE callback broadcaster ; IDENTIQUE à
//                         l'authorize ET à l'échange — Twitch l'exige)
//   TWITCH_TOKEN_ENC_KEY (clé de chiffrement, lue par utils/crypto.ts)

import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clientCreds } from './twitch';
import { encryptSecret, decryptSecret } from './crypto';

const FETCH_TIMEOUT_MS = 15_000;
const TOKEN_ENDPOINT = 'https://id.twitch.tv/oauth2/token';
const AUTHORIZE_ENDPOINT = 'https://id.twitch.tv/oauth2/authorize';
const HELIX_BASE = 'https://api.twitch.tv/helix';

/**
 * Union des scopes broadcaster demandés au consentement. V1 n'utilise que
 * `channel:manage:predictions` ; on demande l'union dès maintenant pour éviter
 * un re-consentement quand on branchera modération / points / chat.
 */
export const BROADCASTER_SCOPES: readonly string[] = [
  'channel:manage:predictions',
  'clips:edit',
  'user:write:chat',
  'channel:manage:redemptions',
  'channel:read:redemptions',
  'moderator:manage:banned_users',
  'moderator:manage:chat_messages',
  'moderator:manage:chat_settings',
  // Stream markers (POST /helix/streams/markers) — repérer les temps forts sur
  // le VOD pour le montage.
  'channel:manage:broadcast',
  // EventSub (pages/api/admin/twitch/eventsub/subscribe.ts) — ce que l'IRC ne
  // livre pas : follows (channel.follow v2) et shoutouts reçus
  // (channel.shoutout.receive v1). Une connexion établie AVANT l'ajout de ces
  // deux scopes ne les a pas : la route répond alors 403 MISSING_SCOPE (ou les
  // liste dans `missing_scopes`) → il faut reconnecter la chaîne.
  'moderator:read:followers',
  'moderator:read:shoutouts',
];

/* -----------------------------------------------------------
 * Config / env
 * ---------------------------------------------------------*/

export type TwitchBroadcasterConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

/**
 * Lit les credentials Twitch (clientCreds()) + TWITCH_REDIRECT_URI. Renvoie null
 * si l'un des trois manque (feature dormante ; le caller répond 503 sans révéler
 * lequel).
 */
export function twitchBroadcasterConfig(): TwitchBroadcasterConfig | null {
  const creds = clientCreds();
  const redirectUri = process.env.TWITCH_REDIRECT_URI?.trim();
  if (!creds || !redirectUri) return null;
  return {
    clientId: creds.id,
    clientSecret: creds.secret,
    redirectUri,
  };
}

/** True seulement si CLIENT_ID + CLIENT_SECRET + REDIRECT_URI sont présents. */
export function isTwitchBroadcasterConfigured(): boolean {
  return twitchBroadcasterConfig() !== null;
}

/* -----------------------------------------------------------
 * Authorize URL
 * ---------------------------------------------------------*/

/**
 * Construit l'URL d'autorisation Twitch. `state` = valeur opaque signée (voir
 * signState) portant le nonce CSRF + tenant + user + returnTo.
 * `force_verify=true` force l'écran de consentement (évite un re-lien silencieux
 * sur une autre chaîne déjà connectée dans le navigateur).
 * @throws si la feature n'est pas configurée (guard avec isTwitchBroadcasterConfigured()).
 */
export function buildBroadcasterAuthorizeUrl(state: string): string {
  const cfg = twitchBroadcasterConfig();
  if (!cfg) throw new Error('Twitch broadcaster OAuth not configured');
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: BROADCASTER_SCOPES.join(' '),
    state,
    force_verify: 'true',
  });
  return `${AUTHORIZE_ENDPOINT}?${params.toString()}`;
}

/* -----------------------------------------------------------
 * Token exchange / refresh
 * ---------------------------------------------------------*/

type TwitchTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string[] | string;
  token_type?: string;
};

export type BroadcasterToken = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string[];
};

function normalizeScope(raw: string[] | string | undefined): string[] {
  if (Array.isArray(raw)) return raw.map((s) => String(s));
  if (typeof raw === 'string')
    return raw
      .split(' ')
      .map((s) => s.trim())
      .filter(Boolean);
  return [];
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function postToken(
  params: URLSearchParams,
  label: string
): Promise<BroadcasterToken> {
  const res = await fetchWithTimeout(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) {
    throw new Error(`${label}: HTTP ${res.status}`);
  }
  const json = (await res.json()) as TwitchTokenResponse;
  if (!json?.access_token || !json?.refresh_token) {
    throw new Error(`${label}: missing tokens in response`);
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: typeof json.expires_in === 'number' ? json.expires_in : 0,
    scope: normalizeScope(json.scope),
  };
}

/**
 * Échange un `authorization_code` contre les tokens broadcaster.
 * redirect_uri = TWITCH_REDIRECT_URI (doit être IDENTIQUE à l'authorize).
 */
export async function exchangeBroadcasterCode(
  code: string
): Promise<BroadcasterToken> {
  const cfg = twitchBroadcasterConfig();
  if (!cfg) throw new Error('Twitch broadcaster OAuth not configured');
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: cfg.redirectUri,
  });
  return postToken(params, 'twitch broadcaster token exchange');
}

/** Rafraîchit un token broadcaster via son refresh_token. */
export async function refreshBroadcasterToken(
  refreshToken: string
): Promise<BroadcasterToken> {
  const cfg = twitchBroadcasterConfig();
  if (!cfg) throw new Error('Twitch broadcaster OAuth not configured');
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  return postToken(params, 'twitch broadcaster token refresh');
}

/* -----------------------------------------------------------
 * State signé (CSRF nonce + binding session), pur/testable
 * ---------------------------------------------------------*/

export type BroadcasterStatePayload = {
  /** Tenant qui connecte sa chaîne. */
  tenantId: string;
  /** auth.users id qui a initié le flux (binding session). */
  userId: string;
  /** Nonce CSRF, mirroré dans un cookie httpOnly (double-submit). */
  nonce: string;
  /** Chemin interne relatif de retour après le callback. */
  returnTo: string;
  /** Epoch ms d'émission (TTL au verify). */
  issuedAt: number;
};

const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Clé HMAC du state. Dérivée du client secret Twitch (aucune env
 * supplémentaire ; la feature est dormante sans lui de toute façon). Fallback
 * CRON_SECRET en défense en profondeur.
 */
function stateSecret(): string {
  const key =
    process.env.TWITCH_CLIENT_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    '';
  if (!key) throw new Error('Twitch broadcaster state secret unavailable');
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

/** Génère un nonce CSRF aléatoire (hex). */
export function generateStateNonce(): string {
  return crypto.randomBytes(24).toString('hex');
}

/** Signe un payload de state en `<body>.<sig>` opaque. */
export function signState(
  payload: Omit<BroadcasterStatePayload, 'issuedAt'> & { issuedAt?: number }
): string {
  const full: BroadcasterStatePayload = {
    tenantId: payload.tenantId,
    userId: payload.userId,
    nonce: payload.nonce,
    returnTo: payload.returnTo,
    issuedAt: payload.issuedAt ?? Date.now(),
  };
  const body = b64urlEncode(JSON.stringify(full));
  return `${body}.${hmac(body)}`;
}

/**
 * Vérifie + décode un state. Renvoie null sur toute altération, mauvaise
 * signature, payload malformé, ou expiration (> STATE_MAX_AGE_MS).
 */
export function verifyState(
  state: string | undefined | null,
  opts: { maxAgeMs?: number; now?: number } = {}
): BroadcasterStatePayload | null {
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

  let parsed: BroadcasterStatePayload;
  try {
    parsed = JSON.parse(b64urlDecode(body)) as BroadcasterStatePayload;
  } catch {
    return null;
  }
  if (
    !parsed ||
    typeof parsed.tenantId !== 'string' ||
    typeof parsed.userId !== 'string' ||
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

/* -----------------------------------------------------------
 * Persistance chiffrée + résolution de token valide
 * ---------------------------------------------------------*/

const TABLE = 'twitch_broadcaster_connections';

export type StoreConnectionInput = {
  tenantId: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string[];
  broadcasterId: string;
  login: string;
  userId?: string | null;
};

/**
 * Chiffre les 2 tokens (AES-256-GCM) et UPSERT la connexion sur tenant_id.
 * expires_at = now + expiresIn secondes.
 */
export async function storeConnection(
  admin: SupabaseClient,
  input: StoreConnectionInput
): Promise<{ error: unknown }> {
  const expiresAt = new Date(
    Date.now() + Math.max(0, input.expiresIn) * 1000
  ).toISOString();
  const { error } = await admin.from(TABLE).upsert(
    {
      tenant_id: input.tenantId,
      broadcaster_id: input.broadcasterId,
      broadcaster_login: input.login,
      access_token_enc: encryptSecret(input.accessToken),
      refresh_token_enc: encryptSecret(input.refreshToken),
      scope: input.scope,
      expires_at: expiresAt,
      connected_by_user_id: input.userId ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id' }
  );
  return { error };
}

export type ValidBroadcasterToken = {
  accessToken: string;
  broadcasterId: string;
  scope: string[];
};

type ConnectionRow = {
  broadcaster_id: string;
  broadcaster_login: string;
  access_token_enc: string;
  refresh_token_enc: string;
  scope: string[] | null;
  expires_at: string;
};

/**
 * Renvoie un access token broadcaster valide pour le tenant, ou null si aucune
 * connexion. Rafraîchit proactivement si expiré (marge 60 s), re-chiffre et
 * met à jour la row. Ne renvoie JAMAIS le refresh token.
 * @throws si le rafraîchissement échoue (token révoqué côté Twitch, etc.).
 */
export async function getValidBroadcasterToken(
  admin: SupabaseClient,
  tenantId: string
): Promise<ValidBroadcasterToken | null> {
  const { data, error } = await admin
    .from(TABLE)
    .select(
      'broadcaster_id, broadcaster_login, access_token_enc, refresh_token_enc, scope, expires_at'
    )
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as ConnectionRow;

  const expiresAtMs = new Date(row.expires_at).getTime();
  const stillValid =
    Number.isFinite(expiresAtMs) && expiresAtMs > Date.now() + 60_000;

  if (stillValid) {
    return {
      accessToken: decryptSecret(row.access_token_enc),
      broadcasterId: row.broadcaster_id,
      scope: row.scope ?? [],
    };
  }

  // Expiré (ou expiration illisible) → refresh proactif.
  const refreshToken = decryptSecret(row.refresh_token_enc);
  const refreshed = await refreshBroadcasterToken(refreshToken);
  const nextScope =
    refreshed.scope.length > 0 ? refreshed.scope : (row.scope ?? []);
  const nextExpiresAt = new Date(
    Date.now() + Math.max(0, refreshed.expiresIn) * 1000
  ).toISOString();

  await admin
    .from(TABLE)
    .update({
      access_token_enc: encryptSecret(refreshed.accessToken),
      // Twitch peut renvoyer un nouveau refresh_token ; sinon on garde l'ancien.
      refresh_token_enc: encryptSecret(refreshed.refreshToken || refreshToken),
      scope: nextScope,
      expires_at: nextExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId);

  return {
    accessToken: refreshed.accessToken,
    broadcasterId: row.broadcaster_id,
    scope: nextScope,
  };
}

/* -----------------------------------------------------------
 * Helix fetch (avec le token broadcaster)
 * ---------------------------------------------------------*/

/**
 * Appelle l'API Helix avec le token broadcaster. `path` = chemin relatif après
 * /helix (ex. '/predictions'). Ajoute Client-ID + Authorization Bearer +
 * Content-Type json. Renvoie la Response brute (le caller gère le status).
 * @throws si Twitch n'est pas configuré (pas de Client-ID).
 */
export async function helixFetch(
  accessToken: string,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const creds = clientCreds();
  if (!creds) throw new Error('Twitch not configured (missing client id)');
  const url = `${HELIX_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  const headers: Record<string, string> = {
    'Client-ID': creds.id,
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) ?? {}),
  };
  return fetchWithTimeout(url, { ...init, headers });
}

/** True si le scope requis est présent dans la liste accordée. */
export function hasScope(scope: string[], required: string): boolean {
  return scope.includes(required);
}
