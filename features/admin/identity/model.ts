// features/admin/identity/model.ts — les réponses de `/api/admin/identity/**`, lues par la page
// owner « Comptes et connexion » du site (recopié par la synchronisation).

import type {
  IdentityAuthSettings,
  IdentityOwnerAccount,
  IdentityOwnerOverview,
} from '../../../utils/identity';

export type IdentityStaffWithoutTwoFactor = {
  staffId: string;
  displayName: string | null;
  role: string;
};

export type IdentityOverview = {
  /** `false` : Supabase est encore la source, ou la base de Better Auth ne répond pas. */
  available: boolean;
  /** `false` : la migration add_auth_settings.sql n'est pas appliquée (valeurs par défaut). */
  settingsStored: boolean;
  settings: IdentityAuthSettings | null;
  stats: IdentityOwnerOverview | null;
  staff: {
    active: number;
    withoutTwoFactor: IdentityStaffWithoutTwoFactor[];
  };
  /** Ce qui ne se règle pas depuis la page, pour mémoire. */
  fixed: {
    staffMfaEnforced: boolean;
    tokenMinutes: number;
    sessionCacheSeconds: number;
    settingsDelaySeconds: number;
    signInAttemptsPerFiveMinutes: number;
  };
};

export type IdentitySettingsResult = { settings: IdentityAuthSettings };

export type IdentityAccountsResult = { accounts: IdentityOwnerAccount[] };

export type IdentityAccountActionResult =
  | { action: 'revoke_sessions'; revoked: number }
  | { action: 'remove_two_factor'; hadTwoFactor: boolean; revoked: true }
  | { action: 'resend_verification'; sent: boolean };

export type IdentitySignOutEveryoneResult = { revoked: number };
