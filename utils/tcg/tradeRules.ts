// utils/tcg/tradeRules.ts
//
// Les RÈGLES des échanges de cartes : plafonds, délais, forme d'une
// proposition. Source unique — la fonction SQL les reçoit en paramètres
// (`tcg_propose_trade`, `tcg_accept_trade`) plutôt que de les recopier, et
// l'interface les lit dans la réponse de `GET /api/player/tcg/trades/settings`.
//
// PUR : aucune entrée-sortie, aucun import serveur. zod seulement.
//
// POURQUOI CES VALEURS (choix produit par défaut, les plus conservateurs) :
//
//   - CARTE CONTRE CARTE, À PARITÉ, 1 à 5 de chaque côté. La parité n'est pas
//     une coquetterie : sans elle, un compte secondaire céderait cinq cartes
//     contre une seule, c'est-à-dire un don déguisé vers un compte principal.
//     Cinq = la taille d'un paquet ; au-delà, une proposition devient un
//     inventaire qu'on accepte sans le lire.
//   - 72 H D'EXPIRATION : un week-end de tournoi, pas une semaine. Une
//     proposition qui traîne bloque des cartes (celles offertes ne peuvent pas
//     être promises ailleurs).
//   - 5 PROPOSITIONS EN ATTENTE ENVOYÉES, 10 REÇUES : on ne peut pas arroser
//     l'espace, et une boîte ne se remplit pas au point d'être illisible.
//   - UNE seule proposition en attente par paire (index unique en base).
//   - 24 H APRÈS UN REFUS avant de reproposer à la même personne : « non » ne
//     doit pas être une invitation à insister.
//   - 3 ÉCHANGES ACCEPTÉS PAR 24 H GLISSANTES, par personne : garde contre
//     l'aspiration de cartes par des comptes multiples (combinée à la parité).
//   - 14 JOURS D'ANCIENNETÉ DE COMPTE ET 7 DE COLLECTION (premier paquet
//     gagné) pour activer les échanges : un compte créé pour réclamer un
//     cadeau et vider aussitôt ses cartes vers un compte principal doit
//     attendre. Les deux, parce que chacune seule se contourne (un vieux compte
//     vide, une collection d'hier).
//   - SEULES LES CARTES DE PAQUETS QUI ONT COÛTÉ QUELQUE CHOSE s'échangent
//     (`TRADEABLE_PACK_SOURCES`, cf. le commentaire de la constante). C'est la
//     garde principale contre l'aspiration par comptes multiples — les autres
//     ne font que la ralentir.
//
// CES PLAFONDS SONT PAR COMPTE ET PORTÉS PAR LA BASE. `applyRateLimit` lit une
// IP que le client peut forger (`cf-connecting-ip`) : il limite le bruit, il ne
// protège de rien seul.

import { z } from 'zod';

export const TRADE_MAX_CARDS_PER_SIDE = 5;
export const TRADE_TTL_HOURS = 72;
export const TRADE_MAX_PENDING_SENT = 5;
export const TRADE_MAX_PENDING_RECEIVED = 10;
export const TRADE_DECLINE_COOLDOWN_HOURS = 24;
export const TRADE_MAX_ACCEPTED_PER_DAY = 3;
export const TRADE_MIN_ACCOUNT_AGE_DAYS = 14;
export const TRADE_MIN_COLLECTION_AGE_DAYS = 7;

/**
 * Origines de paquet dont les cartes sont ÉCHANGEABLES — miroir EXACT de
 * `tcg_pack_source_tradeable` (migration `tcg_card_trades.sql`), vérifié par un
 * test qui lit le SQL.
 *
 * Retour d'audit sécurité (2026-09-15) : le rôle `supporter` s'auto-attribue et
 * rapporte un paquet par compte, et un roster se gonfle de comptes secondaires
 * avant un 5e check-in. Rendre ces cartes transférables en ferait un filon.
 *   - échangeables : `victory` (match gagné), `placement` (classement figé),
 *     `purchase` (300 pièces gagnées — un cadeau n'y suffit pas seul), `trade`
 *     (une carte déjà échangée venait d'un paquet échangeable) ;
 *   - EXCLUES : `welcome` (cadeaux d'édition et supportrice), `streak` (payé
 *     aux titulaires, roster gonflable), `drop` (un compte Twitch est gratuit).
 */
export const TRADEABLE_PACK_SOURCES = [
  'victory',
  'placement',
  'purchase',
  'trade',
] as const;

export function isTradeablePackSource(source: string | null | undefined) {
  return (TRADEABLE_PACK_SOURCES as readonly string[]).includes(source ?? '');
}

/** Les plafonds tels que l'interface les affiche. */
export const TRADE_LIMITS = {
  maxCardsPerSide: TRADE_MAX_CARDS_PER_SIDE,
  ttlHours: TRADE_TTL_HOURS,
  maxPendingSent: TRADE_MAX_PENDING_SENT,
  maxPendingReceived: TRADE_MAX_PENDING_RECEIVED,
  declineCooldownHours: TRADE_DECLINE_COOLDOWN_HOURS,
  maxAcceptedPerDay: TRADE_MAX_ACCEPTED_PER_DAY,
  minAccountAgeDays: TRADE_MIN_ACCOUNT_AGE_DAYS,
  minCollectionAgeDays: TRADE_MIN_COLLECTION_AGE_DAYS,
} as const;

const UUID = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'uuid attendu'
  )
  .transform((s) => s.toLowerCase());

/**
 * Un SUJET de carte : joueuse, équipe ou fanart par UUID, map et mascotte par
 * slug. Même forme que les clés de `subjectKey.ts` (`<kind>:<id>`), en objet.
 *
 * LES CINQ TYPES, PAS TROIS. Cette union a longtemps listé joueuse / équipe /
 * map alors que la base connaissait déjà les fanarts, et les mascottes sont
 * arrivées après. Une carte absente d'ici n'est pas « non échangeable » de
 * façon lisible : elle est refusée en `invalid_body` par le schéma, ou en
 * `invalid_items` par la fonction SQL — deux messages qui parlent d'une
 * proposition malformée alors que la joueuse a simplement proposé une carte
 * qu'elle possède. Ajouter un type de carte impose de passer ici, dans
 * `subjectKey.ts`, et dans les deux fonctions `tcg_propose_trade` /
 * `tcg_accept_trade`.
 */
export const tradeSubjectSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('player'), id: UUID }).strict(),
  z.object({ kind: z.literal('team'), id: UUID }).strict(),
  z.object({ kind: z.literal('fanart'), id: UUID }).strict(),
  z
    .object({
      kind: z.literal('map'),
      id: z.string().regex(/^[a-z0-9-]{1,64}$/, 'slug de map attendu'),
    })
    .strict(),
  z
    .object({
      kind: z.literal('mascot'),
      id: z.string().regex(/^[a-z0-9-]{1,64}$/, 'slug de mascotte attendu'),
    })
    .strict(),
]);

export type TradeSubject = z.infer<typeof tradeSubjectSchema>;

export function tradeSubjectKey(s: TradeSubject): string {
  return `${s.kind}:${s.id}`;
}

/**
 * Corps de `POST /api/player/tcg/trades`.
 *
 * `.strict()` : un champ inconnu est un refus, pas un oubli silencieux. C'est
 * aussi ce qui ferme la porte à un `message`, un `coins` ou un `packId` qu'un
 * client glisserait dans la proposition — il n'existe AUCUN champ pour du texte
 * libre, de la monnaie ou un paquet fermé.
 */
export const proposeTradeSchema = z
  .object({
    recipientId: UUID,
    offered: z.array(tradeSubjectSchema).min(1).max(TRADE_MAX_CARDS_PER_SIDE),
    requested: z.array(tradeSubjectSchema).min(1).max(TRADE_MAX_CARDS_PER_SIDE),
  })
  .strict()
  .superRefine((body, ctx) => {
    if (body.offered.length !== body.requested.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['requested'],
        message: 'autant de cartes demandées que de cartes offertes',
      });
    }
    const offeredKeys = body.offered.map(tradeSubjectKey);
    const requestedKeys = body.requested.map(tradeSubjectKey);
    if (new Set(offeredKeys).size !== offeredKeys.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['offered'],
        message: 'une carte ne peut être offerte qu’une fois',
      });
    }
    if (new Set(requestedKeys).size !== requestedKeys.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['requested'],
        message: 'une carte ne peut être demandée qu’une fois',
      });
    }
    const offeredSet = new Set(offeredKeys);
    if (requestedKeys.some((k) => offeredSet.has(k))) {
      ctx.addIssue({
        code: 'custom',
        path: ['requested'],
        message: 'une même carte ne peut pas être offerte et demandée',
      });
    }
  });

export type ProposeTradeBody = z.infer<typeof proposeTradeSchema>;

/** Corps de `POST /api/player/tcg/trades/{tradeId}`. */
export const tradeActionSchema = z
  .object({ action: z.enum(['accept', 'decline', 'cancel']) })
  .strict();

/** Corps de `PUT /api/player/tcg/trades/settings`. */
export const tradeSettingsSchema = z
  .object({ acceptsProposals: z.boolean() })
  .strict();

export const tradeIdSchema = UUID;

export type TradeStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'cancelled'
  | 'expired';

/**
 * L'issue annoncée à la proposante (`tcg.trade_resolved`).
 *
 * `cancelled` n'est annoncé QUE lorsqu'il vient du système : une proposante qui
 * annule elle-même n'a pas besoin qu'on lui dise ce qu'elle vient de faire.
 */
export type TradeOutcome = 'accepted' | 'declined' | 'expired' | 'cancelled';

/** Motifs d'annulation, en miroir du CHECK `tcg_trades.resolution_reason`. */
export type TradeResolutionReason =
  | 'proposer_cancelled'
  | 'offered_unavailable'
  | 'card_unavailable'
  | 'trading_disabled';
