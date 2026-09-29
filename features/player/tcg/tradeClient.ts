// features/player/tcg/tradeClient.ts — appels typés de l'écran « Échanges de
// cartes » (lot P14). Routes « soi seulement » : aucune portée `?as=`.
//
// Les gestes portent une `Idempotency-Key` : elle S'AJOUTE aux gardes en base
// (`tcg_propose_trade`, `tcg_accept_trade`, écritures conditionnelles), jamais
// l'inverse. Une erreur HTTP lève `PlayerHttpError` (`code` stable).

import { playerRequest } from '@/utils/player/playerHttp';
import type {
  Box,
  ListState,
  MyCard,
  Partner,
  Settings,
  TradeCardView,
  TradeView,
} from './tradeModel';

const BASE = '/api/player/tcg/trades';

export const tradeUrls = {
  trades: BASE,
  trade: (id: string) => `${BASE}/${encodeURIComponent(id)}`,
  settings: `${BASE}/settings`,
  partners: `${BASE}/partners`,
  cards: `${BASE}/cards`,
  blocks: `${BASE}/blocks`,
};

export const tradeClient = {
  settings: () => playerRequest<Settings>(tradeUrls.settings),
  setTrading: (acceptsProposals: boolean) =>
    playerRequest<{
      acceptsProposals: boolean;
      cancelled?: { received: number; sent: number };
    }>(tradeUrls.settings, {
      method: 'PUT',
      json: { acceptsProposals },
      idempotent: true,
    }),
  list: (box: Box, state: ListState, cursor: string | null) => {
    const params = new URLSearchParams({ box, state });
    if (cursor) params.set('cursor', cursor);
    return playerRequest<{ trades: TradeView[]; nextCursor: string | null }>(
      `${tradeUrls.trades}?${params.toString()}`
    );
  },
  partners: () => playerRequest<{ partners: Partner[] }>(tradeUrls.partners),
  myCards: () => playerRequest<{ cards: MyCard[] }>(tradeUrls.cards),
  partnerCards: (userId: string) =>
    playerRequest<{ cards: TradeCardView[] }>(
      `${tradeUrls.cards}?userId=${encodeURIComponent(userId)}`
    ),
  propose: (body: {
    recipientId: string;
    offered: Array<{ kind: string; id: string }>;
    requested: Array<{ kind: string; id: string }>;
  }) =>
    playerRequest<{ trade: { id: string; expiresAt: string } }>(
      tradeUrls.trades,
      { method: 'POST', json: body, idempotent: true }
    ),
  act: (tradeId: string, action: 'accept' | 'decline' | 'cancel') =>
    playerRequest<{ trade: { id: string; status: string }; replayed: boolean }>(
      tradeUrls.trade(tradeId),
      { method: 'POST', json: { action }, idempotent: true }
    ),
  block: (userId: string) =>
    playerRequest<{ blocked: string }>(tradeUrls.blocks, {
      method: 'POST',
      json: { userId },
      idempotent: true,
    }),
};
