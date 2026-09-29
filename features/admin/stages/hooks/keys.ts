// features/admin/stages/hooks/keys.ts — clés de cache des écrans de phase
// (lot L10). Toutes sous `['admin', 'stages', <id>, …]` : invalider
// `stageKeys.one(id)` relit tout ce qui dépend d'une phase.

import { adminKey } from '../../_shared/query';

export const stageKeys = {
  all: adminKey('stages'),
  one: (id: string) => [...stageKeys.all, id] as const,
  part: (id: string, ...parts: unknown[]) =>
    [...stageKeys.one(id), ...parts] as const,
};
