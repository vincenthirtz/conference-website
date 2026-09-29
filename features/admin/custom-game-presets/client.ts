// features/admin/custom-game-presets/client.ts — presets de partie
// personnalisée (codes d'import) par jeu (L10).
//
// Les écritures restent sur `useIdempotentMutation` (une intention par type
// d'écriture) : ce module n'en expose que les chemins.

import { adminRequest } from '@/utils/admin/adminHttp';

const BASE = '/api/admin/custom-game-presets';
const enc = encodeURIComponent;

export const presetsPaths = {
  list: BASE,
  byId: (id: string) => `${BASE}/${enc(id)}`,
} as const;

export type CustomGamePreset = {
  id: string;
  tenant_id: string;
  game: string;
  tournament_id: string | null;
  stage_id: string | null;
  name: string;
  import_code: string;
  description: string | null;
  map_pool: unknown;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
};

export type PresetStageOption = { id: string; name: string };

export const presetsClient = {
  list: (game: string) =>
    adminRequest<{ presets?: CustomGamePreset[] }>(`${BASE}?game=${enc(game)}`),
  /** Phases d'un tournoi, pour le sélecteur de périmètre. */
  tournamentStages: (tournamentId: string) =>
    adminRequest<{ stages?: PresetStageOption[] }>(
      `/api/admin/tournament/${enc(tournamentId)}/stages`
    ),
};
