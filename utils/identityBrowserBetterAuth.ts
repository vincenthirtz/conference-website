// utils/identityBrowserBetterAuth.ts — la porte du navigateur, côté Better Auth.
//
// Chargé seulement quand l'interrupteur est sur Better Auth (utils/authBackend.ts), par
// utils/identityBrowser.ts, avec la même forme de réponse que Supabase : les écrans ne voient
// pas la différence. De simples appels à /api/identity/*, sans bibliothèque (lot 7 de
// docs/AUTH-BETTER-AUTH.md).
//
// LE JETON. L'API attend `Authorization: Bearer`. On demande un jeton de 5 minutes à
// /api/identity/token, gardé jusqu'à une minute de sa fin et renouvelé avant, avec l'événement
// TOKEN_REFRESHED, comme Supabase le fait pour le sien.
//
// LA DOUBLE AUTHENTIFICATION se donne AVANT la session chez Better Auth : la connexion par mot
// de passe d'un compte protégé rend `twoFactorRequired`, puis `verifyTwoFactorCode` ouvre la
// session, déjà en `aal2`.
//
// PENDANT L'OMBRE (lot 5), /api/identity ne répond qu'avec le cookie de la page d'essai : sans
// lui, tout répond « pas de session ».
//
// CE QUI DIFFÈRE DE SUPABASE (lot 7b) : Better Auth demande le mot de passe actuel pour en changer,
// et le mot de passe pour activer ou retirer la double authentification. Ces parcours ont leurs
// propres fonctions (`betterAuthOnly`), que les écrans appellent quand l'interrupteur est sur
// Better Auth. `updateUser` ne prend que l'adresse. `setSession` et `verifyOtp` restent des
// mécanismes de Supabase : leurs liens n'existent pas ici.

import { AuthError, type Session, type User } from '@supabase/supabase-js';
import { emitIdentityEvent, hasIdentityListeners } from './identityEvents';

const BASE = '/api/identity';
/** Un jeton est renouvelé une minute avant sa fin. */
const REFRESH_MARGIN_S = 60;

type BetterAuthUser = {
  id: string;
  email: string;
  emailVerified?: boolean;
  createdAt: string;
  updatedAt: string;
  twoFactorEnabled?: boolean;
  metadata?: Record<string, unknown> | null;
};

type BetterAuthSession = {
  session: { expiresAt: string; aal?: string };
  user: BetterAuthUser;
};

type Token = { value: string; exp: number };

let token: Token | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

const now = () => Math.floor(Date.now() / 1000);

function expOf(jwt: string): number {
  try {
    const part = jwt.split('.')[1] ?? '';
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const exp = (JSON.parse(atob(padded)) as { exp?: unknown }).exp;
    return typeof exp === 'number' ? exp : 0;
  } catch {
    return 0;
  }
}

async function call(
  path: string,
  body?: unknown
): Promise<{
  ok: boolean;
  status: number;
  data: Record<string, unknown> | null;
}> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      headers:
        body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: null };
  }
}

function failure(message: unknown, status: number): AuthError {
  return new AuthError(
    typeof message === 'string' ? message : 'Better Auth',
    status
  );
}

function toUser(user: BetterAuthUser): User {
  return {
    id: user.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: user.email,
    email_confirmed_at: user.emailVerified ? user.createdAt : undefined,
    created_at: user.createdAt,
    updated_at: user.updatedAt,
    app_metadata: { provider: 'better-auth' },
    user_metadata: user.metadata ?? {},
    identities: [],
    is_anonymous: false,
  } as User;
}

function toSession(current: BetterAuthSession, tok: Token): Session {
  return {
    access_token: tok.value,
    token_type: 'bearer',
    expires_at: tok.exp,
    expires_in: Math.max(0, tok.exp - now()),
    refresh_token: '',
    user: toUser(current.user),
  } as Session;
}

async function fetchSession(): Promise<BetterAuthSession | null> {
  const { ok, data } = await call('/get-session');
  if (!ok || !data || typeof data !== 'object' || !('user' in data))
    return null;
  return data as unknown as BetterAuthSession;
}

async function accessToken(force: boolean): Promise<Token | null> {
  if (!force && token && token.exp - now() > REFRESH_MARGIN_S) return token;
  const { ok, data } = await call('/token');
  const value = data?.token;
  if (!ok || typeof value !== 'string') {
    token = null;
    return null;
  }
  token = { value, exp: expOf(value) };
  scheduleRefresh();
  return token;
}

function stopRefresh(): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
}

function scheduleRefresh(): void {
  stopRefresh();
  if (!token || !hasIdentityListeners()) return;
  const delay = Math.max(5, token.exp - now() - REFRESH_MARGIN_S) * 1000;
  refreshTimer = setTimeout(() => {
    void currentSession(true).then((session) => {
      emitIdentityEvent(session ? 'TOKEN_REFRESHED' : 'SIGNED_OUT', session);
    });
  }, delay);
}

async function currentSession(forceToken: boolean): Promise<Session | null> {
  const current = await fetchSession();
  if (!current) {
    token = null;
    stopRefresh();
    return null;
  }
  const tok = await accessToken(forceToken);
  return tok ? toSession(current, tok) : null;
}

/** Après une connexion ou un code : le jeton de l'ancienne session ne vaut plus. */
async function openedSession(): Promise<Session | null> {
  token = null;
  const session = await currentSession(true);
  if (session) emitIdentityEvent('SIGNED_IN', session);
  return session;
}

const NOT_YET = 'Pas disponible avec Better Auth.';

const notYet = async () => ({
  data: { session: null, user: null },
  error: failure(NOT_YET, 501),
});

export const betterAuthBrowser = {
  async getSession() {
    return { data: { session: await currentSession(false) }, error: null };
  },

  async getUser() {
    const session = await currentSession(false);
    return session
      ? { data: { user: session.user }, error: null }
      : { data: { user: null }, error: failure('Auth session missing!', 400) };
  },

  async refreshSession() {
    const session = await currentSession(true);
    return { data: { session, user: session?.user ?? null }, error: null };
  },

  async signInWithPassword(credentials: { email: string; password: string }) {
    const res = await call('/sign-in/email', {
      email: credentials.email,
      password: credentials.password,
    });
    if (!res.ok) {
      return {
        data: { session: null, user: null },
        error: failure(
          res.data?.message ?? 'Invalid login credentials',
          res.status
        ),
      };
    }
    if (res.data?.twoFactorRedirect) {
      return {
        data: { session: null, user: null },
        error: null,
        twoFactorRequired: true,
      };
    }
    const session = await openedSession();
    return {
      data: { session, user: session?.user ?? null },
      error: session ? null : failure('Auth session missing!', 400),
    };
  },

  /** Le code de double authentification : ouvre la session après le mot de passe, ou l'élève. */
  async verifyTwoFactorCode(code: string) {
    const res = await call('/two-factor/verify-totp', { code });
    if (!res.ok) {
      return {
        data: { session: null, user: null },
        error: failure(res.data?.message ?? 'Invalid code', res.status),
      };
    }
    const session = await openedSession();
    return { data: { session, user: session?.user ?? null }, error: null };
  },

  async signInWithOAuth(params: {
    provider: string;
    options?: { redirectTo?: string; skipBrowserRedirect?: boolean };
  }) {
    const callbackURL = params.options?.redirectTo ?? window.location.href;
    const res = await call('/sign-in/social', {
      provider: params.provider,
      callbackURL,
      errorCallbackURL: callbackURL,
    });
    const url = res.data?.url;
    if (!res.ok || typeof url !== 'string') {
      return {
        data: { provider: params.provider, url: null },
        error: failure(res.data?.message ?? 'OAuth unavailable', res.status),
      };
    }
    if (!params.options?.skipBrowserRedirect) window.location.assign(url);
    return { data: { provider: params.provider, url }, error: null };
  },

  async linkIdentity(params: {
    provider: string;
    options?: { redirectTo?: string; skipBrowserRedirect?: boolean };
  }) {
    const callbackURL = params.options?.redirectTo ?? window.location.href;
    const res = await call('/link-social', {
      provider: params.provider,
      callbackURL,
      errorCallbackURL: callbackURL,
    });
    const url = res.data?.url;
    if (!res.ok || typeof url !== 'string') {
      return {
        data: { provider: params.provider, url: null },
        error: failure(res.data?.message ?? 'Link unavailable', res.status),
      };
    }
    if (!params.options?.skipBrowserRedirect) window.location.assign(url);
    return { data: { provider: params.provider, url }, error: null };
  },

  /** Rien à échanger : le retour de Better Auth pose déjà le cookie de session. */
  async exchangeCodeForSession() {
    const session = await currentSession(false);
    return {
      data: { session, user: session?.user ?? null },
      error: session ? null : failure('Auth session missing!', 400),
    };
  },

  async signOut(options?: { scope?: 'global' | 'local' | 'others' }) {
    if (options?.scope === 'global' || options?.scope === 'others') {
      await call(
        options.scope === 'global'
          ? '/revoke-sessions'
          : '/revoke-other-sessions',
        {}
      );
    }
    if (options?.scope !== 'others') {
      await call('/sign-out', {});
      token = null;
      stopRefresh();
      emitIdentityEvent('SIGNED_OUT', null);
    }
    return { error: null };
  },

  setSession: notYet,
  verifyOtp: notYet,

  /** L'adresse seulement : le mot de passe passe par `betterAuthOnly.changePassword`. */
  async updateUser(attributes: {
    email?: string;
    password?: string;
    data?: object;
  }) {
    if (attributes.password !== undefined || attributes.data !== undefined) {
      return {
        data: { user: null },
        error: failure(
          'Better Auth : le mot de passe change avec l’ancien, le profil par l’API.',
          501
        ),
      };
    }
    if (!attributes.email) {
      return { data: { user: null }, error: failure('Rien à changer', 400) };
    }
    const res = await call('/change-email', {
      newEmail: attributes.email,
      callbackURL: `${window.location.origin}/player/profile`,
    });
    if (!res.ok) {
      return {
        data: { user: null },
        error: failure(res.data?.message ?? 'Change email failed', res.status),
      };
    }
    const session = await currentSession(false);
    return { data: { user: session?.user ?? null }, error: null };
  },

  mfa: {
    async listFactors() {
      const current = await fetchSession();
      const factor = {
        id: 'better-auth-totp',
        factor_type: 'totp',
        status: 'verified',
        friendly_name: 'Better Auth',
        created_at: current?.user.createdAt ?? '',
        updated_at: current?.user.updatedAt ?? '',
      };
      const totp = current?.user.twoFactorEnabled ? [factor] : [];
      return { data: { all: totp, totp, phone: [] }, error: null };
    },

    async getAuthenticatorAssuranceLevel() {
      const current = await fetchSession();
      if (!current) {
        return {
          data: {
            currentLevel: null,
            nextLevel: null,
            currentAuthenticationMethods: [],
          },
          error: null,
        };
      }
      const currentLevel = current.session.aal === 'aal2' ? 'aal2' : 'aal1';
      return {
        data: {
          currentLevel,
          nextLevel: current.user.twoFactorEnabled ? 'aal2' : currentLevel,
          currentAuthenticationMethods: [],
        },
        error: null,
      };
    },

    async challengeAndVerify(params: { factorId: string; code: string }) {
      const res = await betterAuthBrowser.verifyTwoFactorCode(params.code);
      return res.error
        ? { data: null, error: res.error }
        : {
            data: { access_token: res.data.session?.access_token ?? '' },
            error: null,
          };
    },

    enroll: async () => ({ data: null, error: failure(NOT_YET, 501) }),
    unenroll: async () => ({ data: null, error: failure(NOT_YET, 501) }),
  },
};

/** Les parcours propres à Better Auth : les écrans les appellent quand l'interrupteur le dit. */
export const betterAuthOnly = {
  /** Vérifie le mot de passe de la session, sans en ouvrir une autre. */
  async verifyPassword(password: string): Promise<boolean> {
    const res = await call('/verify-password', { password });
    return res.ok;
  },

  async changePassword(currentPassword: string, newPassword: string) {
    const res = await call('/change-password', {
      currentPassword,
      newPassword,
    });
    if (!res.ok) {
      return {
        error: failure(
          res.data?.message ?? 'Change password failed',
          res.status
        ),
      };
    }
    token = null;
    emitIdentityEvent('USER_UPDATED', await currentSession(true));
    return { error: null };
  },

  /** Envoie le lien ; il ramène sur `redirectTo?token=…`. */
  async requestPasswordReset(email: string, redirectTo: string) {
    const res = await call('/request-password-reset', { email, redirectTo });
    return res.ok
      ? { error: null }
      : {
          error: failure(res.data?.message ?? 'Reset unavailable', res.status),
        };
  },

  async resetPassword(token: string, newPassword: string) {
    const res = await call('/reset-password', { token, newPassword });
    return res.ok
      ? { error: null }
      : { error: failure(res.data?.message ?? 'Reset failed', res.status) };
  },

  /** Démarre l'enrôlement : le code reste à valider (`mfa.challengeAndVerify`). */
  async enableTwoFactor(password: string) {
    const res = await call('/two-factor/enable', { password });
    const uri = res.data?.totpURI;
    if (!res.ok || typeof uri !== 'string') {
      return {
        data: null,
        error: failure(res.data?.message ?? 'Enable failed', res.status),
      };
    }
    return {
      data: {
        qrCode: typeof res.data?.qrCode === 'string' ? res.data.qrCode : '',
        secret: new URL(uri).searchParams.get('secret') ?? '',
        backupCodes: Array.isArray(res.data?.backupCodes)
          ? (res.data.backupCodes as string[])
          : [],
      },
      error: null,
    };
  },

  async disableTwoFactor(password: string) {
    const res = await call('/two-factor/disable', { password });
    if (!res.ok) {
      return {
        error: failure(res.data?.message ?? 'Disable failed', res.status),
      };
    }
    emitIdentityEvent('USER_UPDATED', await currentSession(true));
    return { error: null };
  },
};
