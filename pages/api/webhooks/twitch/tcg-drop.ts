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
import { earnReward, getEarnSource } from '@/utils/tcg/earnSources';
import { grantCoinsThenPacks } from '@/utils/tcg/grantCoinsThenPacks';
import { findAuthUserIdByTwitchUserId } from '@/utils/auth/twitchLinks';
import { getDiscordLinkForUser } from '@/utils/discordLinks';
import { emitBotEvent } from '@/utils/botEvents';
import { absoluteSiteUrl } from '@/utils/siteUrl';
import {
  getValidBroadcasterToken,
  helixFetch,
  hasScope,
} from '@/utils/twitchBroadcaster';
import { sendTwitchChatMessage } from '@/utils/twitchChat';

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
    /**
     * LA RÉCOMPENSE ÉCHANGÉE. Elle décide si l'événement nous concerne : sans
     * ce champ, toute récompense de la chaîne déclencherait un drop. Optionnel
     * au schéma parce qu'une charge amputée ne doit pas faire échouer la
     * vérification de signature — l'absence est traitée plus bas comme « pas
     * la bonne récompense », donc sans attribution.
     */
    reward: z
      .object({ id: z.string().min(1).max(200).optional() })
      .partial()
      .optional(),
  }),
});

/**
 * Révocation : Twitch annonce qu'il CESSE d'envoyer.
 *
 * POURQUOI VALIDER UNE CHARGE DONT ON NE FAIT « RIEN ». Le message porte
 * `subscription.status` — `authorization_revoked` (la chaîne a retiré son
 * accord), `user_removed` (le compte a disparu), `notification_failures_exceeded`
 * (nos réponses ont échoué trop souvent). Ces trois causes appellent des gestes
 * OPPOSÉS : reconnecter la chaîne, ne rien faire, ou réparer le récepteur.
 * Acquitter sans lire le statut laissait « les drops se sont arrêtés » sans
 * jamais dire lequel des trois s'est produit.
 *
 * Tout est optionnel : une charge amputée ne doit pas empêcher d'acquitter.
 * Twitch réessaie ce qu'il ne voit pas acquitté, et une révocation rejouée en
 * boucle n'apporterait rien de plus.
 */
const RevocationSchema = z.object({
  subscription: z
    .object({
      id: z.string().max(200).optional(),
      status: z.string().max(100).optional(),
      type: z.string().max(100).optional(),
      condition: z
        .object({
          broadcaster_user_id: z.string().max(64).optional(),
          reward_id: z.string().max(200).optional(),
        })
        .partial()
        .optional(),
    })
    .partial()
    .optional(),
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
  | { ok: false; reason: 'IDENTITY_NOT_LINKED' | 'IDENTITY_LOOKUP_FAILED' };

/**
 * Compte du site correspondant à un identifiant Twitch.
 *
 * LA SOURCE EST `user_twitch_links`, ALIMENTÉE PAR OAUTH — jamais une saisie.
 * Se rabattre sur le pseudo Twitch DÉCLARÉ (`user_metadata.twitch`, miroité
 * dans `team_members.twitch`) serait une faute : il est auto-déclaré et jamais
 * vérifié, donc n'importe qui pourrait inscrire le pseudo d'une autre et
 * encaisser ses récompenses. Un webhook signé qui distribue sur une identité
 * non prouvée ne vaut pas mieux qu'un webhook sans signature.
 *
 * TROIS ISSUES, PAS DEUX, et la distinction compte :
 *   - lien trouvé → on attribue ;
 *   - AUCUN lien (`IDENTITY_NOT_LINKED`) → cas nominal d'une spectatrice qui
 *     n'a pas rattaché son compte : on acquitte en 200, Twitch n'a rien à
 *     réessayer ;
 *   - LECTURE EN ÉCHEC (`IDENTITY_LOOKUP_FAILED`) → ce n'est PAS une absence de
 *     lien. Traiter les deux pareil ferait perdre des drops en silence pendant
 *     une panne de base. L'appelant demande un réessai.
 *
 * LIEN GLOBAL, PAS PAR TENANT, comme `user_discord_links` : une identité Twitch
 * ne change pas d'un tenant à l'autre. Le tenant reste porté par la récompense.
 */
export async function resolveSiteUserFromTwitch(
  twitchUserId: string
): Promise<IdentityResolution> {
  const userId = await findAuthUserIdByTwitchUserId(twitchUserId);
  if (userId === undefined) {
    return { ok: false, reason: 'IDENTITY_LOOKUP_FAILED' };
  }
  if (userId === null) {
    return { ok: false, reason: 'IDENTITY_NOT_LINKED' };
  }
  return { ok: true, userId };
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
 * Ce qu'un drop a produit.
 *
 * `packId` n'est renseigné que sur `granted` ET si le paquet a réellement été
 * inséré. `granted` avec `packId: null` est un état POSSIBLE et DIT : les
 * pièces sont écrites, le paquet a été refusé (cf. `grantCoinsThenPacks`). On
 * ne le masque pas, et on ne le rattrape pas par un réessai — un rejeu ne rend
 * aucune ligne au porte-monnaie, donc n'accorderait rien, par construction.
 */
export type DropGrant = {
  outcome: GrantOutcome;
  packId: string | null;
  /** Pièces créditées par CET appel (0 hors `granted`). */
  coins: number;
};

/**
 * Écrit le crédit ET le paquet, une fois et une seule.
 *
 * L'IDEMPOTENCE VIENT DU SCHÉMA, PAS D'UNE RELECTURE. `tcg_wallet_entries`
 * porte UNIQUE (tenant_id, user_id, source_kind, source_ref), avec
 * `source_ref` = le DIRECT : les pièces s'écrivent en `ON CONFLICT DO NOTHING
 * ... RETURNING`, qui ne rend que les lignes RÉELLEMENT insérées. C'est ce qui
 * distingue une première attribution d'un rejeu sans jamais relire avant
 * d'écrire — la relecture préalable étant la fenêtre qui a produit quatre
 * publications Discord en double le 2026-09-12.
 *
 * LE PAQUET SUIT LE PORTE-MONNAIE, JAMAIS L'INVERSE. Un paquet de drop n'a pas
 * de match (`source_match_id` NULL), donc `tcg_packs` n'offre aucune unicité
 * exploitable : deux NULL sont DISTINCTS. Il n'est accordé qu'à la ligne que le
 * RETURNING a rendue — un retry de Twitch ne rend rien, donc n'accorde rien.
 * Toute la mécanique vit dans `grantCoinsThenPacks`, partagée avec la série de
 * check-ins et le palmarès : une seule copie d'un ordre d'écriture qu'une
 * inversion suffirait à rendre multiplicateur.
 *
 * POURQUOI PAS LE MATCH EN COURS COMME ANCRE. Prêter un match au drop le ferait
 * entrer en collision avec le paquet de victoire du même match (même
 * `tcg_packs_one_per_match`) : la spectatrice qui joue ce match perdrait l'une
 * des deux récompenses. D'où l'origine `drop`, sans match
 * (`tcg_earn_sources_drop_streak_placement.sql`).
 */
export async function writeDropEntry(input: {
  tenantId: string;
  userId: string;
  sourceRef: string;
}): Promise<DropGrant> {
  if (!supabaseAdmin) return { outcome: 'error', packId: null, coins: 0 };

  // Le barème vient du REGISTRE : montant ET nombre de paquets.
  const reward = earnReward(EARN_SOURCE_KEY);

  const result = await grantCoinsThenPacks({
    tenantId: input.tenantId,
    walletSourceKind: EARN_SOURCE_KEY,
    packSourceKind: 'drop',
    grants: [
      {
        userId: input.userId,
        sourceRef: input.sourceRef,
        coins: reward.coins,
        packs: reward.packs,
      },
    ],
  });

  if (!result.ok) {
    // 23514 (CHECK) / 23503 (clé étrangère) : la base REFUSE, et réessayer
    // donnera le même refus. On le distingue d'une panne pour ne pas condamner
    // Twitch à un retry perpétuel.
    return {
      outcome: result.reason === 'rejected' ? 'unsupported' : 'error',
      packId: null,
      coins: 0,
    };
  }

  const credit = result.credited[0];
  if (!credit) return { outcome: 'replayed', packId: null, coins: 0 };

  if (reward.packs > 0 && credit.packIds.length === 0) {
    // Pièces écrites, paquet refusé : on ne rend PAS `error`. Un 503 ferait
    // retenter Twitch, le retry tomberait sur `replayed` et la demande ne
    // serait jamais honorée — le pire des deux mondes. On honore ce qui a été
    // donné, et l'annonce dit `pack: null`.
    logger.error(
      '[twitch/tcg-drop] drop crédité SANS paquet pour %s (direct %s)',
      input.userId,
      input.sourceRef
    );
  }

  return {
    outcome: 'granted',
    packId: credit.packIds[0] ?? null,
    coins: credit.coins,
  };
}

/**
 * Récompense un drop, si et seulement si le schéma sait l'enregistrer.
 *
 * LA GARDE VIENT DU REGISTRE, PAS D'UNE CONSTANTE LOCALE. `earnSources.ts`
 * marque chaque source d'un `schemaReady` ; tenter l'écriture d'une source
 * que le CHECK n'admet pas ferait rejeter l'INSERT par la base (23514) : on
 * préfère le dire ici plutôt que de le laisser découvrir en production.
 *
 * Historique : les pièces sont écrites depuis le 2026-09-13
 * (`tcg_twitch_drop.sql`) ; le PAQUET depuis le 2026-09-15
 * (`tcg_earn_sources_drop_streak_placement.sql`, qui ajoute l'origine `drop`
 * aux DEUX contraintes de `tcg_packs`). Tant que cette migration n'est pas
 * appliquée, le paquet est refusé et le drop part en pièces seules,
 * `pack: null` — exactement le comportement d'avant, jamais une régression.
 */
export async function grantTwitchDrop(input: {
  tenantId: string;
  userId: string;
  sourceRef: string;
}): Promise<DropGrant> {
  const source = getEarnSource(EARN_SOURCE_KEY);
  if (!source?.schemaReady) {
    logger.warn(
      '[twitch/tcg-drop] source « %s » non acceptée par le schéma — aucune écriture',
      EARN_SOURCE_KEY
    );
    return { outcome: 'unsupported', packId: null, coins: 0 };
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
/* -----------------------------------------------------------
 * Résolution de la demande — rendre ses points, ou honorer
 * ---------------------------------------------------------*/

/** Scope que la chaîne doit avoir accordé pour qu'on puisse résoudre. */
const REDEMPTIONS_MANAGE_SCOPE = 'channel:manage:redemptions';

/**
 * Marque une demande de points de chaîne comme honorée ou annulée.
 *
 * POURQUOI CETTE FONCTION EXISTE — un préjudice réel, pas un confort. Sans
 * elle, une spectatrice qui échange 10 000 points sans avoir rattaché son
 * compte perd ses points ET n'a pas de carte : le webhook acquittait poliment
 * en 200 et la demande restait « en attente » pour l'éternité. Twitch sait
 * rembourser — `CANCELED` rend les points — et la chaîne nous a accordé le
 * scope pour le faire.
 *
 * ON N'ANNULE PAS TOUT, et la nuance compte :
 *   - `granted`               → FULFILLED : la carte est donnée, c'est honoré ;
 *   - identité non rattachée,
 *     hors direct,
 *     récompense non configurée → CANCELED : elle a payé, elle n'a rien eu ;
 *   - `replayed`              → RIEN. La carte a déjà été donnée une fois ;
 *     rembourser offrirait la carte ET les points ;
 *   - autre récompense        → RIEN. Ce n'est pas la nôtre, on n'y touche pas ;
 *   - panne transitoire (503) → RIEN. Twitch réessaiera, annuler fermerait la
 *     porte à la seconde tentative.
 *
 * NE LÈVE JAMAIS, ET NE CHANGE JAMAIS LE SORT DE L'APPEL. Une annulation qui
 * échoue est ennuyeuse ; transformer pour autant une attribution réussie en 503
 * ferait rejouer tout le chemin à Twitch et pourrait distribuer deux fois. Le
 * pire cas ici est une demande qui reste en attente — exactement l'état
 * d'avant, donc jamais une régression.
 */
async function resolveRedemption(input: {
  tenantId: string;
  rewardId: string;
  redemptionId: string;
  status: 'FULFILLED' | 'CANCELED';
}): Promise<void> {
  if (!supabaseAdmin) return;
  try {
    const token = await getValidBroadcasterToken(supabaseAdmin, input.tenantId);
    if (!token) return;
    if (!hasScope(token.scope, REDEMPTIONS_MANAGE_SCOPE)) {
      logger.warn(
        '[twitch/tcg-drop] scope %s absent — demande %s laissée en attente',
        REDEMPTIONS_MANAGE_SCOPE,
        input.redemptionId
      );
      return;
    }

    const upstream = await helixFetch(
      token.accessToken,
      `/channel_points/custom_rewards/redemptions?broadcaster_id=${encodeURIComponent(
        token.broadcasterId
      )}&reward_id=${encodeURIComponent(
        input.rewardId
      )}&id=${encodeURIComponent(input.redemptionId)}`,
      { method: 'PATCH', body: JSON.stringify({ status: input.status }) }
    );

    if (!upstream.ok) {
      logger.warn(
        '[twitch/tcg-drop] résolution %s refusée (HTTP %s) pour %s',
        input.status,
        upstream.status,
        input.redemptionId
      );
      return;
    }
    logger.info(
      '[twitch/tcg-drop] demande %s → %s',
      input.redemptionId,
      input.status
    );
  } catch (err) {
    logger.warn('[twitch/tcg-drop] résolution impossible', err);
  }
}

/**
 * Dit au chat comment rattacher son compte, après un échange remboursé.
 *
 * SANS MENTIONNER PERSONNE. Annoncer « untel n'a pas rattaché son compte »
 * exposerait un échec individuel devant toute la chaîne — une aide qui
 * humilierait. Le message s'adresse au chat en général : celle qui vient de
 * cliquer se reconnaîtra, les autres y verront une information utile.
 *
 * BEST-EFFORT INTÉGRAL. Le remboursement, lui, a déjà eu lieu : c'est le geste
 * qui répare. Ce message n'est qu'une explication, et son échec ne doit rien
 * changer au sort de la requête.
 */
async function announceLinkNeeded(tenantId: string): Promise<void> {
  if (!supabaseAdmin) return;
  const result = await sendTwitchChatMessage(
    supabaseAdmin,
    tenantId,
    '🎴 Points remboursés : ce compte Twitch n’est pas encore relié au site. ' +
      'Tape /twitch sur le Discord de la Women’s Cup pour le rattacher, ' +
      'et ta prochaine carte arrivera.'
  );
  if (!result.sent) {
    logger.warn(
      '[twitch/tcg-drop] message de chat non envoyé (%s)',
      result.reason
    );
  }
}

export type BroadcasterBinding = {
  tenantId: string;
  /**
   * Récompense DÉSIGNÉE pour le drop, ou `null` si aucune.
   *
   * Lue dans la MÊME ligne que le tenant, à dessein : la condition de
   * l'abonnement EventSub et ce filtre doivent voir la même valeur, et deux
   * requêtes séparées pourraient les faire diverger le temps d'une écriture.
   */
  rewardId: string | null;
};

/**
 * La chaîne connectée derrière un identifiant Twitch de diffuseuse.
 *
 * `undefined` = lecture impossible (réessayer) ; `null` = aucune chaîne connue.
 * La distinction porte tout le comportement de la route : la première demande
 * un retry, la seconde s'acquitte.
 */
async function resolveBroadcasterBinding(
  broadcasterId: string
): Promise<BroadcasterBinding | null | undefined> {
  if (!supabaseAdmin) return undefined;
  const { data, error } = await supabaseAdmin
    .from('twitch_broadcaster_connections')
    .select('tenant_id, tcg_reward_id')
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

  const row = data as { tenant_id?: unknown; tcg_reward_id?: unknown };
  const tenantId = row.tenant_id;
  if (typeof tenantId !== 'string' || tenantId.length === 0) return undefined;

  return {
    tenantId,
    rewardId:
      typeof row.tcg_reward_id === 'string' && row.tcg_reward_id.length > 0
        ? row.tcg_reward_id
        : null,
  };
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
    // On LIT la charge au lieu de simplement acquitter : le statut dit laquelle
    // des trois causes s'applique, et elles appellent des gestes opposés
    // (cf. `RevocationSchema`). Sans lui, la régie savait seulement que « ça ne
    // marche plus ».
    const parsedRevocation = RevocationSchema.safeParse(payload);
    const sub = parsedRevocation.success
      ? parsedRevocation.data.subscription
      : undefined;

    logger.warn(
      '[twitch/tcg-drop] souscription révoquée par Twitch — statut=%s type=%s id=%s chaîne=%s récompense=%s',
      sub?.status ?? 'inconnu',
      sub?.type ?? 'inconnu',
      sub?.id ?? 'inconnu',
      sub?.condition?.broadcaster_user_id ?? 'inconnue',
      sub?.condition?.reward_id ?? 'inconnue'
    );

    // Le statut est RENDU dans la réponse : il n'apparaît nulle part ailleurs,
    // et un acquittement muet rendrait le diagnostic impossible depuis les
    // journaux de la fonction.
    return res.status(200).json({
      ok: true,
      status: 'revoked',
      reason: sub?.status ?? null,
    });
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
  // Pseudo de la SPECTATRICE, pour l'annonce seulement. Il se renomme, donc
  // rien ne s'y appuie pour décider d'un gain — c'est `twitchUserId` qui fait
  // foi (cf. `resolveSiteUserFromTwitch`).
  const twitchUserLogin: string | null = parsed.data.event.user_login ?? null;
  // Récompense échangée. `null` quand la charge ne la porte pas : traité comme
  // « pas la bonne », donc sans attribution — cf. le filtre plus bas.
  const rewardId: string | null = parsed.data.event.reward?.id ?? null;
  // Identifiant de la DEMANDE (pas de la récompense) : c'est lui qui permet de
  // rendre ses points à la spectatrice quand on ne peut rien lui attribuer.
  const redemptionId: string = parsed.data.event.id;

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

  const binding = await resolveBroadcasterBinding(broadcasterId);
  if (binding === undefined) {
    res.setHeader('Retry-After', '60');
    return res
      .status(503)
      .json({ error: 'Channel lookup failed', code: 'CHANNEL_LOOKUP_FAILED' });
  }
  if (binding === null) {
    // La souscription vise une chaîne qu'aucun tenant n'a connectée.
    return res.status(200).json({ ok: true, status: 'unknown_channel' });
  }
  const tenantId = binding.tenantId;

  // LE FILTRE DE RÉCOMPENSE — sans lui, TOUT échange de points donnerait une
  // carte : « mettre en avant mon message », un son, un emote. Une carte
  // offerte à quelqu'un qui ne l'a pas demandée, prise sur la même économie
  // que les victoires en match.
  //
  // L'abonnement EventSub porte déjà `condition.reward_id`, donc Twitch ne
  // devrait livrer que la bonne récompense. Ce contrôle est la SECONDE
  // ceinture : un abonnement recréé un jour sans condition — à la main, ou par
  // un script pressé — repasserait sinon en mode « tout donner » sans que rien
  // ne le signale.
  //
  // AUCUNE RÉCOMPENSE DÉSIGNÉE ⇒ ON N'ATTRIBUE RIEN. Le défaut sûr est de ne
  // rien donner ; accepter tout par défaut ferait de l'oubli de configuration
  // une distribution de cartes.
  if (!binding.rewardId) {
    logger.warn(
      '[twitch/tcg-drop] aucune récompense désignée pour la chaîne %s — rien attribué',
      broadcasterId
    );
    // Notre oubli de configuration, pas le sien : on lui rend ses points.
    // `rewardId` est celui de l'ÉVÉNEMENT (non nul ici, sinon on serait sorti
    // en `other_reward`) — on n'a pas de récompense désignée à comparer.
    if (rewardId) {
      await resolveRedemption({
        tenantId,
        rewardId,
        redemptionId,
        status: 'CANCELED',
      });
    }
    return res.status(200).json({ ok: true, status: 'reward_not_configured' });
  }
  if (rewardId !== binding.rewardId) {
    // Une autre récompense de la chaîne : ce n'est pas une erreur, juste un
    // événement qui ne nous concerne pas. 200, Twitch n'a rien à réessayer.
    return res.status(200).json({ ok: true, status: 'other_reward' });
  }

  const identity = await resolveSiteUserFromTwitch(twitchUserId);
  if (!identity.ok) {
    if (identity.reason === 'IDENTITY_LOOKUP_FAILED') {
      // Panne de lecture : surtout PAS un acquittement. Traiter une base
      // injoignable comme « pas de compte lié » ferait perdre des drops en
      // silence — une erreur n'est pas une absence.
      res.setHeader('Retry-After', '60');
      return res.status(503).json({
        error: 'Identity lookup failed',
        code: 'IDENTITY_LOOKUP_FAILED',
      });
    }
    // Cas NOMINAL : la spectatrice n'a pas rattaché son compte Twitch. 200 :
    // Twitch n'a rien à réessayer, il manque quelque chose de notre côté.
    logger.warn(
      '[twitch/tcg-drop] identité Twitch non résolue (%s) — aucune récompense',
      identity.reason
    );
    // LE CAS QUI JUSTIFIE TOUT CE MÉCANISME. Elle a dépensé ses points et
    // n'aura pas de carte, faute de compte rattaché. On lui rend ses points,
    // puis on dit dans le chat POURQUOI — sans quoi elle voit son échange
    // annulé sans explication, et conclut que la récompense est cassée.
    await resolveRedemption({
      tenantId,
      rewardId: binding.rewardId,
      redemptionId,
      status: 'CANCELED',
    });
    // SEUL cas où l'on parle dans le chat : c'est le seul où la personne peut
    // AGIR. « Hors direct » ou « récompense mal configurée » ne la regardent
    // pas, et l'inonder de messages qu'elle ne peut pas suivre serait pire que
    // le silence.
    await announceLinkNeeded(tenantId);
    return res.status(200).json({
      ok: true,
      status: 'identity_not_linked',
      code: identity.reason,
    });
  }

  if (!broadcasterLogin) {
    // Sans login, pas de résolution du direct, donc pas de clé anti-abus. On
    // préfère ne rien donner plutôt que d'inventer une clé plus permissive.
    await resolveRedemption({
      tenantId,
      rewardId: binding.rewardId,
      redemptionId,
      status: 'CANCELED',
    });
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
    // aucune clé d'unicité stable. Rien n'est attribué → on rend les points.
    await resolveRedemption({
      tenantId,
      rewardId: binding.rewardId,
      redemptionId,
      status: 'CANCELED',
    });
    return res.status(200).json({ ok: true, status: 'not_live' });
  }

  const grant = await grantTwitchDrop({
    tenantId,
    userId: identity.userId,
    sourceRef: liveRef,
  });
  const outcome = grant.outcome;

  if (outcome === 'error') {
    res.setHeader('Retry-After', '60');
    return res
      .status(503)
      .json({ error: 'Reward not granted', code: 'GRANT_FAILED' });
  }

  // SEULEMENT sur une attribution RÉELLE. `replayed` signifie que la contrainte
  // d'unicité a écarté un doublon — Twitch retente volontiers une livraison, et
  // renotifier à chaque tentative transformerait un incident réseau en spam de
  // messages privés. `unsupported` n'a rien attribué du tout.
  if (outcome === 'granted') {
    // La carte est donnée : la demande est HONORÉE. Sans ce marquage elle
    // resterait « en attente » dans le tableau de bord de la chaîne, où la
    // régie devrait la résoudre à la main après chaque drop.
    //
    // `replayed` ne passe PAS ici, à dessein : la demande d'origine a déjà été
    // marquée, et une seconde livraison du même événement ne doit ni renotifier
    // ni rembourser — ce serait offrir la carte et les points.
    await resolveRedemption({
      tenantId,
      rewardId: binding.rewardId,
      redemptionId,
      status: 'FULFILLED',
    });
    await announceTwitchDrop({
      tenantId,
      userId: identity.userId,
      twitchLogin: twitchUserLogin,
      coins: grant.coins,
      packId: grant.packId,
    });
    // `packGranted` n'est lu par personne chez Twitch : il sert le diagnostic
    // (journaux de la fonction), où un drop crédité sans paquet doit se voir.
    return res
      .status(200)
      .json({ ok: true, status: outcome, packGranted: grant.packId !== null });
  }

  return res.status(200).json({ ok: true, status: outcome });
}

/**
 * Émet `tcg.drop_granted` — le DM Discord qui annonce la carte réclamée.
 *
 * LE LIEN DISCORD EST RÉSOLU ICI, pas côté bot : le site est le seul à
 * connaître la correspondance compte ↔ Discord, et la lui laisser porter évite
 * au bot une requête par destinataire. Même choix que `announceNewPacks`.
 *
 * Une joueuse sans compte Discord lié n'est PAS une erreur : l'événement part
 * quand même avec `discordUserId: null`, et le consommateur décide — ici, pas
 * de canal, donc rien. Elle verra sa carte sur le site, et l'overlay l'aura
 * annoncée à l'antenne.
 *
 * NE LÈVE JAMAIS. On vient de créditer quelqu'un : une notification ratée ne
 * doit pas transformer une attribution réussie en 503, qui ferait retenter
 * Twitch et rejouer tout le chemin.
 */
async function announceTwitchDrop(input: {
  tenantId: string;
  userId: string;
  twitchLogin: string | null;
  coins: number;
  packId: string | null;
}): Promise<void> {
  try {
    const link = await getDiscordLinkForUser(input.userId);
    await emitBotEvent(
      'tcg.drop_granted',
      {
        userId: input.userId,
        discordUserId: link?.discordUserId ?? null,
        discordUsername: link?.discordUsername ?? null,
        twitchLogin: input.twitchLogin,
        coins: input.coins,
        // AJOUT RÉTROCOMPATIBLE (2026-09-15) : le paquet créé, ou `null` s'il
        // n'a pas pu l'être (pièces seules). Un bot plus ancien ignore le champ ;
        // un bot à jour dit « un paquet t'attend » seulement quand c'est vrai.
        // Contrat figé avec le bot : `{ id: string } | null`, rien d'autre.
        pack: input.packId ? { id: input.packId } : null,
        // Absolue : ce lien part dans un DM, où un chemin relatif est inerte.
        ctaUrl: absoluteSiteUrl('/player/tcg'),
      },
      input.tenantId
    );
  } catch (err) {
    logger.error('[twitch/tcg-drop] annonce non émise', err);
  }
}
