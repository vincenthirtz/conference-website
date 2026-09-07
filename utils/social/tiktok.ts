// utils/social/tiktok.ts
//
// Socle OAuth TikTok (Login Kit v2) pour LIRE nos propres publications, et les
// recopier dans un salon Discord — cf. `./tiktokMirror.ts`.
//
// LECTURE SEULE, ET C'EST VOULU. On ne publie pas sur TikTok depuis l'admin :
// une vidéo se monte, elle ne se compose pas dans un formulaire. Les scopes
// demandés sont donc `user.info.basic` et `video.list`, rien de plus — pas de
// `video.upload`, qui exigerait l'audit complet de l'app.
//
// POURQUOI UN OAUTH POUR LIRE NOTRE PROPRE COMPTE. Parce que TikTok n'expose
// AUCUN flux public : ni RSS comme YouTube, ni endpoint anonyme comme Bluesky.
// Le seul accès supporté à « les dernières vidéos de ce compte » passe par un
// jeton du compte lui-même. C'est le prix d'entrée, et les contournements sont
// tous des ponts tiers que TikTok casse régulièrement.
//
// LES DEUX IDENTIFIANTS VIVENT EN BASE, chiffrés (`integration_secrets`), et
// pas en variables d'environnement — y compris le `client_key`, qui n'est
// pourtant pas secret. Deux raisons : le plafond de 4 Ko de l'environnement
// Netlify a déjà fait échouer des déploiements (cf. l'en-tête de
// `utils/integrationSecrets.ts`), et une intégration qui se configure en base
// se branche sans redéployer.
//
// LE JETON D'ACCÈS VIT 24 HEURES. C'est vingt fois plus court qu'Instagram, et
// ça change la stratégie : le rafraîchissement ne peut pas attendre le cron
// quotidien, il se fait À LA LECTURE (`ensureAccessToken`), c'est-à-dire toutes
// les quinze minutes puisque c'est le rythme du miroir. Le refresh token, lui,
// vit un an et TOURNE — TikTok peut en renvoyer un nouveau à chaque échange, et
// on réécrit donc toujours les deux ensemble.
//
// Env :
//   TIKTOK_REDIRECT_URI (défaut : https://owwomenscup.fr/api/admin/tiktok/callback
//                        — doit être déclarée à l'identique dans l'app TikTok,
//                        et identique entre l'authorize et l'échange)

import { supabaseAdmin } from '@/utils/supabase';
import { encryptSecret, decryptSecret } from '@/utils/crypto';
import { getIntegrationSecret } from '@/utils/integrationSecrets';
import { logger } from '@/utils/logger';
import {
  signOauthState,
  verifyOauthState,
  type StatePayload,
} from './oauthState';

const FETCH_TIMEOUT_MS = 15_000;

const AUTHORIZE_ENDPOINT = 'https://www.tiktok.com/v2/auth/authorize/';
const TOKEN_ENDPOINT = 'https://open.tiktokapis.com/v2/oauth/token/';
export const API_BASE = 'https://open.tiktokapis.com/v2';

const DEFAULT_REDIRECT_URI = 'https://owwomenscup.fr/api/admin/tiktok/callback';

/** Scopes demandés au consentement. Strictement ce dont se sert le miroir. */
export const TIKTOK_SCOPES: readonly string[] = [
  'user.info.basic',
  'video.list',
];

/** Sel du `state` — propre au parcours TikTok (cf. `./oauthState.ts`). */
const STATE_SALT = 'tiktok-oauth-state-v1';

/**
 * Marge avant échéance en dessous de laquelle on rafraîchit sans attendre.
 * Généreuse à dessein : un jeton qui expire pendant l'appel coûte un passage de
 * miroir, et le miroir ne repasse qu'un quart d'heure plus tard.
 */
export const REFRESH_MARGIN_MS = 30 * 60 * 1000;

/* -------------------------------------------------------------------------- */
/* Config                                                                      */
/* -------------------------------------------------------------------------- */

export function tiktokRedirectUri(): string {
  return process.env.TIKTOK_REDIRECT_URI?.trim() || DEFAULT_REDIRECT_URI;
}

export type TiktokCredentials = { clientKey: string; clientSecret: string };

/** Les identifiants d'app, ou `null` si l'un des deux manque. */
export async function tiktokCredentials(
  tenantId: string
): Promise<TiktokCredentials | null> {
  const [clientKey, clientSecret] = await Promise.all([
    getIntegrationSecret(tenantId, 'tiktok_client_key'),
    getIntegrationSecret(tenantId, 'tiktok_client_secret'),
  ]);
  if (!clientKey || !clientSecret) return null;
  return { clientKey, clientSecret };
}

/* -------------------------------------------------------------------------- */
/* `state` signé — CSRF                                                        */
/* -------------------------------------------------------------------------- */

export function signState(tenantId: string): string {
  return signOauthState(STATE_SALT, tenantId);
}

export function verifyState(state: string): StatePayload | null {
  return verifyOauthState(STATE_SALT, state);
}

export function buildAuthorizeUrl(clientKey: string, state: string): string {
  const params = new URLSearchParams({
    client_key: clientKey,
    scope: TIKTOK_SCOPES.join(','),
    response_type: 'code',
    redirect_uri: tiktokRedirectUri(),
    state,
  });
  return `${AUTHORIZE_ENDPOINT}?${params.toString()}`;
}

/* -------------------------------------------------------------------------- */
/* Jetons                                                                      */
/* -------------------------------------------------------------------------- */

async function fetchJson(
  url: string,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      body = { raw: text };
    }
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * `true` si la réponse porte une erreur.
 *
 * TIKTOK RÉPOND 200 SUR DES ÉCHECS. L'endpoint de jeton renvoie
 * `{ error: 'invalid_grant', error_description: … }` avec un statut 200, et les
 * endpoints de données rangent leur verdict dans un objet `error` dont le code
 * vaut `ok` quand tout va bien. Se fier au code HTTP ferait prendre un refus
 * pour un succès — et persister un jeton vide.
 */
export function hasTiktokError(body: Record<string, unknown>): boolean {
  if (typeof body?.error === 'string' && body.error) return true;
  const nested = body?.error as { code?: string } | undefined;
  return Boolean(nested?.code && nested.code !== 'ok');
}

/** Message lisible extrait d'une réponse TikTok. */
export function tiktokError(body: Record<string, unknown>): string {
  if (typeof body?.error === 'string') {
    const desc = body?.error_description;
    return `${body.error}${desc ? ` — ${String(desc)}` : ''}`;
  }
  const nested = body?.error as { code?: string; message?: string } | undefined;
  if (nested?.code) {
    return `${nested.code}${nested.message ? ` — ${nested.message}` : ''}`;
  }
  return JSON.stringify(body).slice(0, 300);
}

export type TiktokTokens = {
  accessToken: string;
  expiresAt: Date;
  refreshToken: string;
  refreshExpiresAt: Date;
  openId: string;
  scope: string;
};

function readTokens(body: Record<string, unknown>): TiktokTokens {
  const accessToken = String(body.access_token ?? '');
  const refreshToken = String(body.refresh_token ?? '');
  if (!accessToken || !refreshToken) {
    throw new Error('Réponse TikTok sans jeton.');
  }
  const expiresIn = Number(body.expires_in ?? 0);
  const refreshExpiresIn = Number(body.refresh_expires_in ?? 0);
  return {
    accessToken,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    refreshToken,
    refreshExpiresAt: new Date(Date.now() + refreshExpiresIn * 1000),
    openId: String(body.open_id ?? ''),
    scope: String(body.scope ?? ''),
  };
}

async function tokenRequest(
  creds: TiktokCredentials,
  params: Record<string, string>
): Promise<TiktokTokens> {
  const res = await fetchJson(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // TikTok documente explicitement ce en-tête sur l'endpoint de jeton :
      // sans lui, une réponse mise en cache peut rendre un jeton déjà périmé.
      'Cache-Control': 'no-cache',
    },
    body: new URLSearchParams({
      client_key: creds.clientKey,
      client_secret: creds.clientSecret,
      ...params,
    }).toString(),
  });
  if (!res.ok || hasTiktokError(res.body)) {
    throw new Error(tiktokError(res.body));
  }
  return readTokens(res.body);
}

/**
 * Code d'autorisation → jetons.
 *
 * Le `code` doit arriver DÉCODÉ. Next.js décode déjà `req.query` ; l'important
 * est de ne pas le ré-encoder au passage, car TikTok suffixe ses codes d'un `*`
 * qui ne survit pas à un double encodage.
 */
export async function exchangeCode(
  creds: TiktokCredentials,
  code: string
): Promise<TiktokTokens> {
  return tokenRequest(creds, {
    code,
    grant_type: 'authorization_code',
    redirect_uri: tiktokRedirectUri(),
  });
}

export async function refreshTokens(
  creds: TiktokCredentials,
  refreshToken: string
): Promise<TiktokTokens> {
  return tokenRequest(creds, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
}

/**
 * Nom affiché du compte, pour que l'admin dise QUI est connecté.
 *
 * `display_name` suffit et tient dans `user.info.basic` ; le `username`
 * (`@ow_womenscup`) demanderait le scope `user.info.profile`, qu'on ne va pas
 * réclamer pour une étiquette.
 */
export async function fetchDisplayName(
  accessToken: string
): Promise<string | null> {
  try {
    const res = await fetchJson(
      `${API_BASE}/user/info/?${new URLSearchParams({
        fields: 'open_id,display_name',
      }).toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok || hasTiktokError(res.body)) return null;
    const user = (res.body.data as { user?: { display_name?: string } })?.user;
    return user?.display_name ? String(user.display_name) : null;
  } catch {
    // Confort, pas condition de succès : la connexion vaut sans le nom.
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Persistance                                                                 */
/* -------------------------------------------------------------------------- */

export type TiktokAccount = {
  id: string;
  openId: string | null;
  handle: string | null;
  accessToken: string | null;
  expiresAt: Date | null;
  refreshToken: string | null;
  refreshExpiresAt: Date | null;
  status: string;
};

export async function saveConnection(
  tenantId: string,
  tokens: TiktokTokens,
  displayName: string | null,
  staffId: string | null
): Promise<void> {
  if (!supabaseAdmin) throw new Error('Service base de données indisponible.');
  const { error } = await supabaseAdmin.from('social_accounts').upsert(
    {
      tenant_id: tenantId,
      platform: 'tiktok',
      external_account_id: tokens.openId,
      handle: displayName,
      access_token_encrypted: encryptSecret(tokens.accessToken),
      token_expires_at: tokens.expiresAt.toISOString(),
      refresh_token_encrypted: encryptSecret(tokens.refreshToken),
      refresh_token_expires_at: tokens.refreshExpiresAt.toISOString(),
      scopes: [...TIKTOK_SCOPES],
      status: 'connected',
      last_error: null,
      connected_at: new Date().toISOString(),
      connected_by: staffId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id,platform' }
  );
  if (error) throw error;
}

/** Le compte connecté, jetons DÉCHIFFRÉS. `null` si absent. */
export async function loadAccount(
  tenantId: string
): Promise<TiktokAccount | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from('social_accounts')
    .select(
      'id, external_account_id, handle, access_token_encrypted, token_expires_at, refresh_token_encrypted, refresh_token_expires_at, status'
    )
    .eq('tenant_id', tenantId)
    .eq('platform', 'tiktok')
    .maybeSingle();

  if (error || !data) return null;
  const row = data as Record<string, unknown>;

  const decrypt = (value: unknown): string | null => {
    if (!value) return null;
    try {
      return decryptSecret(String(value));
    } catch (err) {
      // PERDU, pas absent : le dire évite de chercher pourquoi « ça ne marche
      // plus » après une rotation de SECRETS_ENC_KEY.
      logger.error(
        '[tiktok] déchiffrement impossible — SECRETS_ENC_KEY a-t-elle changé ?',
        err
      );
      return null;
    }
  };

  return {
    id: String(row.id),
    openId: row.external_account_id ? String(row.external_account_id) : null,
    handle: row.handle ? String(row.handle) : null,
    accessToken: decrypt(row.access_token_encrypted),
    expiresAt: row.token_expires_at
      ? new Date(String(row.token_expires_at))
      : null,
    refreshToken: decrypt(row.refresh_token_encrypted),
    refreshExpiresAt: row.refresh_token_expires_at
      ? new Date(String(row.refresh_token_expires_at))
      : null,
    status: String(row.status),
  };
}

async function storeRefreshed(
  tenantId: string,
  tokens: TiktokTokens
): Promise<void> {
  if (!supabaseAdmin) return;
  await supabaseAdmin
    .from('social_accounts')
    .update({
      access_token_encrypted: encryptSecret(tokens.accessToken),
      token_expires_at: tokens.expiresAt.toISOString(),
      // Le refresh token TOURNE : celui qu'on vient d'utiliser peut être mort.
      // Ne pas réécrire cette colonne condamnerait la connexion au prochain
      // rafraîchissement.
      refresh_token_encrypted: encryptSecret(tokens.refreshToken),
      refresh_token_expires_at: tokens.refreshExpiresAt.toISOString(),
      status: 'connected',
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('platform', 'tiktok');
}

export async function markError(
  tenantId: string,
  message: string
): Promise<void> {
  if (!supabaseAdmin) return;
  await supabaseAdmin
    .from('social_accounts')
    .update({ last_error: message, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('platform', 'tiktok');
}

/**
 * Un jeton d'accès UTILISABLE, rafraîchi si besoin.
 *
 * `null` veut dire « pas de compte connecté » — une absence de configuration,
 * pas une panne. Une vraie panne (TikTok injoignable, refus du rafraîchissement)
 * sort en exception : les deux ne se soignent pas pareil, et le rapport du cron
 * doit pouvoir les distinguer.
 */
export async function ensureAccessToken(
  tenantId: string
): Promise<{ accessToken: string; openId: string | null } | null> {
  const account = await loadAccount(tenantId);
  if (!account) return null;

  if (
    account.accessToken &&
    account.expiresAt &&
    account.expiresAt.getTime() - Date.now() > REFRESH_MARGIN_MS
  ) {
    return { accessToken: account.accessToken, openId: account.openId };
  }

  if (!account.refreshToken) {
    // Connexion tronquée (jeton illisible, ou compte créé avant la colonne) :
    // il n'y a rien à rafraîchir, seule une ré-autorisation rétablit le service.
    throw new Error('no_refresh_token');
  }
  if (
    account.refreshExpiresAt &&
    account.refreshExpiresAt.getTime() <= Date.now()
  ) {
    throw new Error('refresh_token_expired');
  }

  const creds = await tiktokCredentials(tenantId);
  if (!creds) throw new Error('no_credentials');

  const tokens = await refreshTokens(creds, account.refreshToken);
  await storeRefreshed(tenantId, tokens);
  return {
    accessToken: tokens.accessToken,
    openId: tokens.openId || account.openId,
  };
}
