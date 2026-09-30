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
import { TeamInfoPatchBody } from '../../../features/player/team/schemas';
import { ScrimBroadcastPreviewQuery } from '../../../features/player/demandes/schemas';
import {
  PlanningIdQuery,
  ScrimIdQuery,
} from '../../../features/player/scrims/schemas';

export const PLAYER_FEATURE_BODY_SCHEMAS: Record<string, ApiContractEntry> = {
  'player.teams.toggle-joinable.body': {
    schema: ToggleJoinableBody,
    io: 'input',
  },
  'player.teams.toggle-scrim-open.body': {
    schema: ToggleScrimOpenBody,
    io: 'input',
  },
  'player.team.patch.body': {
    schema: TeamInfoPatchBody,
    io: 'input',
  },
  // P13 — scrims
  'player.teams.scrim-plannings.planning-id.query': {
    schema: PlanningIdQuery,
    io: 'input',
  },
  'player.scrims.report.query': { schema: ScrimIdQuery, io: 'input' },
  // Demande de scrim groupée — aperçu des destinataires.
  'player.demandes.scrim-broadcast.query': {
    schema: ScrimBroadcastPreviewQuery,
    io: 'input',
  },
};
