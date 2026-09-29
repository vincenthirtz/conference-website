// features/player/tcg/schemas.ts — corps des routes TCG de la joueuse (lot P4).
//
// Zod seul. Importé par les routes `pages/api/player/tcg/*` en chemin RELATIF
// tant qu'elles ne sont pas migrées (`@/features/player/` marque une route
// migrée), par le registre OpenAPI (lib/apiContracts) et, demain, le client.
//
// Les routes TCG renvoient un `code` STABLE par refus (`missing_pack`,
// `invalid_body`…) que l'interface traduit : elles passent ce code et leur
// message historique à `parseBody` — un échec de schéma rend donc exactement
// la réponse d'avant, `fields` en plus.

import { z } from 'zod';
import { looseUuid, stringOrIgnored } from '../_shared/zod';

/** POST /api/player/tcg/packs (ouverture) — refus `missing_pack`. */
export const OpenPackBody = z.object({
  packId: z.string().min(1),
});
export type OpenPackInput = z.infer<typeof OpenPackBody>;

const cardRef = z.object({
  packId: z.string().min(1),
  position: z.number().int(),
});

/** POST /api/player/tcg/recycle — refus `missing_card`. */
export const RecycleCardBody = z.object({
  packId: z.string().min(1),
  position: z.number().int().min(0),
});
export type RecycleCardInput = z.infer<typeof RecycleCardBody>;

/** POST /api/player/tcg/forge : 1 à 10 cartes — refus `invalid_body`. */
export const ForgeBody = z.object({
  cards: z.array(cardRef).min(1).max(10),
});
export type ForgeInput = z.infer<typeof ForgeBody>;

/** POST / DELETE /api/player/tcg/trades/blocks — refus `invalid_body`. */
export const TradeBlockBody = z.object({
  userId: looseUuid('Joueuse invalide.').transform((v) => v.toLowerCase()),
});
export type TradeBlockInput = z.infer<typeof TradeBlockBody>;

/**
 * POST /api/player/tcg/cosmetics (achat). La clé est résolue par
 * `planCosmeticPurchase` (catalogue, solde) : `unknown_cosmetic` → 400.
 */
export const BuyCosmeticBody = z.object({
  key: z.unknown().optional(),
});
export type BuyCosmeticInput = z.infer<typeof BuyCosmeticBody>;

/**
 * PATCH /api/player/tcg/cosmetics (équiper). Seules les clés PRÉSENTES sont
 * appliquées ; `null` = rendu par défaut — refus `invalid_body`.
 */
export const EquipCosmeticsBody = z.object({
  frame: z.string().nullable().optional(),
  background: z.string().nullable().optional(),
});
export type EquipCosmeticsInput = z.infer<typeof EquipCosmeticsBody>;

/**
 * POST /api/player/tcg/photo. Décodé et vérifié par `decodeImagePayload`
 * (codes stables `Photo refusée.`) : sa forme n'est pas figée ici.
 */
export const TcgPhotoBody = z.object({
  data: z.unknown().optional(),
  mimeType: z.unknown().optional(),
});
export type TcgPhotoInput = z.infer<typeof TcgPhotoBody>;

/**
 * POST /api/player/tcg/fanart. Champs textuels tolérants (un non-texte est
 * traité comme vide) ; bornes, licence et URL vérifiées par la route, un
 * `code` par champ (`title`, `artist_name`, `licence`, `artist_url`).
 */
export const FanartSubmitBody = z.object({
  data: z.unknown().optional(),
  mimeType: z.unknown().optional(),
  title: stringOrIgnored(z.string()),
  artistName: stringOrIgnored(z.string()),
  artistUrl: stringOrIgnored(z.string()),
  licenceAccepted: z.unknown().optional(),
});
export type FanartSubmitInput = z.infer<typeof FanartSubmitBody>;

/**
 * PUT /api/player/tcg/showcase (lot P14) — refus `invalid_body`. Les clés de
 * carte sont ensuite vérifiées une à une (`invalid_card`) puis contre la
 * possession (`not_owned`) par le service.
 */
/**
 * `MAX_SHOWCASE_CARDS` (utils/tcg/showcase.ts) RECOPIÉ, à dessein : ce module
 * est lu par le navigateur, et l'util traîne `supabaseAdmin` avec lui. La
 * parité est tenue par tests/unit/tcgShowcase.test.ts.
 */
export const SHOWCASE_MAX_CARDS = 3;

export const ShowcaseBody = z.object({
  enabled: z.boolean(),
  cards: z.array(z.string()).max(SHOWCASE_MAX_CARDS),
});
export type ShowcaseInput = z.infer<typeof ShowcaseBody>;

/** GET /api/player/tcg/welcome-gift — le cadeau reçu, s'il y en a un. */
export type PlayerWelcomeGift = {
  coins: number;
  receivedAt: string;
};

export type PlayerWelcomeGiftResponse = {
  gift: PlayerWelcomeGift | null;
  /**
   * Le cadeau d'accueil SUPPORTRICE est-il réclamable par ce compte ?
   * Calculé par `grantSelfWelcome({ dryRun: true })`, donc avec exactement
   * les conditions du chemin d'écriture.
   */
  welcomeClaimable: boolean;
};

/** POST /api/player/tcg/welcome-gift — `status` suffit à la carte pour brancher. */
export type PlayerWelcomeClaimResponse =
  | { status: 'granted'; coins: number; packGranted: boolean }
  | { status: 'already' | 'not_eligible' | 'on_roster' };
