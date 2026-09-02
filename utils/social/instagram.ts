// utils/social/instagram.ts
//
// Socle OAuth « Instagram Business Login » + publication de contenu.
//
// Modelé sur `utils/twitchBroadcaster.ts`, dont il reprend les invariants :
//   - `state` signé HMAC (CSRF + binding tenant), TTL 10 min ;
//   - jetons CHIFFRÉS au repos (utils/crypto.ts), jamais renvoyés à un client ;
//   - fonctionnalité DORMANTE si la config manque — les routes répondent 503
//     au lieu de planter.
//
// PAS DE REVIEW META À PASSER. On ne publie que sur NOTRE compte : l'app reste
// en mode développement et `@womenscup_asso` y a le rôle « testeur Instagram »
// (invitation acceptée côté Instagram). La review n'est exigée que pour publier
// sur des comptes qu'on ne possède pas.
//
// PUBLICATION EN TROIS TEMPS, et le deuxième n'est pas optionnel :
//   1. POST /<ig-id>/media          → conteneur (Instagram va chercher l'image)
//   2. GET  /<container>?fields=status_code → attendre FINISHED
//   3. POST /<ig-id>/media_publish  → publication
// Publier un conteneur encore IN_PROGRESS échoue. C'est l'erreur classique, et
// elle est intermittente — elle passe en test avec une petite image et casse en
// production avec une grande.
//
// L'IMAGE DOIT ÊTRE PUBLIQUEMENT ACCESSIBLE et le RESTER : Instagram la
// télécharge lui-même, de façon asynchrone. Une URL signée à durée de vie
// courte, ou un fichier supprimé juste après l'appel, donne un post sans visuel
// sans aucune erreur côté serveur.
//
// Env :
//   INSTAGRAM_APP_ID       (public, l'App ID de l'app Meta)
//   INSTAGRAM_REDIRECT_URI (défaut : https://owwomenscup.fr/api/admin/instagram/callback
//                           — doit être IDENTIQUE à l'URI déclarée chez Meta,
//                           au caractère près, et identique entre l'authorize
//                           et l'échange)
//   SECRETS_ENC_KEY        (clé de chiffrement, lue par utils/crypto.ts)
// Secret d'app : `integration_secrets.instagram_app_secret` (chiffré en base,
// PAS en variable d'environnement — le plafond de 4 Ko de Netlify a déjà fait
// échouer le déploiement deux fois).

import crypto from 'crypto';
import { supabaseAdmin } from '@/utils/supabase';
import { encryptSecret, decryptSecret } from '@/utils/crypto';
import { getIntegrationSecret } from '@/utils/integrationSecrets';
import { logger } from '@/utils/logger';

const FETCH_TIMEOUT_MS = 15_000;

const AUTHORIZE_ENDPOINT = 'https://www.instagram.com/oauth/authorize';
const TOKEN_ENDPOINT = 'https://api.instagram.com/oauth/access_token';
const GRAPH_BASE = 'https://graph.instagram.com';

/** Scopes demandés au consentement. Strictement ce dont on se sert. */
export const INSTAGRAM_SCOPES: readonly string[] = [
  'instagram_business_basic',
  'instagram_business_content_publish',
];

const DEFAULT_REDIRECT_URI =
  'https://owwomenscup.fr/api/admin/instagram/callback';

/** Attente maximale de la préparation du conteneur média, et pas de pire. */
const CONTAINER_POLL_ATTEMPTS = 10;
const CONTAINER_POLL_DELAY_MS = 2_000;

/** On rafraîchit ce nombre de jours AVANT l'échéance, pas le jour même. */
export const REFRESH_WINDOW_DAYS = 10;

/* -------------------------------------------------------------------------- */
/* Config                                                                      */
/* -------------------------------------------------------------------------- */

export function instagramAppId(): string | null {
  return process.env.INSTAGRAM_APP_ID?.trim() || null;
}

export function instagramRedirectUri(): string {
  return process.env.INSTAGRAM_REDIRECT_URI?.trim() || DEFAULT_REDIRECT_URI;
}

/** `true` si l'App ID est posé. Le secret se vérifie en base, à la demande. */
export function isInstagramConfigured(): boolean {
  return Boolean(instagramAppId());
}

async function appSecret(tenantId: string): Promise<string | null> {
  return getIntegrationSecret(tenantId, 'instagram_app_secret');
}

/* -------------------------------------------------------------------------- */
/* `state` signé — CSRF                                                        */
/* -------------------------------------------------------------------------- */

type StatePayload = { tenantId: string; nonce: string; iat: number };

const STATE_TTL_MS = 10 * 60 * 1000;

function stateKey(): Buffer {
  const secret =
    process.env.SECRETS_ENC_KEY?.trim() ||
    process.env.TWITCH_TOKEN_ENC_KEY?.trim() ||
    '';
  if (!secret) throw new Error('SECRETS_ENC_KEY absente.');
  return crypto.scryptSync(secret, 'instagram-oauth-state-v1', 32);
}

export function signState(tenantId: string): string {
  const payload: StatePayload = {
    tenantId,
    nonce: crypto.randomBytes(12).toString('base64url'),
    iat: Date.now(),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto
    .createHmac('sha256', stateKey())
    .update(body)
    .digest('base64url');
  return `${body}.${mac}`;
}

/** Vérifie signature ET fraîcheur. Renvoie null sur tout doute. */
export function verifyState(state: string): StatePayload | null {
  const [body, mac] = (state || '').split('.');
  if (!body || !mac) return null;

  const expected = crypto
    .createHmac('sha256', stateKey())
    .update(body)
    .digest('base64url');

  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8')
    ) as StatePayload;
    if (Date.now() - payload.iat > STATE_TTL_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: instagramAppId() ?? '',
    redirect_uri: instagramRedirectUri(),
    response_type: 'code',
    scope: INSTAGRAM_SCOPES.join(','),
    state,
  });
  return `${AUTHORIZE_ENDPOINT}?${params.toString()}`;
}

/* -------------------------------------------------------------------------- */
/* Échange et rafraîchissement de jetons                                       */
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

/** Message d'erreur lisible extrait d'une réponse Meta. */
function metaError(body: Record<string, unknown>): string {
  const err = body?.error as { message?: string } | undefined;
  if (err?.message) return err.message;
  if (typeof body?.error_message === 'string') return body.error_message;
  return JSON.stringify(body).slice(0, 300);
}

export type InstagramConnection = {
  accessToken: string;
  expiresAt: Date;
  userId: string;
  username: string | null;
};

/**
 * Parcours complet du callback : code → jeton court → jeton long (60 j) →
 * identité du compte.
 *
 * Le jeton COURT ne sert à rien d'autre qu'à obtenir le long : on ne le
 * persiste jamais.
 */
export async function exchangeCode(
  tenantId: string,
  code: string
): Promise<InstagramConnection> {
  const clientId = instagramAppId();
  const clientSecret = await appSecret(tenantId);
  if (!clientId || !clientSecret) {
    throw new Error(
      'Instagram non configuré (INSTAGRAM_APP_ID ou instagram_app_secret manquant).'
    );
  }

  const short = await fetchJson(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      redirect_uri: instagramRedirectUri(),
      code,
    }).toString(),
  });
  if (!short.ok) {
    throw new Error(`Échange du code refusé : ${metaError(short.body)}`);
  }
  const shortToken = String(short.body.access_token ?? '');
  if (!shortToken) throw new Error('Réponse sans access_token.');

  const long = await fetchJson(
    `${GRAPH_BASE}/access_token?${new URLSearchParams({
      grant_type: 'ig_exchange_token',
      client_secret: clientSecret,
      access_token: shortToken,
    }).toString()}`
  );
  if (!long.ok) {
    throw new Error(`Jeton longue durée refusé : ${metaError(long.body)}`);
  }
  const accessToken = String(long.body.access_token ?? '');
  const expiresIn = Number(long.body.expires_in ?? 0);
  if (!accessToken) throw new Error('Réponse sans jeton longue durée.');

  const me = await fetchJson(
    `${GRAPH_BASE}/me?${new URLSearchParams({
      fields: 'user_id,username',
      access_token: accessToken,
    }).toString()}`
  );
  if (!me.ok) {
    throw new Error(`Lecture du compte impossible : ${metaError(me.body)}`);
  }

  return {
    accessToken,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    // `user_id` est l'identifiant à préfixer aux appels de publication ; `id`
    // ne l'est pas toujours selon le parcours de connexion.
    userId: String(me.body.user_id ?? me.body.id ?? ''),
    username: me.body.username ? String(me.body.username) : null,
  };
}

/**
 * Rafraîchit un jeton longue durée. Exige un jeton ENCORE VALIDE et âgé d'au
 * moins 24 h — passé l'échéance, il n'y a plus de rattrapage automatique, d'où
 * le cron qui s'y prend dix jours à l'avance.
 */
export async function refreshToken(
  token: string
): Promise<{ accessToken: string; expiresAt: Date }> {
  const res = await fetchJson(
    `${GRAPH_BASE}/refresh_access_token?${new URLSearchParams({
      grant_type: 'ig_refresh_token',
      access_token: token,
    }).toString()}`
  );
  if (!res.ok) {
    throw new Error(`Rafraîchissement refusé : ${metaError(res.body)}`);
  }
  const accessToken = String(res.body.access_token ?? '');
  const expiresIn = Number(res.body.expires_in ?? 0);
  if (!accessToken) throw new Error('Réponse sans jeton.');
  return {
    accessToken,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
  };
}

/* -------------------------------------------------------------------------- */
/* Persistance                                                                 */
/* -------------------------------------------------------------------------- */

export type StoredAccount = {
  id: string;
  platform: string;
  externalAccountId: string | null;
  handle: string | null;
  accessToken: string | null;
  expiresAt: Date | null;
  status: string;
};

export async function saveConnection(
  tenantId: string,
  conn: InstagramConnection,
  staffId: string | null
): Promise<void> {
  if (!supabaseAdmin) throw new Error('Service base de données indisponible.');
  const { error } = await supabaseAdmin.from('social_accounts').upsert(
    {
      tenant_id: tenantId,
      platform: 'instagram',
      external_account_id: conn.userId,
      handle: conn.username,
      access_token_encrypted: encryptSecret(conn.accessToken),
      token_expires_at: conn.expiresAt.toISOString(),
      scopes: [...INSTAGRAM_SCOPES],
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

/** Le compte connecté, jeton DÉCHIFFRÉ. `null` si absent ou illisible. */
export async function loadAccount(
  tenantId: string,
  platform = 'instagram'
): Promise<StoredAccount | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from('social_accounts')
    .select(
      'id, platform, external_account_id, handle, access_token_encrypted, token_expires_at, status'
    )
    .eq('tenant_id', tenantId)
    .eq('platform', platform)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as Record<string, unknown>;

  let accessToken: string | null = null;
  if (row.access_token_encrypted) {
    try {
      accessToken = decryptSecret(String(row.access_token_encrypted));
    } catch (err) {
      // Le jeton est PERDU, pas absent : le dire évite de chercher pourquoi
      // « ça ne marche plus » après une rotation de SECRETS_ENC_KEY.
      logger.error(
        '[instagram] déchiffrement du jeton impossible — SECRETS_ENC_KEY a-t-elle changé ?',
        err
      );
    }
  }

  return {
    id: String(row.id),
    platform: String(row.platform),
    externalAccountId: row.external_account_id
      ? String(row.external_account_id)
      : null,
    handle: row.handle ? String(row.handle) : null,
    accessToken,
    expiresAt: row.token_expires_at
      ? new Date(String(row.token_expires_at))
      : null,
    status: String(row.status),
  };
}

export async function markAccount(
  tenantId: string,
  patch: Record<string, unknown>
): Promise<void> {
  if (!supabaseAdmin) return;
  await supabaseAdmin
    .from('social_accounts')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('platform', 'instagram');
}

/* -------------------------------------------------------------------------- */
/* Publication                                                                 */
/* -------------------------------------------------------------------------- */

export type InstagramPublishResult = {
  mediaId: string;
  permalink: string | null;
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Publie une image légendée. Trois appels, dont l'attente du conteneur.
 *
 * `waitFor` est injectable pour que les tests n'attendent pas vraiment vingt
 * secondes — sans ça, personne n'écrit le test du chemin IN_PROGRESS, qui est
 * précisément celui qui casse en production.
 */
export async function publishImage(
  params: {
    igUserId: string;
    accessToken: string;
    imageUrl: string;
    caption: string;
  },
  waitFor: (ms: number) => Promise<void> = sleep
): Promise<InstagramPublishResult> {
  const { igUserId, accessToken, imageUrl, caption } = params;

  const container = await fetchJson(`${GRAPH_BASE}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      image_url: imageUrl,
      caption,
      access_token: accessToken,
    }).toString(),
  });
  if (!container.ok) {
    throw new Error(`Conteneur refusé : ${metaError(container.body)}`);
  }
  const containerId = String(container.body.id ?? '');
  if (!containerId) throw new Error('Conteneur sans identifiant.');

  // Attendre FINISHED. Publier un conteneur IN_PROGRESS échoue, et l'échec est
  // intermittent : il passe avec une petite image et casse avec une grande.
  let ready = false;
  for (let i = 0; i < CONTAINER_POLL_ATTEMPTS; i += 1) {
    const status = await fetchJson(
      `${GRAPH_BASE}/${containerId}?${new URLSearchParams({
        fields: 'status_code',
        access_token: accessToken,
      }).toString()}`
    );
    const code = String(status.body.status_code ?? '');
    if (code === 'FINISHED') {
      ready = true;
      break;
    }
    if (code === 'ERROR' || code === 'EXPIRED') {
      throw new Error(
        `Instagram n'a pas pu préparer l'image (${code}). ` +
          `Vérifiez que l'URL est publiquement accessible et le reste.`
      );
    }
    await waitFor(CONTAINER_POLL_DELAY_MS);
  }
  if (!ready) {
    throw new Error(
      "Instagram n'a pas fini de préparer l'image à temps. Le post n'a PAS été publié ; réessayez."
    );
  }

  const published = await fetchJson(`${GRAPH_BASE}/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      creation_id: containerId,
      access_token: accessToken,
    }).toString(),
  });
  if (!published.ok) {
    throw new Error(`Publication refusée : ${metaError(published.body)}`);
  }
  const mediaId = String(published.body.id ?? '');

  // Le permalien est un confort, pas une condition de succès : le post est en
  // ligne même si cette lecture échoue.
  let permalink: string | null = null;
  try {
    const meta = await fetchJson(
      `${GRAPH_BASE}/${mediaId}?${new URLSearchParams({
        fields: 'permalink',
        access_token: accessToken,
      }).toString()}`
    );
    if (meta.ok && meta.body.permalink) permalink = String(meta.body.permalink);
  } catch {
    /* ignoré volontairement */
  }

  return { mediaId, permalink };
}
