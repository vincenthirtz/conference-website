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
  type AuthError,
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

const MIRROR_SELECT =
  'id, email, email_verified, created_at, updated_at, metadata, last_sign_in_at, banned_until, auth_account(provider_id, account_id, identity_data, created_at, updated_at)';

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
      .select(MIRROR_SELECT)
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

/** Gestion des comptes, avec la clé de service ; par Better Auth une fois source (lot 8). */
export const identityAdmin = {
  getUserById: async (id: string): Promise<UserResponse> =>
    betterAuthIsSource()
      ? ((await userResponseFromMirror(id)) ?? missingUser())
      : ((await userResponseFromMirror(id)) ??
        supabaseAdmin.auth.admin.getUserById(id)),
  updateUserById: (...args: Parameters<AdminAuth['updateUserById']>) =>
    betterAuthIsSource()
      ? betterAuthUpdateUser(args[0], args[1] as AdminAttributes)
      : supabaseAdmin.auth.admin.updateUserById(...args),
  createUser: (...args: Parameters<AdminAuth['createUser']>) =>
    betterAuthIsSource()
      ? betterAuthCreateUser(args[0] as AdminAttributes & { email: string })
      : supabaseAdmin.auth.admin.createUser(...args),
  deleteUser: (...args: Parameters<AdminAuth['deleteUser']>) =>
    betterAuthIsSource()
      ? betterAuthDeleteUser(args[0])
      : supabaseAdmin.auth.admin.deleteUser(...args),
  generateLink: (...args: Parameters<AdminAuth['generateLink']>) =>
    supabaseAdmin.auth.admin.generateLink(...args),
  listUsers: (...args: Parameters<AdminAuth['listUsers']>) =>
    betterAuthIsSource()
      ? (betterAuthListUsers(args[0]) as unknown as ReturnType<
          AdminAuth['listUsers']
        >)
      : supabaseAdmin.auth.admin.listUsers(...args),
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
  adminCreateUser?(input: {
    email: string;
    password?: string;
    emailVerified: boolean;
    metadata: Record<string, unknown>;
    name?: string;
  }): Promise<{ id: string } | { error: 'exists' | 'failed' }>;
  adminUpdateUser?(
    id: string,
    patch: {
      email?: string;
      emailVerified?: boolean;
      password?: string;
      metadata?: Record<string, unknown>;
      bannedUntil?: Date | null;
    }
  ): Promise<boolean>;
  adminDeleteUser?(id: string): Promise<boolean>;
  sendVerificationEmail?(email: string, callbackURL?: string): Promise<boolean>;
  authSettings?(): Promise<IdentityAuthSettings>;
  saveAuthSettings?(
    patch: IdentityAuthSettingsPatch
  ): Promise<IdentityAuthSettings | 'missing' | null>;
  ownerOverview?(): Promise<IdentityOwnerOverview | null>;
  findAccounts?(query: string): Promise<IdentityOwnerAccount[] | null>;
  revokeSessions?(userId: string): Promise<number | null>;
  removeTwoFactor?(
    userId: string
  ): Promise<{ email: string; hadTwoFactor: boolean } | 'unknown' | null>;
  revokeAllSessions?(): Promise<number | null>;
};

/** Les réglages des comptes changés par l'owner (worker/identitySettings.ts côté API). */
export type IdentityAuthSettings = {
  signupOpen: boolean;
  discordSignIn: boolean;
  magicLink: boolean;
  sessionDays: number;
  updatedAt: string | null;
};

export type IdentityAuthSettingsPatch = Partial<
  Omit<IdentityAuthSettings, 'updatedAt'>
>;

/** Les chiffres de la page owner (worker/identityOwner.ts côté API). */
export type IdentityOwnerOverview = {
  accounts: number;
  unverified: number;
  banned: number;
  twoFactor: number;
  withPassword: number;
  withDiscord: number;
  discordOnly: number;
  activeSessions: number;
  signedInPeople: number;
  aal2Sessions: number;
  sessions24h: number;
  sessions7d: number;
  signedIn7d: number;
  throttled: number;
};

export type IdentityOwnerAccount = {
  id: string;
  email: string;
  displayName: string | null;
  role: string | null;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  activeSessions: number;
  providers: string[];
  lastSignInAt: string | null;
  bannedUntil: string | null;
  createdAt: string;
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
  if (betterAuthIsSource()) return refused('Invalid token', 401, 'bad_jwt');
  return supabaseAdmin.auth.getUser(token);
}

/** La personne de la session portée par les cookies de la requête. */
export async function userFromCookies(
  req: SupabaseServerReq,
  res: SupabaseServerRes
): Promise<UserResponse> {
  const session = await betterAuthCookieSession(req);
  if (session) return betterAuthUser(session.id);
  if (betterAuthIsSource()) return missingSession();
  return getServerClient(req, res).auth.getUser();
}

/**
 * Ferme la session portée par les cookies de la requête. Better Auth source : rien à fermer
 * ici, le navigateur ferme sa session lui-même (utils/identityBrowser.ts, côté site).
 */
export async function signOutFromCookies(
  req: SupabaseServerReq,
  res: SupabaseServerRes
): Promise<{ error: AuthError | null }> {
  if (betterAuthIsSource()) return { error: null };
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
      if (session) return betterAuthUser(session.id);
      return betterAuthIsSource() ? missingSession() : client.auth.getUser();
    },
    accessToken: async (): Promise<string | null> => {
      const session = await betterAuthSession();
      if (session) return session.accessToken;
      if (betterAuthIsSource()) return null;
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

/**
 * Inscription publique : clé anon, sans toucher à la session de l'appelant. Better Auth source :
 * le compte naît non confirmé, avec son profil, et l'e-mail de confirmation part.
 */
export async function signUpWithPassword(
  ...args: Parameters<typeof supabaseAnonServer.auth.signUp>
) {
  if (!betterAuthIsSource()) return supabaseAnonServer.auth.signUp(...args);
  const credentials = args[0] as {
    email: string;
    password: string;
    options?: { emailRedirectTo?: string; data?: Record<string, unknown> };
  };
  const reader = betterAuthReader();
  if (!reader?.adminCreateUser) {
    return { data: { user: null, session: null }, error: unavailableError() };
  }
  // Fermées par l'owner : la même réponse que Supabase, inscriptions coupées.
  const settings = await reader.authSettings?.();
  if (settings && !settings.signupOpen) {
    return {
      data: { user: null, session: null },
      error: new AuthApiError(
        'Signups not allowed for this instance',
        422,
        'signup_disabled'
      ),
    };
  }
  const metadata = credentials.options?.data ?? {};
  const created = await reader.adminCreateUser({
    email: credentials.email,
    password: credentials.password,
    emailVerified: false,
    metadata,
    name:
      typeof metadata.display_name === 'string' ? metadata.display_name : '',
  });
  if ('error' in created) {
    return {
      data: { user: null, session: null },
      error:
        created.error === 'exists'
          ? new AuthApiError(
              'User already registered',
              422,
              'user_already_exists'
            )
          : unavailableError(),
    };
  }
  await reader.sendVerificationEmail?.(
    credentials.email,
    credentials.options?.emailRedirectTo
  );
  const { data } = (await userResponseFromMirror(created.id)) ?? missingUser();
  return { data: { user: data.user, session: null }, error: null };
}

/**
 * Better Auth devient la source des comptes à la bascule (lot 8) : `IDENTITY_SOURCE=better-auth`.
 * La porte lit alors le miroir seul, écrit par le lecteur de Better Auth, et ne reconnaît plus
 * ni les jetons ni les cookies de Supabase.
 */
export function betterAuthIsSource(): boolean {
  return process.env.IDENTITY_SOURCE === 'better-auth';
}

/**
 * La page owner « Comptes et connexion » : Better Auth seulement (IDENTITY_SOURCE). `null` quand
 * Supabase est encore la source ou que la base de Better Auth ne répond pas.
 */
export const identityOwner = {
  available(): boolean {
    return betterAuthIsSource() && Boolean(betterAuthReader()?.ownerOverview);
  },
  async settings(): Promise<IdentityAuthSettings | null> {
    if (!betterAuthIsSource()) return null;
    return (await betterAuthReader()?.authSettings?.()) ?? null;
  },
  async saveSettings(
    patch: IdentityAuthSettingsPatch
  ): Promise<IdentityAuthSettings | 'missing' | null> {
    if (!betterAuthIsSource()) return null;
    return (await betterAuthReader()?.saveAuthSettings?.(patch)) ?? null;
  },
  async overview(): Promise<IdentityOwnerOverview | null> {
    if (!betterAuthIsSource()) return null;
    return (await betterAuthReader()?.ownerOverview?.()) ?? null;
  },
  async findAccounts(query: string): Promise<IdentityOwnerAccount[] | null> {
    if (!betterAuthIsSource()) return null;
    return (await betterAuthReader()?.findAccounts?.(query)) ?? null;
  },
  async revokeSessions(userId: string): Promise<number | null> {
    if (!betterAuthIsSource()) return null;
    return (await betterAuthReader()?.revokeSessions?.(userId)) ?? null;
  },
  async removeTwoFactor(
    userId: string
  ): Promise<{ email: string; hadTwoFactor: boolean } | 'unknown' | null> {
    if (!betterAuthIsSource()) return null;
    return (await betterAuthReader()?.removeTwoFactor?.(userId)) ?? null;
  },
  async resendVerification(email: string): Promise<boolean> {
    if (!betterAuthIsSource()) return false;
    return (await betterAuthReader()?.sendVerificationEmail?.(email)) ?? false;
  },
  async revokeAllSessions(): Promise<number | null> {
    if (!betterAuthIsSource()) return null;
    return (await betterAuthReader()?.revokeAllSessions?.()) ?? null;
  },
  /** Parmi ces comptes, ceux qui ont la double authentification (staff à relancer). */
  async withTwoFactor(userIds: string[]): Promise<Set<string> | null> {
    if (userIds.length === 0) return new Set();
    const { data, error } = await supabaseAdmin
      .from('auth_user')
      .select('id')
      .in('id', userIds)
      .eq('two_factor_enabled', true);
    if (error) return null;
    return new Set((data ?? []).map((row) => row.id));
  },
};

type AdminAttributes = {
  email?: string;
  password?: string;
  email_confirm?: boolean;
  user_metadata?: Record<string, unknown> | null;
  ban_duration?: string;
};

function unavailableError(): AuthApiError {
  return new AuthApiError(
    'Better Auth indisponible',
    503,
    'unexpected_failure'
  );
}

function missingUser(): UserResponse {
  return refused('User not found', 404, 'user_not_found');
}

function missingSession(): UserResponse {
  return refused('Auth session missing!', 400, 'session_missing');
}

/** Comme GoTrue : les clés données remplacent, `null` efface, les autres demeurent. */
export function mergeUserMetadata(
  current: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete merged[key];
    else merged[key] = value;
  }
  return merged;
}

/** `ban_duration` de GoTrue : « none » lève la suspension ; « 24h », « 30m », « 45s » la posent. */
export function bannedUntilOf(
  duration: string,
  now: number = Date.now()
): Date | null | undefined {
  if (duration === 'none') return null;
  const m = /^(\d+)(h|m|s)$/.exec(duration);
  if (!m) return undefined;
  const unit = m[2] === 'h' ? 3_600_000 : m[2] === 'm' ? 60_000 : 1_000;
  return new Date(now + Number(m[1]) * unit);
}

async function betterAuthUpdateUser(
  id: string,
  attributes: AdminAttributes
): Promise<UserResponse> {
  const reader = betterAuthReader();
  if (!reader?.adminUpdateUser)
    return { data: { user: null }, error: unavailableError() };
  const current = (await userResponseFromMirror(id))?.data.user;
  if (!current) return missingUser();
  const patch: Parameters<NonNullable<BetterAuthReader['adminUpdateUser']>>[1] =
    {};
  if (attributes.user_metadata) {
    patch.metadata = mergeUserMetadata(
      (current.user_metadata ?? {}) as Record<string, unknown>,
      attributes.user_metadata
    );
  }
  if (attributes.password) patch.password = attributes.password;
  if (attributes.email) patch.email = attributes.email;
  if (attributes.email_confirm !== undefined) {
    patch.emailVerified = attributes.email_confirm;
  }
  if (attributes.ban_duration !== undefined) {
    const until = bannedUntilOf(attributes.ban_duration);
    if (until === undefined) {
      return refused('Invalid ban duration', 400, 'validation_failed');
    }
    patch.bannedUntil = until;
  }
  if (!(await reader.adminUpdateUser(id, patch))) {
    return { data: { user: null }, error: unavailableError() };
  }
  return (await userResponseFromMirror(id)) ?? missingUser();
}

async function betterAuthCreateUser(
  attributes: AdminAttributes & { email: string }
): Promise<UserResponse> {
  const reader = betterAuthReader();
  if (!reader?.adminCreateUser)
    return { data: { user: null }, error: unavailableError() };
  const metadata = attributes.user_metadata ?? {};
  const created = await reader.adminCreateUser({
    email: attributes.email,
    password: attributes.password,
    emailVerified: attributes.email_confirm === true,
    metadata,
    name:
      typeof metadata.display_name === 'string' ? metadata.display_name : '',
  });
  if ('error' in created) {
    return created.error === 'exists'
      ? refused(
          'A user with this email address has already been registered',
          422,
          'email_exists'
        )
      : { data: { user: null }, error: unavailableError() };
  }
  return (await userResponseFromMirror(created.id)) ?? missingUser();
}

async function betterAuthDeleteUser(id: string): Promise<UserResponse> {
  const reader = betterAuthReader();
  if (!reader?.adminDeleteUser)
    return { data: { user: null }, error: unavailableError() };
  const current = (await userResponseFromMirror(id))?.data.user ?? null;
  if (!(await reader.adminDeleteUser(id))) {
    return { data: { user: null }, error: unavailableError() };
  }
  return { data: { user: current as User }, error: null };
}

/** Les comptes du miroir, par pages, sous la forme de `listUsers` de Supabase. */
async function betterAuthListUsers(params?: {
  page?: number;
  perPage?: number;
}) {
  const page = Math.max(1, params?.page ?? 1);
  const perPage = Math.max(1, Math.min(1000, params?.perPage ?? 50));
  const from = (page - 1) * perPage;
  const { data, error, count } = await supabaseAdmin
    .from('auth_user')
    .select(MIRROR_SELECT, { count: 'exact' })
    .order('created_at', { ascending: true })
    .range(from, from + perPage - 1);
  if (error) {
    logger.warn('[identity] miroir illisible : %s', error.code ?? 'inconnu');
    return { data: { users: [] as User[] }, error: unavailableError() };
  }
  const users = ((data ?? []) as unknown as MirrorRow[]).map(userOfMirrorRow);
  const total = count ?? users.length;
  const lastPage = Math.max(1, Math.ceil(total / perPage));
  return {
    data: {
      users,
      aud: 'authenticated',
      nextPage: page < lastPage ? page + 1 : null,
      lastPage,
      total,
    },
    error: null,
  };
}
