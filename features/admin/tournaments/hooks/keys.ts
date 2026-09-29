// features/admin/tournaments/hooks/keys.ts — clés de cache des écrans du
// tournoi (lot L10). Toutes sous `['admin', 'tournaments', …]` : invalider
// `tournamentKeys.one(id)` relit tout ce qui dépend d'un tournoi.

import { adminKey } from '../../_shared/query';

export const tournamentKeys = {
  all: adminKey('tournaments'),
  templates: () => [...tournamentKeys.all, 'templates'] as const,
  one: (id: string) => [...tournamentKeys.all, 'one', id] as const,
  detail: (id: string) => [...tournamentKeys.one(id), 'detail'] as const,
  part: (id: string, ...parts: unknown[]) =>
    [...tournamentKeys.one(id), ...parts] as const,
};

/** Lecture « au montage seulement », comme avant la migration. */
export const MOUNT_ONLY = {
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const;
