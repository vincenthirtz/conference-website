// lib/apiContracts/player/features.ts — schémas des routes joueuse MIGRÉES sur
// `defineSubjectRoute` (docs/PLAN-industrialisation-joueur.md, lot P3).
//
// Les schémas vivent dans leur module (`features/player/<domaine>/schemas.ts`,
// zod seul) : la route les applique, la spec les référence (`x-zod`,
// `x-zod-query`). `tests/unit/subjectRouteContracts.test.ts` vérifie que le
// schéma documenté est LE MÊME objet que celui de la route.
//
// Chemins relatifs, comme le reste de lib/apiContracts : l'assembleur tourne
// aussi dans le script de build (sans alias `@/`).

import type { ApiContractEntry } from '../index';
import {
  ToggleJoinableBody,
  ToggleScrimOpenBody,
} from '../../../features/player/teamSettings/schemas';

export const PLAYER_FEATURE_BODY_SCHEMAS: Record<string, ApiContractEntry> = {
  'player.teams.toggle-joinable.body': {
    schema: ToggleJoinableBody,
    io: 'input',
  },
  'player.teams.toggle-scrim-open.body': {
    schema: ToggleScrimOpenBody,
    io: 'input',
  },
};
