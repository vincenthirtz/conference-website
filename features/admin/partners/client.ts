// features/admin/partners/client.ts — appels typés des écrans partenaires et
// demandes de partenariat (lot L10). Les URLs de l'API vivent ICI, plus dans
// les pages ; les types de réponse sont ceux que rendent les services.

import { adminRequest } from '@/utils/admin/adminHttp';
import type { PartnerPayload } from './schemas';
import type {
  createPartner,
  getPartner,
  listPartners,
  listPartnershipRequests,
  updatePartner,
} from './service';

const PARTNERS = '/api/admin/partners';
const REQUESTS = '/api/admin/partnership-requests';

export type PartnerList = Awaited<ReturnType<typeof listPartners>>;
export type PartnerListRow = PartnerList['items'][number];
export type Partner = Awaited<ReturnType<typeof getPartner>>;
export type PartnerUpdated = Awaited<ReturnType<typeof updatePartner>>['row'];
export type PartnerCreated = Awaited<ReturnType<typeof createPartner>>;
export type PartnershipRequestList = Awaited<
  ReturnType<typeof listPartnershipRequests>
>;
export type PartnershipRequestListRow = PartnershipRequestList['items'][number];

/**
 * Fiche d'une demande (route héritée `partnership-requests/[id]`, sans
 * service : la forme est décrite ici, une seule fois).
 */
export type PartnershipRequest = {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  website: string | null;
  category: 'super' | 'major' | 'cultural' | 'other';
  message: string;
  budget_range: string | null;
  status: string;
  admin_notes: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
  read_at: string | null;
  contacted_at: string | null;
};

type Params = Record<string, string | number | null | undefined>;

/** Query string sans les filtres vides (même règle que `useAdminResource`). */
function withQuery(url: string, params: Params): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === '') continue;
    sp.set(k, String(v));
  }
  const qs = sp.toString();
  return qs ? `${url}?${qs}` : url;
}

const byId = (base: string, id: string) => `${base}/${encodeURIComponent(id)}`;

export type PartnerListParams = {
  limit: number;
  offset: number;
  category?: string;
  active?: string;
  search?: string;
};

export type PartnershipRequestListParams = {
  limit: number;
  offset: number;
  status?: string | null;
  category?: string | null;
  search?: string;
};

export const partnersClient = {
  list: ({ limit, offset, ...filters }: PartnerListParams) =>
    adminRequest<PartnerList>(
      withQuery(PARTNERS, { limit, offset, includeTotal: 1, ...filters })
    ),
  get: (id: string) => adminRequest<Partner>(byId(PARTNERS, id)),
  create: (body: PartnerPayload) =>
    adminRequest<PartnerCreated>(PARTNERS, {
      method: 'POST',
      json: body,
      idempotent: true,
    }),
  update: (id: string, patch: PartnerPayload) =>
    adminRequest<PartnerUpdated>(byId(PARTNERS, id), {
      method: 'PATCH',
      json: patch,
      idempotent: true,
    }),
  remove: (id: string) =>
    adminRequest<{ success: true }>(byId(PARTNERS, id), {
      method: 'DELETE',
      idempotent: true,
    }),
  /** URL de création, pour la modale restée sur `useIdempotentMutation`. */
  createUrl: PARTNERS,
};

export const partnershipRequestsClient = {
  list: ({ limit, offset, search, ...filters }: PartnershipRequestListParams) =>
    adminRequest<PartnershipRequestList>(
      withQuery(REQUESTS, {
        limit,
        offset,
        includeTotal: 1,
        search: search?.trim(),
        ...filters,
      })
    ),
  get: (id: string) => adminRequest<PartnershipRequest>(byId(REQUESTS, id)),
  update: (id: string, patch: { status: string; adminNotes: string }) =>
    adminRequest<PartnershipRequest>(byId(REQUESTS, id), {
      method: 'PATCH',
      json: patch,
      idempotent: true,
    }),
  remove: (id: string) =>
    adminRequest<unknown>(byId(REQUESTS, id), {
      method: 'DELETE',
      idempotent: true,
    }),
};
