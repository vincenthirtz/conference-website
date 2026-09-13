// POST /api/webhooks/twitch/tcg-drop
//
// Webhook ENTRANT Twitch EventSub : offrir une récompense TCG à une spectatrice
// pendant un direct. Déclencheur retenu : l'échange de points de chaîne
// (`channel.channel_points_custom_reward_redemption.add`).
//
// PREMIER RÉCEPTEUR EventSub DU DÉPÔT. L'existant
// (`pages/api/admin/twitch/eventsub/subscribe.ts`) utilise le transport
// WEBSOCKET, piloté par le navigateur de la régie : rien ne recevait d'event
// côté serveur jusqu'ici. L'ossature suit donc le seul webhook entrant existant,
// `pages/api/helloasso/webhook.ts` (405+Allow → seau de limitation dédié →
// fail-closed si le secret manque → comparaison en temps constant → validation
// → métier), avec en plus ce que HelloAsso n'a pas : une vraie signature HMAC.
//
// ─────────────────────────────────────────────────────────────────────────────
// CE QUI MARCHE AUJOURD'HUI, ET CE QUI EST BLOQUÉ
//
// Marche : signature, poignée de main d'activation, révocation, fenêtre
// anti-rejeu, résolution du tenant par la chaîne, et l'écriture au registre
// (idempotente par contrainte UNIQUE).
//
// Bloqué, pour DEUX raisons indépendantes, toutes deux en base :
//
//   1. L'IDENTITÉ. Aucune table ne relie un compte Twitch à un compte du site.
//      `user_discord_links` et `user_battlenet_links` existent, l'équivalent
//      Twitch n'existe pas, et Twitch n'est pas un fournisseur de connexion
//      Supabase ici (seul Discord l'est). Un event EventSub livre un `user_id`
//      Twitch, jamais un `auth.users.id`. Cf. `resolveSiteUserFromTwitch`.
//
//   2. LE SCHÉMA DES RÉCOMPENSES. `utils/tcg/earnSources.ts` décrit déjà la
//      source `twitch_drop` mais la marque `schemaReady: false` : le CHECK
//      `tcg_wallet_entries_source_kind_check` n'admet pas encore cette valeur.
//      Cf. `grantTwitchDrop`.
//
// Ces deux manques sont ÉNONCÉS, jamais contournés : la route répond 200 avec un
// statut explicite plutôt que de deviner un destinataire ou de tenter une
// écriture que la base rejettera.
//
// ─────────────────────────────────────────────────────────────────────────────
// POURQUOI LE CORPS EST LU BRUT (`bodyParser: false`)
//
// La signature Twitch couvre les OCTETS EXACTS reçus. Laisser Next parser le
// JSON puis le re-sérialiser pour recalculer le HMAC ferait échouer toute charge
// dont la sérialisation diffère d'un caractère (ordre des clés, espaces,
// échappement unicode) : des signatures valides seraient rejetées sans que rien
// n'explique pourquoi. C'est sans précédent dans ce dépôt, d'où l'insistance.
//
// ─────────────────────────────────────────────────────────────────────────────
// POURQUOI ON NE LÈVE (PRESQUE) JAMAIS VERS TWITCH
//
// Twitch retente toute livraison non-2xx, puis DÉSACTIVE la souscription après
// trop d'échecs. Un cas qu'on ne sait pas traiter — chaîne inconnue, type
// d'event hors sujet, spectatrice sans compte lié, migration non passée — n'est
// pas une panne : il est acquitté en 200 avec un statut. On ne rend un 5xx que
// sur une indisponibilité réellement transitoire (base ou Helix injoignable),
// là où réessayer a un sens. Une signature invalide reste un 403 : ce n'est pas
// une livraison à réessayer, c'est une requête à refuser.
//
// ─────────────────────────────────────────────────────────────────────────────
// UN CHEMIN PLUS COURT EXISTE
//
// Le scope `channel:read:redemptions` est déjà consenti et la régie sait déjà
// créer des récompenses (`/api/admin/twitch/channel-points/rewards.ts`) et lire
// ou résoudre les demandes (`redemptions.ts`). Un sondage des demandes
// UNFULFILLED donnerait un drop sans webhook, sans corps brut et sans
// reconsentement. Ce webhook ne se justifie que pour que le drop fonctionne
// COCKPIT FERMÉ, personne devant l'écran.

import crypto from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { logger } from '@/utils/logger';
import { fetchTwitchLiveStatus } from '@/utils/twitch';
import { TWITCH_DROP_COINS, getEarnSource } from '@/utils/tcg/earnSources';
import { refreshBalance } from '@/utils/tcg/grantVictoryRewards';

/** Le corps doit rester brut : la signature couvre les octets reçus. */
export const config = { api: { bodyParser: false } };

/** Secret partagé, choisi PAR NOUS à la création de la souscription EventSub. */
const SECRET_ENV = 'TWITCH_EVENTSUB_SECRET';

/**
 * Clé de la source dans `utils/tcg/earnSources.ts`. Le montant, le nombre de
 * paquets et la nature de `source_ref` viennent de LÀ, jamais d'ici : le
 * registre existe précisément pour qu'aucun appelant ne repose un barème à la
 * main (« quatre fois la même erreur sur un barème recopié »).
 */
const EARN_SOURCE_KEY = 'twitch_drop';

/**
 * Seul type de souscription qui récompense. Tout autre type livré sur cette URL
 * est acquitté sans effet : une souscription mal aiguillée ne doit ni
 * distribuer, ni faire boucler Twitch sur un retry.
 */
const DROP_SUBSCRIPTION_TYPE =
  'channel.channel_points_custom_reward_redemption.add';

/**
 * Fenêtre d'acceptation de l'horodatage (10 min, la valeur recommandée par
 * Twitch). Une signature, elle, reste valide éternellement : sans cette borne,
 * un message capté une fois pourrait être rejoué indéfiniment. La contrainte
 * UNIQUE empêche déjà le double crédit, mais on ne laisse pas pour autant du
 * trafic périmé atteindre la logique métier.
 */
const MAX_MESSAGE_AGE_MS = 10 * 60 * 1000;

/**
 * Plafond du corps lu. Une charge EventSub pèse quelques kilo-octets ; le
 * plafond évite qu'une requête sans fin fasse gonfler la mémoire, `bodyParser`
 * étant désactivé — donc sans la limite que Next applique d'ordinaire.
 */
const MAX_BODY_BYTES = 64 * 1024;

/* -----------------------------------------------------------
 * Validation des charges utiles (zod, jamais un simple `if`)
 * ---------------------------------------------------------*/

/**
 * Poignée de main d'activation : Twitch n'active la souscription que si
 * `challenge` lui revient tel quel, en texte brut.
 */
const VerificationSchema = z.object({
  challenge: z.string().min(1).max(2000),
});

/**
 * Notification d'échange de points de chaîne. Seuls les champs réellement
 * consommés sont décrits, et l'extraction typée qui suit garantit qu'aucune
 * valeur non validée n'atteint la base ni Helix.
 */
const NotificationSchema = z.object({
  subscription: z.object({
    type: z.string().min(1).max(100),
  }),
  event: z.object({
    id: z.string().min(1).max(200),
    broadcaster_user_id: z.string().min(1).max(64),
    /** Nécessaire pour identifier le DIRECT en cours — cf. `resolveLiveRef`. */
    broadcaster_user_login: z.string().min(1).max(64).optional(),
    user_id: z.string().min(1).max(64),
    user_login: z.string().max(64).optional(),
  }),
});

/** Type de message, annoncé par `Twitch-Eventsub-Message-Type`. */
const MessageTypeSchema = z.enum([
  'webhook_callback_verification',
  'notification',
  'revocation',
]);

/* -----------------------------------------------------------
 * Signature
 * ---------------------------------------------------------*/

/** Comparaison à temps constant (longueurs comparées hors-bande). */
function constantTimeEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Signature attendue : `sha256=` + HMAC-SHA256(secret, id + timestamp + corps).
 *
 * Exportée pour être testée seule : c'est la seule barrière entre une URL
 * publique et une distribution de récompenses.
 */
export function computeTwitchSignature(
  secret: string,
  messageId: string,
  timestamp: string,
  rawBody: Buffer
): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(messageId + timestamp);
  hmac.update(rawBody);
  return `sha256=${hmac.digest('hex')}`;
}

/* -----------------------------------------------------------
 * Lecture du corps brut
 * ---------------------------------------------------------*/

/** Octets reçus, ou null si le plafond est dépassé. */
async function readRawBody(req: NextApiRequest): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf: Buffer = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk as string);
    total += buf.length;
    if (total > MAX_BODY_BYTES) return null;
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

/** Première valeur d'un en-tête, doublons ignorés. */
function header(req: NextApiRequest, name: string): string | null {
  const raw = req.headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/* -----------------------------------------------------------
 * Identité : le point de blocage assumé
 * ---------------------------------------------------------*/

export type IdentityResolution =
  | { ok: true; userId: string }
  | { ok: false; reason: 'IDENTITY_BACKEND_MISSING' };

/**
 * Compte du site correspondant à un identifiant Twitch.
 *
 * RIEN NE PERMET DE RÉPONDRE AUJOURD'HUI, et cette fonction le dit plutôt que
 * de bricoler. Deux « solutions » seraient des fautes :
 *
 *   1. Se rabattre sur le pseudo Twitch DÉCLARÉ (`user_metadata.twitch`, posé
 *      par /api/player/update-profile, miroité dans `team_members.twitch`). Il
 *      est auto-déclaré et JAMAIS vérifié : n'importe qui peut inscrire le
 *      pseudo d'une autre et encaisser ses récompenses. Un webhook signé qui
 *      distribue sur une identité non prouvée ne vaut pas mieux qu'un webhook
 *      sans signature.
 *   2. Créer la table depuis le code. Le schéma vit dans
 *      `database/migrations/`, et une table d'identité mérite d'être relue.
 *
 * MIGRATION ATTENDUE — `database/migrations/create_user_twitch_links.sql`,
 * calquée sur `add_user_discord_links.sql` :
 *
 *   CREATE TABLE IF NOT EXISTS user_twitch_links (
 *     auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 *     twitch_user_id text NOT NULL UNIQUE,   -- id numérique, STABLE
 *     twitch_login text,                     -- affichage seulement, se renomme
 *     linked_at timestamptz NOT NULL DEFAULT now(),
 *     updated_at timestamptz NOT NULL DEFAULT now()
 *   );
 *
 * `twitch_user_id` UNIQUE empêche deux comptes du site de revendiquer la même
 * chaîne ; la PK sur `auth_user_id` empêche l'inverse. Le login n'est JAMAIS une
 * clé : Twitch autorise le renommage, l'indexer serait un piège.
 *
 * Le lien doit venir d'un OAuth Twitch côté joueuse — le socle existe déjà
 * (`utils/twitchBroadcaster.ts` fait ce flux pour le broadcaster) — pour que
 * `twitch_user_id` vienne de Twitch et jamais d'une saisie.
 *
 * LIEN GLOBAL, PAS PAR TENANT, comme `user_discord_links` : une identité Twitch
 * ne change pas d'un tenant à l'autre. Le tenant reste porté par la récompense.
 */
export function resolveSiteUserFromTwitch(
  _twitchUserId: string
): IdentityResolution {
  return { ok: false, reason: 'IDENTITY_BACKEND_MISSING' };
}

/* -----------------------------------------------------------
 * Le direct, qui est la CLÉ anti-abus
 * ---------------------------------------------------------*/

/**
 * Identifiant du direct en cours, à mettre dans `source_ref`.
 *
 * POURQUOI PAS L'IDENTIFIANT DE L'ÉCHANGE. Le registre déclare
 * `refKind: 'stream'` pour cette source : « un seul drop par live ET par
 * personne ». Prendre l'identifiant de l'échange donnerait une clé unique PAR
 * ÉCHANGE — donc autant de drops que la spectatrice peut en réclamer dans la
 * soirée. La limite anti-abus n'est pas un compteur applicatif, c'est le choix
 * de ce qu'on met dans `source_ref` ; se tromper ici la supprime en silence.
 *
 * `<broadcaster>:<début du direct>` plutôt qu'un identifiant de stream Helix :
 * `fetchTwitchLiveStatus` rend `startedAt`, qui identifie déjà un direct de
 * façon stable pour une chaîne donnée, et évite un second appel Helix.
 *
 * `undefined` = Helix indisponible (transitoire, à réessayer) ; `null` = la
 * chaîne n'est pas en direct (rien à récompenser). Confondre les deux
 * transformerait une panne en décision.
 */
async function resolveLiveRef(
  broadcasterUserId: string,
  broadcasterLogin: string
): Promise<string | null | undefined> {
  const statuses = await fetchTwitchLiveStatus([broadcasterLogin]);
  if (!statuses) return undefined; // Twitch mal configuré ou injoignable.
  const status = statuses[broadcasterLogin.toLowerCase()];
  if (!status?.live || !status.startedAt) return null;
  return `${broadcasterUserId}:${status.startedAt}`;
}

/* -----------------------------------------------------------
 * Attribution
 * ---------------------------------------------------------*/

export type GrantOutcome = 'granted' | 'replayed' | 'unsupported' | 'error';

/**
 * Écrit le crédit, une fois et une seule.
 *
 * L'IDEMPOTENCE VIENT DU SCHÉMA, PAS D'UNE RELECTURE. `tcg_wallet_entries`
 * porte UNIQUE (tenant_id, user_id, source_kind, source_ref) : on écrit en
 * `upsert(..., { ignoreDuplicates: true })`, et le `.select()` chaîné ne rend
 * que les lignes RÉELLEMENT insérées (`ON CONFLICT DO NOTHING ... RETURNING`).
 * C'est ce qui distingue une première attribution d'un rejeu sans jamais relire
 * avant d'écrire — la relecture préalable étant la fenêtre qui a produit quatre
 * publications Discord en double le 2026-09-12.
 *
 * Séparée de `grantTwitchDrop` pour rester testable : la garde de schéma
 * ci-dessous empêche aujourd'hui tout appel réel, mais la mécanique
 * d'idempotence, elle, doit être prouvée dès maintenant.
 */
export async function writeDropEntry(input: {
  tenantId: string;
  userId: string;
  sourceRef: string;
}): Promise<GrantOutcome> {
  if (!supabaseAdmin) return 'error';

  const { data, error } = await supabaseAdmin
    .from('tcg_wallet_entries')
    .upsert(
      {
        tenant_id: input.tenantId,
        user_id: input.userId,
        amount: TWITCH_DROP_COINS,
        source_kind: EARN_SOURCE_KEY,
        source_ref: input.sourceRef,
        created_at: new Date().toISOString(),
      },
      {
        onConflict: 'tenant_id,user_id,source_kind,source_ref',
        ignoreDuplicates: true,
      }
    )
    .select('user_id');

  if (error) {
    const code = (error as { code?: string }).code ?? '';
    // 23514 (CHECK) / 23503 (clé étrangère) : la base REFUSE, et réessayer
    // donnera le même refus. On le distingue d'une panne pour ne pas condamner
    // Twitch à un retry perpétuel.
    if (code === '23514' || code === '23503') {
      logger.error(
        '[twitch/tcg-drop] écriture refusée par une contrainte (%s): %s',
        code,
        error.message
      );
      return 'unsupported';
    }
    logger.error('[twitch/tcg-drop] crédit impossible: %s', error.message);
    return 'error';
  }

  const inserted = (data ?? []) as Array<{ user_id: string }>;
  if (inserted.length === 0) return 'replayed';

  // Le solde est un cache du registre : il se RECALCULE, il ne s'incrémente
  // pas. Un incrément perdu creuse un écart définitif ; un recalcul se répare
  // au passage suivant.
  await refreshBalance(input.tenantId, input.userId);
  return 'granted';
}

/**
 * Récompense un drop, si et seulement si le schéma sait l'enregistrer.
 *
 * LA GARDE VIENT DU REGISTRE, PAS D'UNE CONSTANTE LOCALE.
 * `earnSources.ts` marque `twitch_drop` avec `schemaReady: false` tant que le
 * CHECK `tcg_wallet_entries_source_kind_check` n'admet pas cette valeur. Tenter
 * l'écriture quand même ferait rejeter l'INSERT par la base (23514) : on préfère
 * le dire ici plutôt que de le laisser découvrir en production.
 *
 * MIGRATION ATTENDUE, calquée sur `tcg_recycle_duplicates.sql` qui a déjà élargi
 * ce même CHECK pour `card_recycled` — élargir, jamais réécrire :
 *
 *   ALTER TABLE public.tcg_wallet_entries
 *     DROP CONSTRAINT IF EXISTS tcg_wallet_entries_source_kind_check;
 *   ALTER TABLE public.tcg_wallet_entries
 *     ADD CONSTRAINT tcg_wallet_entries_source_kind_check CHECK (
 *       source_kind IN ('match_win', 'scrim_win', 'booster_purchase',
 *                       'admin_grant', 'card_recycled', 'twitch_drop')
 *     );
 *
 * … puis basculer `schemaReady: true` dans `earnSources.ts`, ce qui allume cette
 * route sans la modifier.
 *
 * LE PAQUET (`packs: 1` au registre) N'EST PAS ÉCRIT ICI, et c'est délibéré.
 * `tcg_packs` n'a pas d'origine `drop` (CHECK `victory` | `purchase`) et, plus
 * gênant, aucune ANCRE D'IDEMPOTENCE pour ce cas : un paquet sans match a
 * `source_match_id NULL`, or deux NULL sont DISTINCTS dans une contrainte UNIQUE
 * — c'est exactement ce qui permet d'acheter plusieurs boosters, et c'est ce qui
 * laisserait un rejeu offrir un second paquet. Le livrer exigerait donc une
 * colonne `source_ref` sur `tcg_packs` plus un index UNIQUE partiel, pas
 * seulement un CHECK élargi. Cf. le rendu.
 */
export async function grantTwitchDrop(input: {
  tenantId: string;
  userId: string;
  sourceRef: string;
}): Promise<GrantOutcome> {
  const source = getEarnSource(EARN_SOURCE_KEY);
  if (!source?.schemaReady) {
    logger.warn(
      '[twitch/tcg-drop] source « %s » non acceptée par le schéma — aucune écriture',
      EARN_SOURCE_KEY
    );
    return 'unsupported';
  }
  return writeDropEntry(input);
}

/* -----------------------------------------------------------
 * Résolution du tenant
 * ---------------------------------------------------------*/

/**
 * Tenant propriétaire de la chaîne émettrice.
 *
 * PAS `resolveTenantId(req)` : celui-ci lit l'en-tête `x-tenant-id`, que Twitch
 * n'envoie évidemment pas — il retomberait sur le tenant par défaut et
 * créditerait les spectatrices d'une chaîne sur le compte d'un autre tenant.
 * `twitch_broadcaster_connections` (une ligne par tenant) est la seule source
 * qui relie un `broadcaster_id` à un tenant.
 *
 * `undefined` = erreur de lecture (à réessayer) ; `null` = chaîne réellement
 * inconnue. Un `if (error) return null` transformerait la panne en décision.
 */
async function resolveTenantForBroadcaster(
  broadcasterId: string
): Promise<string | null | undefined> {
  if (!supabaseAdmin) return undefined;
  const { data, error } = await supabaseAdmin
    .from('twitch_broadcaster_connections')
    .select('tenant_id')
    .eq('broadcaster_id', broadcasterId)
    .maybeSingle();

  if (error) {
    logger.error(
      '[twitch/tcg-drop] chaîne illisible: %s',
      (error as { message?: string }).message ?? String(error)
    );
    return undefined;
  }
  if (!data) return null;
  const tenantId = (data as { tenant_id?: unknown }).tenant_id;
  return typeof tenantId === 'string' && tenantId.length > 0
    ? tenantId
    : undefined;
}

/* -----------------------------------------------------------
 * Handler
 * ---------------------------------------------------------*/

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Une URL de webhook est publique : seau dédié, pour qu'un matraquage ne
  // consomme pas le quota des autres routes.
  if (
    applyRateLimit(
      req,
      res,
      { max: 600, windowMs: 60_000 },
      'twitch-eventsub-webhook'
    )
  ) {
    return;
  }

  // FAIL-CLOSED : sans secret, aucune signature n'est vérifiable. On refuse
  // plutôt que d'accepter une charge qui distribue des récompenses.
  const secret = process.env[SECRET_ENV];
  if (!secret) {
    logger.warn(
      `[twitch/tcg-drop] secret absent — livraison refusée (définir ${SECRET_ENV})`
    );
    return res.status(503).json({
      error: 'Webhook not configured',
      code: 'WEBHOOK_NOT_CONFIGURED',
    });
  }

  const messageId = header(req, 'twitch-eventsub-message-id');
  const timestamp = header(req, 'twitch-eventsub-message-timestamp');
  const signature = header(req, 'twitch-eventsub-message-signature');
  const rawType = header(req, 'twitch-eventsub-message-type');

  if (!messageId || !timestamp || !signature || !rawType) {
    return res.status(400).json({
      error: 'Missing Twitch EventSub headers',
      code: 'MISSING_HEADERS',
    });
  }

  const rawBody = await readRawBody(req);
  if (rawBody === null) {
    return res
      .status(413)
      .json({ error: 'Payload too large', code: 'PAYLOAD_TOO_LARGE' });
  }

  // ── Signature D'ABORD ────────────────────────────────────────────────────
  // Avant tout parsing, tout accès base, toute écriture : une charge non
  // authentifiée ne doit atteindre aucune logique métier.
  const expected = computeTwitchSignature(
    secret,
    messageId,
    timestamp,
    rawBody
  );
  if (!constantTimeEqual(signature, expected)) {
    logger.warn('[twitch/tcg-drop] signature invalide — livraison refusée');
    return res
      .status(403)
      .json({ error: 'Invalid signature', code: 'INVALID_SIGNATURE' });
  }

  // Fenêtre anti-rejeu : une signature valide l'est pour toujours.
  const sentAt = Date.parse(timestamp);
  if (!Number.isFinite(sentAt)) {
    return res
      .status(400)
      .json({ error: 'Invalid timestamp', code: 'INVALID_TIMESTAMP' });
  }
  if (Math.abs(Date.now() - sentAt) > MAX_MESSAGE_AGE_MS) {
    logger.warn('[twitch/tcg-drop] message hors fenêtre — livraison refusée');
    return res
      .status(403)
      .json({ error: 'Message too old', code: 'STALE_MESSAGE' });
  }

  const parsedType = MessageTypeSchema.safeParse(rawType);
  if (!parsedType.success) {
    // Type inconnu mais SIGNÉ : c'est un ajout côté Twitch, pas une attaque. On
    // acquitte pour ne pas faire désactiver la souscription.
    return res.status(200).json({ ok: true, status: 'ignored_message_type' });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res
      .status(400)
      .json({ error: 'Invalid JSON', code: 'INVALID_JSON' });
  }

  // ── Poignée de main d'activation ─────────────────────────────────────────
  // Twitch n'active la souscription que si `challenge` revient TEL QUEL, en
  // texte brut. Le renvoyer en JSON échouerait en silence : la souscription
  // resterait « pending » et aucun event n'arriverait jamais.
  if (parsedType.data === 'webhook_callback_verification') {
    const parsed = VerificationSchema.safeParse(payload);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: 'Invalid challenge payload', code: 'INVALID_PAYLOAD' });
    }
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send(parsed.data.challenge);
  }

  // ── Révocation ───────────────────────────────────────────────────────────
  // Twitch prévient qu'il cesse d'envoyer (autorisation retirée, échecs en
  // série). Rien à réparer ici, mais la trace doit exister : sans elle, les
  // drops s'arrêteraient sans que personne ne sache pourquoi.
  if (parsedType.data === 'revocation') {
    logger.warn('[twitch/tcg-drop] souscription révoquée par Twitch');
    return res.status(200).json({ ok: true, status: 'revoked' });
  }

  const parsed = NotificationSchema.safeParse(payload);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid notification payload',
      code: 'INVALID_PAYLOAD',
      details: parsed.error.flatten(),
    });
  }

  // Extraction TYPÉE depuis le schéma : rien d'autre ne descend plus bas.
  const subscriptionType: string = parsed.data.subscription.type;
  const broadcasterId: string = parsed.data.event.broadcaster_user_id;
  const broadcasterLogin: string | null =
    parsed.data.event.broadcaster_user_login ?? null;
  const twitchUserId: string = parsed.data.event.user_id;

  if (subscriptionType !== DROP_SUBSCRIPTION_TYPE) {
    return res.status(200).json({ ok: true, status: 'ignored_event_type' });
  }

  if (!supabaseAdmin) {
    // Panne réellement transitoire : ici, et seulement ici, le retry a un sens.
    res.setHeader('Retry-After', '60');
    return res
      .status(503)
      .json({ error: 'Database unavailable', code: 'DATABASE_UNAVAILABLE' });
  }

  const tenantId = await resolveTenantForBroadcaster(broadcasterId);
  if (tenantId === undefined) {
    res.setHeader('Retry-After', '60');
    return res
      .status(503)
      .json({ error: 'Channel lookup failed', code: 'CHANNEL_LOOKUP_FAILED' });
  }
  if (tenantId === null) {
    // La souscription vise une chaîne qu'aucun tenant n'a connectée.
    return res.status(200).json({ ok: true, status: 'unknown_channel' });
  }

  const identity = resolveSiteUserFromTwitch(twitchUserId);
  if (!identity.ok) {
    // Le cas NOMINAL tant que la table de liaison n'existe pas. 200 : Twitch
    // n'a rien à réessayer, c'est chez nous qu'il manque quelque chose.
    logger.warn(
      '[twitch/tcg-drop] identité Twitch non résolue (%s) — aucune récompense',
      identity.reason
    );
    return res.status(200).json({
      ok: true,
      status: 'identity_not_linked',
      code: identity.reason,
    });
  }

  if (!broadcasterLogin) {
    // Sans login, pas de résolution du direct, donc pas de clé anti-abus. On
    // préfère ne rien donner plutôt que d'inventer une clé plus permissive.
    return res.status(200).json({ ok: true, status: 'live_unresolved' });
  }

  const liveRef = await resolveLiveRef(broadcasterId, broadcasterLogin);
  if (liveRef === undefined) {
    res.setHeader('Retry-After', '60');
    return res
      .status(503)
      .json({ error: 'Live lookup failed', code: 'LIVE_LOOKUP_FAILED' });
  }
  if (liveRef === null) {
    // Hors direct : un « drop de live » sans live n'a pas de sens, et n'aurait
    // aucune clé d'unicité stable.
    return res.status(200).json({ ok: true, status: 'not_live' });
  }

  const outcome = await grantTwitchDrop({
    tenantId,
    userId: identity.userId,
    sourceRef: liveRef,
  });

  if (outcome === 'error') {
    res.setHeader('Retry-After', '60');
    return res
      .status(503)
      .json({ error: 'Reward not granted', code: 'GRANT_FAILED' });
  }

  return res.status(200).json({ ok: true, status: outcome });
}
