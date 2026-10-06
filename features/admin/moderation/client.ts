// features/admin/moderation/client.ts — appels typés des onglets de
// /admin/moderation (L10) : commentaires, litiges, blacklists, support.
//
// Les créations passées par `useIdempotentMutation` (file hors ligne) gardent
// ce chemin : on n'expose que leur URL (`moderationPaths`). Idem pour les
// listes paginées lues par `useAdminResource` (debounce, pagination, UI
// optimiste), qui ne prend qu'une URL.

import { adminRequest } from '@/utils/admin/adminHttp';

export type TicketSeverity = 'low' | 'medium' | 'high';
export type TicketCategory = 'dispute' | 'behavior' | 'technical' | 'other';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketSource = 'web' | 'discord_bot';
export type TicketReportedTargetType = 'player' | 'team' | 'org';

export type SupportTicket = {
  id: string;
  tournament_id: string | null;
  reporter_name: string | null;
  reporter_email: string | null;
  is_anonymous: boolean;
  category: TicketCategory;
  severity: TicketSeverity;
  subject: string | null;
  message: string;
  status: TicketStatus;
  resolved_at: string | null;
  resolution_note: string | null;
  source: TicketSource | null;
  discord_user_id: string | null;
  discord_username: string | null;
  reported_target_type: TicketReportedTargetType | null;
  reported_target_name: string | null;
  reported_battle_tag: string | null;
  converted_player_blacklist_id: string | null;
  converted_entity_blacklist_id: string | null;
  created_at: string;
  updated_at: string;
  /** Absents tant que la migration d'assignation n'est pas appliquée. */
  assigned_staff_id?: string | null;
  assigned_at?: string | null;
  assigned_to?: StaffBrief | null;
};

export type StaffBrief = { id: string; display_name: string | null };

export type AssignmentResponse = {
  assignment: {
    id: string;
    assigned_staff_id: string | null;
    assigned_at: string | null;
    assigned_to: StaffBrief | null;
  };
};

export type ConvertBlacklistResponse = {
  kind: 'player' | 'entity';
  entry: { id: string };
  ticket_id: string;
};

export type SupportTicketsResponse = {
  /** `false` : migration d'assignation absente (boutons masqués). */
  assignment_available?: boolean;
  tickets?: SupportTicket[];
  total?: number;
  counts?: {
    total?: number | string;
    open?: number | string;
    high_severity?: number | string;
    resolved?: number | string;
  };
};

/** Résultat de « Notifier la personne » (null si non demandé). */
export type ReporterNotification = {
  email: 'sent' | 'failed' | 'no_address';
  discord: 'unavailable' | 'no_account';
};

export type SupportTicketUpdateBody = {
  status: TicketStatus;
  resolution_note?: string;
  notify_reporter?: boolean;
};

export type SupportTicketUpdateResponse = {
  ticket: SupportTicket;
  notification?: ReporterNotification | null;
};

const BL = '/api/admin/moderation/blacklist';
const EBL = '/api/admin/moderation/entity-blacklist';
const TICKETS = '/api/admin/support/tickets';

export const moderationPaths = {
  comments: '/api/admin/comments',
  disputes: '/api/admin/disputes',
  blacklist: BL,
  entityBlacklist: EBL,
  convertTicket: (ticketId: string) =>
    `${TICKETS}/${encodeURIComponent(ticketId)}/convert-blacklist`,
} as const;

export type BlacklistAlertsPage<A> = {
  alerts?: A[];
  nextCursor?: string | null;
};

export type BlacklistNotesPatch = {
  reason?: string | null;
  notes?: string | null;
};

export const moderationClient = {
  // --- Commentaires
  updateComment: (id: string, content: string) =>
    adminRequest(moderationPaths.comments, {
      method: 'PATCH',
      json: { id, content },
      idempotent: true,
    }),
  deleteComment: (id: string) =>
    adminRequest(moderationPaths.comments, {
      method: 'DELETE',
      json: { id },
      idempotent: true,
    }),

  // --- Blacklist joueurs
  blacklistAlerts: <A>(query: string) =>
    adminRequest<BlacklistAlertsPage<A>>(`${BL}/alerts?${query}`),
  setBlacklistActive: (id: string, active: boolean) =>
    adminRequest(`${BL}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      json: { active },
      idempotent: true,
    }),
  updateBlacklistNotes: (id: string, patch: BlacklistNotesPatch) =>
    adminRequest<BlacklistNotesPatch>(`${BL}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      json: patch,
      idempotent: true,
    }),
  deleteBlacklist: (id: string) =>
    adminRequest(`${BL}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      idempotent: true,
    }),

  // --- Blacklist entités (équipes, organisations)
  setEntityBlacklistActive: (id: string, active: boolean) =>
    adminRequest(`${EBL}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      json: { active },
      idempotent: true,
    }),
  updateEntityBlacklist: <R>(id: string, patch: Record<string, unknown>) =>
    adminRequest<R>(`${EBL}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      json: patch,
      idempotent: true,
    }),
  deleteEntityBlacklist: (id: string) =>
    adminRequest(`${EBL}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      idempotent: true,
    }),

  // --- Support
  tickets: (query: string) =>
    adminRequest<SupportTicketsResponse>(`${TICKETS}?${query}`),
  updateTicket: (id: string, body: SupportTicketUpdateBody) =>
    adminRequest<SupportTicketUpdateResponse>(
      `${TICKETS}/${encodeURIComponent(id)}`,
      { method: 'PATCH', json: body, idempotent: true }
    ),
  /** « Je prends » / « Libérer ». 409 si déjà pris par quelqu'un d'autre. */
  assignTicket: (id: string, action: 'claim' | 'release') =>
    adminRequest<AssignmentResponse>(
      `${TICKETS}/${encodeURIComponent(id)}/assign`,
      { method: 'POST', json: { action }, idempotent: true }
    ),
};
