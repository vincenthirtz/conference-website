// features/admin/circuit-partners/client.ts — candidatures à l'offre
// partenaire des circuits (onglet « À traiter » de /admin/onboarding), L10.

import type { z } from 'zod';
import { adminRequest } from '@/utils/admin/adminHttp';
import type { DecisionBody } from './schemas';

const BASE = '/api/admin/circuit-partners';

export type CircuitApplicationStatus =
  | 'new'
  | 'reviewing'
  | 'approved'
  | 'rejected';

export type CircuitApplication = {
  id: string;
  created_at: string;
  organization_name: string;
  contact_name: string;
  email: string;
  game: string;
  format: 'feminin' | 'mixte';
  season_start: string | null;
  expected_teams: number | null;
  website: string | null;
  community_url: string | null;
  existing_tenant_slug: string | null;
  message: string;
  commits_code_of_conduct: boolean;
  commits_safety_lead: boolean;
  status: CircuitApplicationStatus;
  admin_notes: string | null;
  granted_tenant_id: string | null;
  granted_tenant_slug: string | null;
  granted_plan: string | null;
  granted_until: string | null;
};

export type CircuitApplicationList = {
  items: CircuitApplication[];
  counts: Record<CircuitApplicationStatus, number>;
};

export type CircuitDecision = z.input<typeof DecisionBody>;

export const circuitPartnersClient = {
  list: (status: CircuitApplicationStatus | 'all') =>
    adminRequest<CircuitApplicationList>(
      status === 'all' ? BASE : `${BASE}?status=${status}`
    ),
  decide: (id: string, body: CircuitDecision) =>
    adminRequest(`${BASE}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      json: body,
      idempotent: true,
    }),
};
