// features/admin/stages/client.ts — chemins et appels typés des écrans de
// PHASE (`/api/admin/stages/[stageId]/**`) : fiche, équipes, poules, suisse,
// seeding, historique, lobbies FFA, opérations en masse — lot L10, vague
// client 2.
//
// Les ÉCRITURES qui passaient par `useIdempotentMutation` (file hors ligne,
// `BgSyncQueuedError`) y restent : ce module ne leur fournit que leurs
// chemins (`stageUrls`).
//
// `lobbyUrls` : lobbies FFA appelés DEPUIS la gestion des lobbies d'une
// phase. Le domaine « lobbies » a son propre écran ; ces chemins restent ici
// tant que les deux n'ont pas été rapprochés.

const S = '/api/admin/stages';
const enc = encodeURIComponent;

export const stageUrls = {
  byId: (id: string) => `${S}/${enc(id)}`,
  teams: (id: string) => `${S}/${enc(id)}/teams`,
  groups: (id: string) => `${S}/${enc(id)}/groups`,
  generateGroupMatches: (id: string) =>
    `${S}/${enc(id)}/generate-group-matches`,
  standings: (id: string) => `${S}/${enc(id)}/standings`,
  standingsCsv: (id: string) => `${S}/${enc(id)}/standings?export=csv`,
  swiss: (id: string) => `${S}/${enc(id)}/swiss`,
  swissStatus: (id: string) => `${S}/${enc(id)}/swiss-status`,
  generateSwissRound: (id: string) => `${S}/${enc(id)}/generate-swiss-round`,
  completionStatus: (id: string) => `${S}/${enc(id)}/completion-status`,
  history: (id: string, params: URLSearchParams) =>
    `${S}/${enc(id)}/history?${params.toString()}`,
  autoByes: (id: string) => `${S}/${enc(id)}/auto-byes`,
  autoSeed: (id: string) => `${S}/${enc(id)}/auto-seed`,
  manualSeed: (id: string) => `${S}/${enc(id)}/manual-seed`,
  ratingSeed: (id: string) => `${S}/${enc(id)}/rating-seed`,
  /** `qs` : chaîne de requête sans `?` (vide = aucune). */
  seedingPreview: (id: string, qs = '') =>
    `${S}/${enc(id)}/seeding-preview${qs ? `?${qs}` : ''}`,
  ratingSeedingPreview: (id: string, params: URLSearchParams) =>
    `${S}/${enc(id)}/rating-seeding-preview?${params.toString()}`,
  clone: (id: string) => `${S}/${enc(id)}/clone`,
  advance: (id: string) => `${S}/${enc(id)}/advance`,
  bulkMatches: (id: string) => `${S}/${enc(id)}/bulk-matches`,
  lobbies: (id: string) => `${S}/${enc(id)}/lobbies`,
};

export const lobbyUrls = {
  byId: (id: string) => `/api/admin/lobbies/${enc(id)}`,
  placements: (id: string) => `/api/admin/lobbies/${enc(id)}/placements`,
};
