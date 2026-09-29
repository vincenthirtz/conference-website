// pages/api/player/matches/[matchId].ts — module features/player/matches (docs/PLAN-industrialisation-joueur.md, P12).

export { default } from '@/features/player/matches/routes/detail';
export type {
  PlayerMatchDetail,
  ScoreReportState,
} from '@/features/player/matches/schemas';
