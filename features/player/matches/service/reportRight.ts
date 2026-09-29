// features/player/matches/service/reportRight.ts — point d'entrée du module
// joueur vers LA règle « qui déclare le score » (lot P12). Le cœur vit dans
// utils/matches/reportRight.ts, partagé avec la route bot
// `/api/bot/v1/matches/{matchId}/report`.

export {
  decideReportingSide,
  loadReportableTeamIds,
  mayReportFor,
  REPORT_BOTH_SIDES,
  REPORT_CLOSED_STATUSES,
  REPORTING_TEAM_ROLE,
  ReportRightLookupError,
  type ReportDecision,
} from '@/utils/matches/reportRight';
