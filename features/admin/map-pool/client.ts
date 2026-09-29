// features/admin/map-pool/client.ts — pool de cartes par jeu (L10).
//
// Les écritures restent sur `useIdempotentMutation` (une intention par type
// d'écriture) : ce module n'en expose que les chemins.

import { adminRequest } from '@/utils/admin/adminHttp';

const BASE = '/api/admin/map-pool';

export const mapPoolPaths = {
  list: BASE,
  byId: (id: string) => `${BASE}/${encodeURIComponent(id)}`,
  importDefaults: `${BASE}/import-defaults`,
} as const;

export type MapPoolEntry = {
  id: string;
  tenant_id: string;
  game: string;
  map_name: string;
  map_type: string | null;
  image_url: string | null;
  enabled: boolean;
  order_index: number | null;
  created_at?: string;
  updated_at?: string;
};

export const mapPoolClient = {
  list: (game: string) =>
    adminRequest<{ game: string; maps?: MapPoolEntry[] }>(
      `${BASE}?game=${encodeURIComponent(game)}`
    ),
};
