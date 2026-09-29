// features/player/tcg/tradeModel.ts — formes rendues par les routes
// d'échange et projections PURES de l'écran « Échanges de cartes » (lot P14,
// extraites de pages/player/tcg/echanges.tsx). Importable par `ui/` et
// `hooks/` : aucun appel réseau, aucune base.

import type { TcgCardSubject } from '@/components/tcg/TcgCard';
import type { GameMascotSlug } from '@/utils/tcg/gameMascots';
// Types SEULEMENT : effacés à la compilation. Importer le module lui-même ferait
// entrer `supabaseAdmin` dans le bundle navigateur.
import type { TradeCardView, TradeView } from '@/utils/tcg/trades';

export type { TradeCardView, TradeView };

export type Limits = {
  maxCardsPerSide: number;
  ttlHours: number;
  maxPendingSent: number;
  maxPendingReceived: number;
  declineCooldownHours: number;
  maxAcceptedPerDay: number;
  minAccountAgeDays: number;
  minCollectionAgeDays: number;
};

export type Settings = {
  acceptsProposals: boolean;
  eligible: boolean | null;
  eligibleAt: string | null;
  eligibilityReason: 'no_account' | 'no_collection' | 'too_recent' | null;
  limits: Limits;
  pending: { sent: number | null; received: number | null };
};

export type Partner = { userId: string; displayName: string };

export type MyCard = TradeCardView & {
  copies: number;
  tradeableCopies: number;
  available: number;
};

export type TradeLoadState = 'loading' | 'ready' | 'error';
export type Box = 'received' | 'sent';
export type ListState = 'open' | 'closed';

/**
 * Clé d'un sujet : même forme que `utils/tcg/subjectKey.ts`.
 *
 * LES CINQ TYPES. Ces trois fonctions ont longtemps traité `map` comme cas
 * final : tout sujet qu'elles ne nommaient pas devenait une carte de map au
 * slug `undefined`. Deux cartes mascotte partageaient alors la clé
 * `map:undefined` — même clé React, même identité pour la sélection : cocher
 * l'une cochait l'autre. Rien n'échouait. Discriminer explicitement.
 */
export function keyOf(card: TradeCardView): string {
  if (card.kind === 'player') return `player:${card.userId}`;
  if (card.kind === 'team') return `team:${card.teamId}`;
  if (card.kind === 'fanart') return `fanart:${card.fanartId}`;
  if (card.kind === 'mascot') return `mascot:${card.slug}`;
  return `map:${card.slug}`;
}

export function subjectRefOf(card: TradeCardView): {
  kind: string;
  id: string;
} {
  if (card.kind === 'player') return { kind: 'player', id: card.userId };
  if (card.kind === 'team') return { kind: 'team', id: card.teamId };
  if (card.kind === 'fanart') return { kind: 'fanart', id: card.fanartId };
  if (card.kind === 'mascot') return { kind: 'mascot', id: card.slug };
  return { kind: 'map', id: card.slug };
}

export function subjectOf(card: TradeCardView): TcgCardSubject {
  if (card.kind === 'player') {
    return {
      kind: 'player',
      userId: card.userId,
      displayName: card.displayName,
      imageUrl: card.imageUrl,
    };
  }
  if (card.kind === 'team') {
    return {
      kind: 'team',
      teamId: card.teamId,
      name: card.name,
      slug: card.slug,
      logoUrl: card.logoUrl,
      cardImageUrl: card.cardImageUrl,
      // `?? null` : une réponse antérieure au déploiement ne le porte pas.
      logoCredit: card.logoCredit ?? null,
    };
  }
  if (card.kind === 'fanart') {
    return {
      kind: 'fanart',
      fanartId: card.fanartId,
      // Le titre de l'œuvre EST son nom de carte ; son crédit la suit.
      name: card.title,
      imageUrl: card.imageUrl,
      artistName: card.artistName,
      artistUrl: card.artistUrl,
      category: card.category,
    };
  }
  if (card.kind === 'mascot') {
    return {
      kind: 'mascot',
      slug: card.slug as GameMascotSlug,
      name: card.name,
    };
  }
  return {
    kind: 'map',
    slug: card.slug,
    name: card.name,
    imageUrl: card.imageUrl,
  };
}

export function nameOf(card: TradeCardView): string | null {
  if (card.kind === 'player') return card.displayName;
  if (card.kind === 'fanart') return card.title;
  return card.name;
}

/**
 * Message traduit d'un refus : l'API rend un `code` STABLE, traduit ici par
 * la clé `err_<code>` du namespace `tcgTrade` ; inconnu ⇒ message générique.
 */
export function tradeErrorText(
  dict: { err_generic: string },
  code: unknown
): string {
  const key = `err_${typeof code === 'string' ? code : 'generic'}`;
  return (dict as unknown as Record<string, string>)[key] ?? dict.err_generic;
}
