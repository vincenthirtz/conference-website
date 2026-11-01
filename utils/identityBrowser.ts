// utils/identityBrowser.ts — la seule porte vers Supabase Auth dans le navigateur.
//
// POURQUOI. Better Auth remplacera Supabase Auth (docs/AUTH-BETTER-AUTH.md). Le jour venu,
// seul ce module change, et non les 60 appels éparpillés dans les écrans.
//
// AUCUNE LOGIQUE, VOLONTAIREMENT : chaque fonction rend exactement ce que rend Supabase, même
// forme, mêmes erreurs. `identityDoorGuard.test.ts` refuse tout nouvel appel hors d'ici. La
// liste dit ce que les écrans utilisent vraiment : c'est ce qu'il faudra refaire.
//
// Propre au site : ce nom ne doit pas exister dans conference-api, la synchro l'écraserait. Le
// serveur a sa propre porte, utils/identity.ts.

import { supabaseClient } from './supabaseBrowser';

type Auth = typeof supabaseClient.auth;
type Mfa = Auth['mfa'];
type AnyFunction = (...args: unknown[]) => unknown;

/** Le type de Supabase tel quel, surcharges comprises, et le client relu à chaque appel. */
function auth<K extends keyof Auth>(name: K): Auth[K] {
  return ((...args: unknown[]) =>
    (supabaseClient.auth[name] as AnyFunction).apply(
      supabaseClient.auth,
      args
    )) as Auth[K];
}

function mfa<K extends keyof Mfa>(name: K): Mfa[K] {
  return ((...args: unknown[]) =>
    (supabaseClient.auth.mfa[name] as AnyFunction).apply(
      supabaseClient.auth.mfa,
      args
    )) as Mfa[K];
}

export const identityBrowser = {
  getSession: auth('getSession'),
  getUser: auth('getUser'),
  refreshSession: auth('refreshSession'),
  onAuthStateChange: auth('onAuthStateChange'),
  setSession: auth('setSession'),
  signInWithPassword: auth('signInWithPassword'),
  signInWithOAuth: auth('signInWithOAuth'),
  linkIdentity: auth('linkIdentity'),
  signOut: auth('signOut'),
  updateUser: auth('updateUser'),
  verifyOtp: auth('verifyOtp'),
  exchangeCodeForSession: auth('exchangeCodeForSession'),
  mfa: {
    listFactors: mfa('listFactors'),
    getAuthenticatorAssuranceLevel: mfa('getAuthenticatorAssuranceLevel'),
    enroll: mfa('enroll'),
    unenroll: mfa('unenroll'),
    challengeAndVerify: mfa('challengeAndVerify'),
  },
};
