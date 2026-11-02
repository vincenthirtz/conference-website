// utils/identityBrowser.ts — la seule porte vers les comptes dans le navigateur.
//
// POURQUOI. Better Auth remplacera Supabase Auth (docs/AUTH-BETTER-AUTH.md). Le jour venu,
// seul ce module change, et non les 60 appels éparpillés dans les écrans.
//
// AUCUNE LOGIQUE, VOLONTAIREMENT : chaque fonction rend exactement ce que rend Supabase, même
// forme, mêmes erreurs. `identityDoorGuard.test.ts` refuse tout nouvel appel hors d'ici. La
// liste dit ce que les écrans utilisent vraiment : c'est ce qu'il faudra refaire.
//
// L'INTERRUPTEUR (lot 7). Quand utils/authBackend.ts dit « better-auth », chaque appel part vers
// utils/identityBrowserBetterAuth.ts, chargé à ce moment-là seulement, qui répond sous la même
// forme. `verifyTwoFactorCode` n'existe que là : chez Supabase, le code passe par `mfa`.
//
// Propre au site : ce nom ne doit pas exister dans conference-api, la synchro l'écraserait. Le
// serveur a sa propre porte, utils/identity.ts.

import { currentAuthBackend } from './authBackend';
import { onIdentityEvent } from './identityEvents';
import { supabaseClient } from './supabaseBrowser';

type Auth = typeof supabaseClient.auth;
type Mfa = Auth['mfa'];
type AnyFunction = (...args: unknown[]) => unknown;
type BetterAuthBrowser =
  typeof import('./identityBrowserBetterAuth')['betterAuthBrowser'];

const loadBetterAuth = (): Promise<BetterAuthBrowser> =>
  import('./identityBrowserBetterAuth').then((m) => m.betterAuthBrowser);

const usesBetterAuth = () => currentAuthBackend() === 'better-auth';

type BetterAuthOnly =
  typeof import('./identityBrowserBetterAuth')['betterAuthOnly'];

const loadBetterAuthOnly = (): Promise<BetterAuthOnly> =>
  import('./identityBrowserBetterAuth').then((m) => m.betterAuthOnly);

/** Chaque fonction de Better Auth, chargée au premier appel. */
function betterAuthOnly<K extends keyof BetterAuthOnly>(
  name: K
): BetterAuthOnly[K] {
  return ((...args: unknown[]) =>
    loadBetterAuthOnly().then((only) =>
      (only[name] as AnyFunction)(...args)
    )) as BetterAuthOnly[K];
}

/** Le type de Supabase tel quel, surcharges comprises, et le client relu à chaque appel. */
function auth<K extends keyof Auth & keyof BetterAuthBrowser>(
  name: K
): Auth[K] {
  return ((...args: unknown[]) => {
    if (usesBetterAuth()) {
      return loadBetterAuth().then((better) =>
        (better[name] as AnyFunction)(...args)
      );
    }
    return (supabaseClient.auth[name] as AnyFunction).apply(
      supabaseClient.auth,
      args
    );
  }) as Auth[K];
}

function mfa<K extends keyof Mfa & keyof BetterAuthBrowser['mfa']>(
  name: K
): Mfa[K] {
  return ((...args: unknown[]) => {
    if (usesBetterAuth()) {
      return loadBetterAuth().then((better) =>
        (better.mfa[name] as AnyFunction)(...args)
      );
    }
    return (supabaseClient.auth.mfa[name] as AnyFunction).apply(
      supabaseClient.auth.mfa,
      args
    );
  }) as Mfa[K];
}

/** Sans attente : `onAuthStateChange` doit s'abonner avant le chargement de Better Auth. */
const onAuthStateChange = ((...args: unknown[]) =>
  usesBetterAuth()
    ? onIdentityEvent(args[0] as Parameters<typeof onIdentityEvent>[0])
    : (supabaseClient.auth.onAuthStateChange as AnyFunction).apply(
        supabaseClient.auth,
        args
      )) as Auth['onAuthStateChange'];

type TwoFactorResult = Awaited<
  ReturnType<BetterAuthBrowser['verifyTwoFactorCode']>
>;

export const identityBrowser = {
  /** Vrai quand l'interrupteur envoie ce navigateur vers Better Auth (lot 7). */
  usesBetterAuth,
  getSession: auth('getSession'),
  getUser: auth('getUser'),
  refreshSession: auth('refreshSession'),
  onAuthStateChange,
  setSession: auth('setSession'),
  signInWithPassword: auth('signInWithPassword'),
  signInWithOAuth: auth('signInWithOAuth'),
  linkIdentity: auth('linkIdentity'),
  signOut: auth('signOut'),
  updateUser: auth('updateUser'),
  verifyOtp: auth('verifyOtp'),
  exchangeCodeForSession: auth('exchangeCodeForSession'),
  /** Better Auth seulement : le code demandé après le mot de passe (`twoFactorRequired`). */
  verifyTwoFactorCode: async (code: string): Promise<TwoFactorResult> =>
    (await loadBetterAuth()).verifyTwoFactorCode(code),
  /**
   * Better Auth seulement : ce que Supabase fait autrement (mot de passe actuel pour en changer,
   * mot de passe pour la double authentification, lien de réinitialisation qui ramène un jeton).
   */
  betterAuth: {
    verifyPassword: betterAuthOnly('verifyPassword'),
    changePassword: betterAuthOnly('changePassword'),
    requestPasswordReset: betterAuthOnly('requestPasswordReset'),
    resetPassword: betterAuthOnly('resetPassword'),
    enableTwoFactor: betterAuthOnly('enableTwoFactor'),
    disableTwoFactor: betterAuthOnly('disableTwoFactor'),
  },
  mfa: {
    listFactors: mfa('listFactors'),
    getAuthenticatorAssuranceLevel: mfa('getAuthenticatorAssuranceLevel'),
    enroll: mfa('enroll'),
    unenroll: mfa('unenroll'),
    challengeAndVerify: mfa('challengeAndVerify'),
  },
};
