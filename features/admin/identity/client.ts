// features/admin/identity/client.ts — la page owner « Comptes et connexion » parle à
// `/api/admin/identity/**` (conference-api, features/admin/identity).

import { adminRequest } from '@/utils/admin/adminHttp';
import type {
  IdentityAccountActionResult,
  IdentityAccountsResult,
  IdentityOverview,
  IdentitySettingsResult,
  IdentitySignOutEveryoneResult,
} from './model';

const BASE = '/api/admin/identity';

export type IdentitySettings = NonNullable<IdentityOverview['settings']>;
export type IdentitySettingsPatch = Partial<
  Omit<IdentitySettings, 'updatedAt'>
>;
export type IdentityStats = NonNullable<IdentityOverview['stats']>;
export type IdentityAccount = IdentityAccountsResult['accounts'][number];
export type IdentityAccountAction = IdentityAccountActionResult['action'];

export const identityClient = {
  overview: () => adminRequest<IdentityOverview>(BASE),
  saveSettings: (patch: IdentitySettingsPatch) =>
    adminRequest<IdentitySettingsResult>(BASE, {
      method: 'PUT',
      json: patch,
      idempotent: true,
    }),
  findAccounts: (q: string) =>
    adminRequest<IdentityAccountsResult>(
      `${BASE}/accounts?q=${encodeURIComponent(q)}`
    ),
  act: (userId: string, action: IdentityAccountAction) =>
    adminRequest<IdentityAccountActionResult>(
      `${BASE}/accounts/${encodeURIComponent(userId)}`,
      { method: 'POST', json: { action }, idempotent: true }
    ),
  signOutEveryone: (confirm: string) =>
    adminRequest<IdentitySignOutEveryoneResult>(`${BASE}/sign-out-everyone`, {
      method: 'POST',
      json: { confirm },
      idempotent: true,
    }),
};
