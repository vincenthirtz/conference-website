// utils/botPlayerActions.ts
//
// Liste runtime des actions joueuses tracees — CONSTANTE PURE, sans dependance
// serveur.
//
// Extraite de `utils/botPlayerLogs.ts` parce que ce module-la importe
// `supabaseAdmin` : le journal Discord de `/admin/logs`, qui ne veut que la
// liste pour son dropdown, embarquait de ce fait le client service-role et ses
// polyfills Node dans le bundle client. `utils/botPlayerLogs.ts` re-exporte la
// constante et le type : cote serveur, rien ne change.

// Liste runtime des actions joueuses tracees — SOURCE UNIQUE : `PlayerAction`
// en derive, et le dropdown du journal Discord (/admin/logs ?tab=discord) la
// consomme telle quelle.
export const PLAYER_ACTIONS = [
  'create_team',
  'update_team',
  'invite_create',
  'invite_accept',
  'invite_reject',
  'invite_cancel',
  'kick_member',
  'transfer_captain',
  'leave_team',
  'register_team',
  'checkin',
  'report_score',
  'attach_evidence',
  'update_profile',
] as const;

export type PlayerAction = (typeof PLAYER_ACTIONS)[number];
