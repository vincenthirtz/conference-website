// utils/identity.ts — la seule porte vers Supabase Auth côté serveur.
//
// POURQUOI. Better Auth remplacera Supabase Auth (conference-website docs/AUTH-BETTER-AUTH.md).
// Tant que 130 appels s'adressent directement à `.auth.`, chacun serait à reprendre le soir de
// la bascule. Ici, il n'y en a plus qu'un endroit, et le jour venu seul ce module change.
//
// AUCUNE LOGIQUE, VOLONTAIREMENT : chaque fonction rend exactement ce que rend Supabase, même
// forme, mêmes erreurs. `identityDoorGuard.test.ts` refuse tout nouvel appel hors d'ici.
//
// Recopié vers le site par la synchro, ses pages serveur s'en servent aussi. Le navigateur a
// sa propre porte, côté site : utils/identityBrowser.ts.

import {
  getServerClient,
  supabaseAdmin,
  supabaseAnonServer,
  type SupabaseServerReq,
  type SupabaseServerRes,
} from './supabase';

type AdminAuth = typeof supabaseAdmin.auth.admin;

/** Gestion des comptes, avec la clé de service. */
export const identityAdmin = {
  getUserById: (id: string) => supabaseAdmin.auth.admin.getUserById(id),
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
