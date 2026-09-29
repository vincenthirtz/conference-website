// pages/api/demandes/register-team.ts — module features/player/demandes (docs/PLAN-industrialisation-joueur.md, P11).

export { default } from '@/features/player/demandes/routes/registerTeam';
export type {
  TeamRegistrationBlocker,
  TeamRegistrationStatus,
} from '@/features/player/demandes/service/registerTeam';
