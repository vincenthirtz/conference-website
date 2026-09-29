// pages/api/player/matches.ts — module features/player/matches (docs/PLAN-industrialisation-joueur.md, P12).

export { default } from '@/features/player/matches/routes/list';
export type {
  PlayerMatch,
  PlayerMatchesPayload,
} from '@/features/player/matches/schemas';
