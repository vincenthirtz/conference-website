// utils/identity.ts — la seule porte vers Supabase Auth côté serveur.
//
// POURQUOI. Better Auth remplacera Supabase Auth (conference-website docs/AUTH-BETTER-AUTH.md).
// Tant que 130 appels s'adressent directement à `.auth.`, chacun serait à reprendre le soir de
// la bascule. Ici, il n'y en a plus qu'un endroit, et le jour venu seul ce module change.
//
// AUCUNE LOGIQUE, VOLONTAIREMENT : chaque fonction rend exactement ce que rend Supabase, même
// forme, mêmes erreurs. `identityDoorGuard.test.ts` refuse tout nouvel appel hors d'ici. Seule
// exception : `getUserById` lit d'abord le miroir `auth_user` (lot 4), sous la même forme.
//
// Recopié vers le site par la synchro, ses pages serveur s'en servent aussi. Le navigateur a
// sa propre porte, côté site : utils/identityBrowser.ts.

import type { User, UserResponse } from '@supabase/supabase-js';
import { logger } from './logger';
import {
  getServerClient,
  supabaseAdmin,
  supabaseAnonServer,
  type SupabaseServerReq,
  type SupabaseServerRes,
} from './supabase';

type AdminAuth = typeof supabaseAdmin.auth.admin;

type MirrorRow = {
  id: string;
  email: string;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
  metadata: User['user_metadata'];
  last_sign_in_at: string | null;
  banned_until: string | null;
  auth_account: Array<{
    provider_id: string;
    account_id: string;
    identity_data: Record<string, unknown> | null;
    created_at: string;
    updated_at: string;
  }> | null;
};

/** Une ligne du miroir, sous la forme d'un compte Supabase. */
function userOfMirrorRow(row: MirrorRow): User {
  return {
    id: row.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: row.email,
    // Le miroir ne garde que le oui/non : seule sa présence a un sens.
    email_confirmed_at: row.email_verified ? row.created_at : undefined,
    last_sign_in_at: row.last_sign_in_at ?? undefined,
    banned_until: row.banned_until ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
    app_metadata: {},
    user_metadata: row.metadata ?? {},
    identities: (row.auth_account ?? []).map((account) => {
      const credential = account.provider_id === 'credential';
      const id = credential ? row.id : account.account_id;
      return {
        id,
        identity_id: id,
        user_id: row.id,
        provider: credential ? 'email' : account.provider_id,
        identity_data: account.identity_data ?? {},
        created_at: account.created_at,
        updated_at: account.updated_at,
      };
    }),
  } as User;
}

/**
 * Le compte lu dans le miroir, en une seule requête comme l'appel qu'elle remplace.
 * `null` si le compte manque ou si la lecture échoue : Supabase, qui reste la source
 * jusqu'à la bascule, répond alors. Le journal ne dit que le code d'erreur.
 */
async function userResponseFromMirror(
  id: string
): Promise<UserResponse | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('auth_user')
      .select(
        'id, email, email_verified, created_at, updated_at, metadata, last_sign_in_at, banned_until, auth_account(provider_id, account_id, identity_data, created_at, updated_at)'
      )
      .eq('id', id)
      .maybeSingle();
    if (error) {
      logger.warn('[identity] miroir illisible : %s', error.code ?? 'inconnu');
      return null;
    }
    if (!data) return null;
    return {
      data: { user: userOfMirrorRow(data as unknown as MirrorRow) },
      error: null,
    };
  } catch {
    return null;
  }
}

/** Gestion des comptes, avec la clé de service. */
export const identityAdmin = {
  getUserById: async (id: string): Promise<UserResponse> =>
    (await userResponseFromMirror(id)) ??
    supabaseAdmin.auth.admin.getUserById(id),
  updateUserById: (...args: Parameters<AdminAuth['updateUserById']>) =>
    supabaseAdmin.auth.admin.updateUserById(...args),
  createUser: (...args: Parameters<AdminAuth['createUser']>) =>
    supabaseAdmin.auth.admin.createUser(...args),
  deleteUser: (...args: Parameters<AdminAuth['deleteUser']>) =>
    supabaseAdmin.auth.admin.deleteUser(...args),
  generateLink: (...args: Parameters<AdminAuth['generateLink']>) =>
    supabaseAdmin.auth.admin.generateLink(...args),
  listUsers: (...args: Parameters<AdminAuth['listUsers']>) =>
    supabaseAdmin.auth.admin.listUsers(...args),
};

/** La lecture des comptes est-elle possible ? Faux sans clé de service. */
export function identityAdminAvailable(): boolean {
  return Boolean(supabaseAdmin?.auth?.admin?.getUserById);
}

/** La personne derrière un jeton d'accès. */
export function userFromToken(token: string) {
  return supabaseAdmin.auth.getUser(token);
}

/** La personne de la session portée par les cookies de la requête. */
export function userFromCookies(
  req: SupabaseServerReq,
  res: SupabaseServerRes
) {
  return getServerClient(req, res).auth.getUser();
}

/** Ferme la session portée par les cookies de la requête. */
export function signOutFromCookies(
  req: SupabaseServerReq,
  res: SupabaseServerRes
) {
  return getServerClient(req, res).auth.signOut();
}

/**
 * La session des cookies, lue en deux temps sur le MÊME client : `getUser` la valide et la
 * rafraîchit au besoin, puis `accessToken` rend le jeton de cette session-là, pour le niveau
 * de double authentification. Best-effort : `null` s'il est illisible.
 */
export function cookieSession(req: SupabaseServerReq, res: SupabaseServerRes) {
  const client = getServerClient(req, res);
  return {
    getUser: () => client.auth.getUser(),
    accessToken: async (): Promise<string | null> => {
      if (typeof client.auth.getSession !== 'function') return null;
      try {
        const { data } = await client.auth.getSession();
        return data?.session?.access_token ?? null;
      } catch {
        return null;
      }
    },
  };
}

/** Inscription publique : clé anon, sans toucher à la session de l'appelant. */
export function signUpWithPassword(
  ...args: Parameters<typeof supabaseAnonServer.auth.signUp>
) {
  return supabaseAnonServer.auth.signUp(...args);
}
