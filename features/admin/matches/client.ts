// features/admin/matches/client.ts — fiche match, édition, draft (L10).
//
// LES GESTES DE JOUR DE MATCH RESTENT SUR `useIdempotentMutation` (file hors
// ligne, `BgSyncQueuedError`) : ouverture de litige, étapes du draft. Ce
// module n'en expose que les chemins (`matchesPaths`).

import type { MatchGameRow } from '@/components/admin/matches/MatchGamesPanel';
import type { MvpPollData } from '@/features/admin/matches/ui/MatchEditAside';
import type { Match, StageMini, TeamMini, TournamentMini } from '@/types/admin';
import { adminRequest } from '@/utils/admin/adminHttp';

const MATCHES = '/api/admin/matches';
const enc = encodeURIComponent;
const byId = (id: string) => `${MATCHES}/${enc(id)}`;

export const matchesPaths = {
  byId,
  dispute: (id: string) => `${byId(id)}/dispute`,
  evidence: (id: string) => `${byId(id)}/evidence`,
  drafts: (id: string) => `${byId(id)}/drafts`,
  draftStep: (
    id: string,
    gameIndex: number,
    step: 'side' | 'start' | 'commit' | 'auto-pick'
  ) => `${byId(id)}/drafts/${gameIndex}/${step}`,
} as const;

export type MatchWithGames = Match & { games?: MatchGameRow[] | null };

export type MatchDetail = {
  match: MatchWithGames;
  tournament: TournamentMini | null;
  stage: StageMini | null;
  team1: TeamMini | null;
  team2: TeamMini | null;
};

/** Réponse d'un PUT méta / score (optimistic locking). */
export type MatchUpdateResponse = {
  match?: { updated_at?: string | null };
  warnings?: string[];
  keptOngoing?: boolean;
};

export type MatchHistoryLog = {
  id: string;
  created_at: string;
  staff_id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  payload: Record<string, unknown> | null;
  staff: { display_name: string | null; role: string | null } | null;
  readableAction: string;
  readableEntity: string | null;
  date: string;
};

/**
 * Proposition de forfait posée par le cron de check-in (miroir client de
 * `ForfeitProposal`, utils/matches/forfeitProposal.ts — module serveur).
 */
export type MatchForfeitProposal = {
  matchId: string;
  status: 'pending' | 'confirmed' | 'declined' | 'overridden';
  absentTeamId: string | null;
  proposedWinnerTeamId: string | null;
  proposedAt: string | null;
  resolvedAt: string | null;
  resolvedByStaffId: string | null;
};

export type MatchForfeitProposalView = {
  /** `false` tant que la migration n'est pas appliquée. */
  available: boolean;
  proposal: MatchForfeitProposal | null;
};

export type LineupPlayer = {
  team_id: string;
  user_id: string | null;
  battle_tag: string | null;
  role: string | null;
  is_substitute: boolean;
};

export type TeamLineup = {
  teamId: string;
  teamName: string | null;
  open: boolean;
  closedReason: 'not_in_match' | 'match_over' | 'awaiting_checkin' | null;
  status: 'draft' | 'validated';
  validatedAt: string | null;
  validatedByKind: 'team' | 'admin' | null;
  players: LineupPlayer[];
};

export type CastMemberLite = {
  id: string;
  name: string;
  auth_user_id: string | null;
  image_url: string | null;
};

/** Les trois formes que la liste des casters a portées selon les versions. */
export type CastMembersResponse =
  | { items?: CastMemberLite[]; castMembers?: CastMemberLite[] }
  | CastMemberLite[]
  | null;

export type CastAssignment = {
  id: string;
  match_id: string;
  cast_member_id: string;
  briefing_at: string;
  briefing_reminder_sent_at: string | null;
  created_at: string;
  cast_member: CastMemberLite | null;
};

export type MatchMvp = MvpPollData & { poll?: { winner_member_id?: string } };

export const matchesClient = {
  detail: (id: string) =>
    adminRequest<MatchDetail>(`${byId(id)}?includeGames=1`),
  /** Lecture légère (sans parties) : sert à relire `updated_at`. */
  meta: (id: string) =>
    adminRequest<{ match?: { updated_at?: string | null } }>(byId(id)),
  update: (id: string, body: Record<string, unknown>) =>
    adminRequest<MatchUpdateResponse>(byId(id), {
      method: 'PUT',
      json: body,
      idempotent: true,
    }),
  /** Parties (maps) — route non admin, même jeton. */
  saveGames: (id: string, body: Record<string, unknown>) =>
    adminRequest(`/api/matches/${enc(id)}/games`, {
      method: 'PUT',
      json: body,
      idempotent: true,
    }),
  mapPool: (id: string) =>
    adminRequest<{ maps?: { name: string }[] }>(`${byId(id)}/map-pool`),
  veto: (id: string) =>
    adminRequest<{ isComplete?: boolean }>(`${byId(id)}/veto`),

  resolveDispute: (id: string, body: Record<string, unknown>) =>
    adminRequest(matchesPaths.dispute(id), {
      method: 'PATCH',
      json: body,
      idempotent: true,
    }),
  cancelDispute: (id: string) =>
    adminRequest(`${matchesPaths.dispute(id)}?resumeStatus=pending`, {
      method: 'DELETE',
      idempotent: true,
    }),

  /** Preuves d'un litige — forme décrite par la modale qui les affiche. */
  evidence: <T>(id: string) => adminRequest<T>(matchesPaths.evidence(id)),

  history: (id: string) =>
    adminRequest<{ logs?: MatchHistoryLog[] }>(`${byId(id)}/history`),

  forfeitProposal: (id: string) =>
    adminRequest<MatchForfeitProposalView>(`${byId(id)}/forfeit-proposal`),
  decideForfeitProposal: (id: string, decision: 'confirm' | 'decline') =>
    adminRequest(`${byId(id)}/forfeit-proposal`, {
      method: 'POST',
      json: { decision },
      idempotent: true,
    }),

  lineups: (id: string) =>
    adminRequest<{ lineups?: TeamLineup[] }>(`${byId(id)}/lineup`),
  lineupAction: (id: string, body: Record<string, unknown>) =>
    adminRequest(`${byId(id)}/lineup`, {
      method: 'POST',
      json: body,
      idempotent: true,
    }),

  castAssignments: (id: string) =>
    adminRequest<{ assignments?: CastAssignment[] }>(
      `${byId(id)}/cast-assignments`
    ),
  castMembers: () =>
    adminRequest<CastMembersResponse>(
      '/api/admin/cast-members?limit=200&includeInactive=true'
    ),
  addCastAssignment: (
    id: string,
    body: { castMemberId: string; briefingAt: string }
  ) =>
    adminRequest(`${byId(id)}/cast-assignments`, {
      method: 'POST',
      json: body,
      idempotent: true,
    }),
  rescheduleCastAssignment: (
    id: string,
    assignmentId: string,
    briefingAt: string
  ) =>
    adminRequest(`${byId(id)}/cast-assignments/${enc(assignmentId)}`, {
      method: 'PATCH',
      json: { briefingAt },
      idempotent: true,
    }),
  removeCastAssignment: (id: string, assignmentId: string) =>
    adminRequest(`${byId(id)}/cast-assignments/${enc(assignmentId)}`, {
      method: 'DELETE',
      idempotent: true,
    }),

  mvp: (id: string) => adminRequest<MatchMvp>(`${byId(id)}/mvp`),
  setMvp: (id: string, winnerMemberId: string) =>
    adminRequest(`${byId(id)}/mvp`, {
      method: 'POST',
      json: { winnerMemberId },
      idempotent: true,
    }),
  clearMvp: (id: string) =>
    adminRequest(`${byId(id)}/mvp`, { method: 'DELETE', idempotent: true }),
};
