// features/admin/demandes/client.ts — appels typés des écrans demandes (lot
// L10) : liste, fiche, et les gestes staff repris par les vues joueuse /
// capitaine. Les URLs de l'API vivent ICI, plus dans les pages.
//
// La LISTE /admin/demandes reste rendue côté serveur (filtres dans l'URL,
// relecture par `router.replace`) : ce module ne lui fournit que ses gestes.

import { adminRequest } from '@/utils/admin/adminHttp';
import type { RegistrationField } from '@/utils/registrationFields';
import type { getDemande } from './service/demandes';

const BASE = '/api/admin/demandes';
const enc = encodeURIComponent;

export type DemandeDetail = Awaited<ReturnType<typeof getDemande>>;

export type DemandeStatusUpdate = {
  ids: string[];
  newStatus: 'approved' | 'rejected';
  staffComment?: string | null;
  battleTagOverrides?: Record<string, string>;
};

export type DemandesListQuery = {
  userId?: string;
  teamId?: string;
  type?: string;
  status?: string;
  includeTeam?: boolean;
  limit?: number;
};

function listUrl(q: DemandesListQuery): string {
  // Ordre des paramètres identique aux anciens appels (cibles d'e2e).
  const parts: string[] = [];
  if (q.userId) parts.push(`userId=${enc(q.userId)}`);
  if (q.teamId) parts.push(`teamId=${enc(q.teamId)}`);
  if (q.type) parts.push(`type=${q.type}`);
  if (q.status) parts.push(`status=${q.status}`);
  if (q.includeTeam) parts.push('includeTeam=1');
  if (q.limit) parts.push(`limit=${q.limit}`);
  return parts.length ? `${BASE}?${parts.join('&')}` : BASE;
}

export const demandesPaths = {
  list: BASE,
  /** Export CSV (téléchargement direct, repli `window.location`). */
  csv: (params: URLSearchParams) => `${BASE}?${params.toString()}`,
  byId: (id: string) => `${BASE}/${enc(id)}`,
  notifyCaptains: (id: string) => `${BASE}/${enc(id)}/notify-captains`,
  forwardScrim: '/api/admin/scrims/forward',
  tournament: (id: string) => `/api/admin/tournament/${enc(id)}`,
} as const;

export const demandesClient = {
  list: <T>(q: DemandesListQuery) =>
    adminRequest<{ demandes?: T[] }>(listUrl(q)),
  get: <T = DemandeDetail>(id: string) =>
    adminRequest<{ demande: T }>(demandesPaths.byId(id)),
  updateStatus: ({
    ids,
    newStatus,
    staffComment,
    battleTagOverrides,
  }: DemandeStatusUpdate) =>
    adminRequest<{ updatedCount: number }>(BASE, {
      method: 'POST',
      json: {
        action: 'updateStatus',
        demandeIds: ids,
        newStatus,
        ...(staffComment !== undefined ? { staffComment } : {}),
        ...(battleTagOverrides && Object.keys(battleTagOverrides).length > 0
          ? { battleTagOverrides }
          : {}),
      },
    }),
  requestMoreInfo: (demandeId: string, note: string) =>
    adminRequest(BASE, {
      method: 'POST',
      json: { action: 'requestMoreInfo', demandeId, note },
    }),
  notifyCaptains: (id: string) =>
    adminRequest<{ message?: string }>(demandesPaths.notifyCaptains(id), {
      method: 'POST',
    }),
  forwardScrim: (demandeId: string, targetTeamId: string) =>
    adminRequest<{ targetTeam?: { name?: string } }>(
      demandesPaths.forwardScrim,
      { method: 'POST', json: { demandeId, targetTeamId } }
    ),
  /** Champs d'inscription du tournoi (lecture best-effort). */
  tournamentFields: (tournamentId: string) =>
    adminRequest<{
      tournament?: { registration_fields?: RegistrationField[] | null };
    }>(demandesPaths.tournament(tournamentId)),
};
