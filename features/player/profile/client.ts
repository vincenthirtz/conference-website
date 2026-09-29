// features/player/profile/client.ts — appels typés de l'écran « Mon profil »
// (lot P9). Les URLs vivent ici.
//
// Routes « soi seulement » (`subject: 'self'`) : aucune portée `?as=` n'est
// posée — une inspection staff les recevrait en 403 `subject_unsupported`.
//
// `accountAuth` regroupe les gestes Supabase Auth du navigateur (changement
// d'e-mail / de mot de passe, rafraîchissement et fin de session) : la
// ré-authentification par le mot de passe actuel reste la garde de chacun.

import { supabaseClient } from '@/utils/supabaseBrowser';
import { playerRequest } from '@/utils/player/playerHttp';
import type {
  DeleteAccountResponse,
  TwitchSourceResponse,
  UpdateProfileResponse,
} from './schemas';

export const profileUrls = {
  profile: '/api/player/update-profile',
  dataExport: '/api/player/data-export',
  deleteAccount: '/api/player/delete-account',
};

export const profileClient = {
  twitchSource: () => playerRequest<TwitchSourceResponse>(profileUrls.profile),
  update: (body: Record<string, unknown>) =>
    playerRequest<UpdateProfileResponse>(profileUrls.profile, {
      method: 'PATCH',
      json: body,
      idempotent: true,
    }),
  /** L'export JSON tel que servi (le fichier est recomposé à l'identique). */
  dataExport: () => playerRequest<unknown>(profileUrls.dataExport),
  deleteAccount: () =>
    playerRequest<DeleteAccountResponse>(profileUrls.deleteAccount, {
      method: 'DELETE',
      idempotent: true,
    }),
};

/** Erreur de ré-authentification : le mot de passe actuel est faux. */
export class WrongCurrentPasswordError extends Error {
  constructor() {
    super('wrong_current_password');
    this.name = 'WrongCurrentPasswordError';
  }
}

async function reauthenticate(email: string, password: string) {
  const { error } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw new WrongCurrentPasswordError();
}

export const accountAuth = {
  refreshSession: () => supabaseClient.auth.refreshSession(),
  /**
   * Ré-authentifie PUIS demande le changement : une session détournée (JWT en
   * localStorage) ne doit pas pouvoir remplacer l'e-mail en silence.
   */
  changeEmail: async (
    currentEmail: string,
    currentPassword: string,
    newEmail: string
  ) => {
    await reauthenticate(currentEmail, currentPassword);
    const { error } = await supabaseClient.auth.updateUser({ email: newEmail });
    if (error) throw error;
  },
  /** Ré-authentifie PUIS change le mot de passe. */
  changePassword: async (
    currentEmail: string,
    currentPassword: string,
    newPassword: string
  ) => {
    await reauthenticate(currentEmail, currentPassword);
    const { error } = await supabaseClient.auth.updateUser({
      password: newPassword,
    });
    if (error) throw error;
  },
  /** Révoque toutes les sessions (après rotation du mot de passe). */
  signOutEverywhere: () => supabaseClient.auth.signOut({ scope: 'global' }),
  signOut: () => supabaseClient.auth.signOut(),
};
