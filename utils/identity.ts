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
//
// BETTER AUTH (lot 6). La porte accepte aussi ses jetons, reconnus à leur émetteur, et son
// cookie de session. Elle ne les vérifie pas elle-même : l'enveloppe du Worker de l'API pose un
// lecteur sur globalThis (worker/identityBackend.ts) quand IDENTITY_ACCEPTED vaut « 1 ». Sans
// lui (interrupteur coupé, site, tests), un jeton Better Auth est refusé et son cookie ignoré.
// La personne est ensuite lue dans le miroir, sous la même forme que Supabase.

import {
  AuthApiError,
  type User,
  type UserResponse,
} from '@supabase/supabase-js';
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
        // Une liaison faite par Better Auth avant qu'il garde le profil : au moins
        // l'identifiant, que lit /api/auth/link-discord.
        identity_data:
          account.identity_data ??
          (credential
            ? {}
            : { sub: account.account_id, provider_id: account.account_id }),
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

const BETTER_AUTH_BACKEND = Symbol.for('owwc.identity.backend');
const BETTER_AUTH_ISSUER = 'https://owwomenscup.fr/api/identity';
const BETTER_AUTH_COOKIE = '__Secure-owwc.session_token';

type BetterAuthReader = {
  userFromToken(token: string): Promise<{ id: string } | null>;
  sessionFromCookies(
    cookieHeader: string
  ): Promise<{ id: string; accessToken: string | null } | null>;
  /** Côté API seulement (worker/identityBackend.ts) : le lecteur du site ne les a pas. */
  signInLink?(email: string, callbackURL: string): Promise<string | null>;
  resetPasswordLink?(email: string, redirectTo: string): Promise<string | null>;
};

function betterAuthReader(): BetterAuthReader | null {
  const store = globalThis as unknown as Record<symbol, unknown>;
  return (store[BETTER_AUTH_BACKEND] as BetterAuthReader | undefined) ?? null;
}

/** L'émetteur d'un jeton, lu SANS vérification : il ne sert qu'à choisir qui le vérifie. */
function issuerOf(token: string): unknown {
  try {
    const part = token.split('.')[1] ?? '';
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    return (JSON.parse(new TextDecoder().decode(bytes)) as { iss?: unknown })
      .iss;
  } catch {
    return null;
  }
}

function refused(message: string, status: number, code: string): UserResponse {
  return {
    data: { user: null },
    error: new AuthApiError(message, status, code),
  };
}

/** Le compte d'une identité Better Auth vérifiée. Suspendu : refusé, comme un jeton invalide. */
async function betterAuthUser(id: string): Promise<UserResponse> {
  const res = await identityAdmin.getUserById(id);
  const until = res.data.user?.banned_until;
  if (until && Date.parse(until) > Date.now()) {
    return refused('User is banned', 403, 'user_banned');
  }
  return res;
}

function cookieHeaderOf(req: SupabaseServerReq): string {
  const header = req.headers?.cookie;
  return Array.isArray(header) ? header.join('; ') : (header ?? '');
}

/** La session Better Auth des cookies, `null` sans cookie, sans lecteur ou si elle est refusée. */
async function betterAuthCookieSession(req: SupabaseServerReq) {
  const header = cookieHeaderOf(req);
  if (!header.includes(`${BETTER_AUTH_COOKIE}=`)) return null;
  const reader = betterAuthReader();
  if (!reader) return null;
  return reader.sessionFromCookies(header).catch(() => null);
}

/** La personne derrière un jeton d'accès. */
export async function userFromToken(token: string): Promise<UserResponse> {
  if (issuerOf(token) === BETTER_AUTH_ISSUER) {
    const verified = await (
      betterAuthReader()?.userFromToken(token) ?? Promise.resolve(null)
    ).catch(() => null);
    return verified
      ? betterAuthUser(verified.id)
      : refused('Invalid token', 401, 'bad_jwt');
  }
  return supabaseAdmin.auth.getUser(token);
}

/** La personne de la session portée par les cookies de la requête. */
export async function userFromCookies(
  req: SupabaseServerReq,
  res: SupabaseServerRes
): Promise<UserResponse> {
  const session = await betterAuthCookieSession(req);
  if (session) return betterAuthUser(session.id);
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
  // Lue une seule fois : `getUser` puis `accessToken` parlent de la même session.
  let betterAuth: ReturnType<typeof betterAuthCookieSession> | null = null;
  const betterAuthSession = () => {
    betterAuth ??= betterAuthCookieSession(req);
    return betterAuth;
  };
  return {
    getUser: async (): Promise<UserResponse> => {
      const session = await betterAuthSession();
      return session ? betterAuthUser(session.id) : client.auth.getUser();
    },
    accessToken: async (): Promise<string | null> => {
      const session = await betterAuthSession();
      if (session) return session.accessToken;
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

/**
 * Les liens que l'API fabrique (mot de passe oublié, accès équipe) viennent-ils de Better Auth ?
 * `IDENTITY_LINKS=better-auth`, posé à la bascule (lot 8) ; Supabase sinon.
 */
export function betterAuthBuildsLinks(): boolean {
  return process.env.IDENTITY_LINKS === 'better-auth';
}

/**
 * Better Auth : un lien de connexion à usage unique, pour les parcours où l'API ouvre la session
 * à la place de Supabase (Battle.net, accès équipe). `null` sans lecteur ou en cas d'échec.
 */
export async function betterAuthSignInLink(
  email: string,
  callbackURL: string
): Promise<string | null> {
  const reader = betterAuthReader();
  if (!reader?.signInLink) return null;
  return reader.signInLink(email, callbackURL).catch(() => null);
}

/** Better Auth : le lien de réinitialisation, que l'API envoie avec son propre e-mail. */
export async function betterAuthResetLink(
  email: string,
  redirectTo: string
): Promise<string | null> {
  const reader = betterAuthReader();
  if (!reader?.resetPasswordLink) return null;
  return reader.resetPasswordLink(email, redirectTo).catch(() => null);
}

/** Inscription publique : clé anon, sans toucher à la session de l'appelant. */
export function signUpWithPassword(
  ...args: Parameters<typeof supabaseAnonServer.auth.signUp>
) {
  return supabaseAnonServer.auth.signUp(...args);
}
