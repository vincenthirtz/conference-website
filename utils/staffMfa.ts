// utils/staffMfa.ts — double authentification (TOTP Supabase) du staff : la
// partie PURE (flag, lecture du niveau d'assurance, sensibilité d'une garde).
// Aucun import serveur : importable par les tests et par les gardes.
//
// MODÈLE. Supabase porte le niveau d'assurance dans le JWT de session
// (`aal` : `aal1` = mot de passe / OAuth, `aal2` = second facteur vérifié dans
// la session). Les gardes staff le lisent, APRÈS que le jeton a été validé par
// GoTrue (`getUser`) — on ne décode jamais un jeton qui n'a pas été vérifié.
//
// BASCULE ANTI LOCK-OUT. L'obligation est pilotée par `STAFF_MFA_ENFORCED`,
// DÉSACTIVÉE par défaut. Tant qu'elle l'est, rien n'est bloqué : le staff voit
// seulement l'invitation à s'enrôler (profil > Sécurité, et /admin/mfa). On ne
// l'active qu'une fois les comptes staff enrôlés — procédure dans
// docs/PLAN-espace-admin.md (« Sécurité des comptes staff »).
//
// QUAND ELLE EST ACTIVE :
//   * toute page admin (`withStaffPage`) exige `aal2`, sinon redirection vers
//     /admin/mfa (enrôlement si aucun facteur, sinon saisie du code) ;
//   * les routes API SENSIBLES (cf. `isMfaSensitiveGuard`) répondent 403
//     `mfa_required` à une session `aal1` — c'est ce qui couvre un jeton
//     Bearer utilisé hors de l'interface.

import { StaffUnauthorizedError } from './staffRoles';
import type { StaffRole } from '@/types/admin';
import type { StaffPermission } from './staffPermissions';

export type AuthenticatorAssuranceLevel = 'aal1' | 'aal2';

/** Page d'enrôlement / de challenge (exemptée de l'obligation, évidemment). */
export const STAFF_MFA_PATH = '/admin/mfa';

/**
 * `true` seulement si `STAFF_MFA_ENFORCED` vaut explicitement `true`/`1`/`on`.
 * Toute autre valeur — absente, vide, faute de frappe — laisse l'obligation
 * COUPÉE : une variable mal saisie ne doit pas enfermer le staff dehors.
 */
export function isStaffMfaEnforced(
  env: Record<string, string | undefined> = process.env
): boolean {
  const raw = (env.STAFF_MFA_ENFORCED ?? '').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'on';
}

/** Charge utile d'un JWT, sans vérification de signature (cf. en-tête). */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    // `atob` + `TextDecoder` : présents sous Node comme au navigateur, sans
    // tirer le polyfill `Buffer` dans un bundle client.
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Niveau d'assurance porté par un jeton d'accès Supabase DÉJÀ VALIDÉ.
 * `null` si illisible — traité comme « pas aal2 » par les gardes.
 */
export function aalFromAccessToken(
  token: string | null | undefined
): AuthenticatorAssuranceLevel | null {
  if (!token) return null;
  const aal = decodeJwtPayload(token)?.aal;
  return aal === 'aal1' || aal === 'aal2' ? aal : null;
}

/** Facteur tel que renvoyé dans `user.factors` par GoTrue. */
type FactorLike = { factor_type?: string; status?: string };

/** `true` si le compte a au moins un facteur TOTP VÉRIFIÉ. */
export function hasVerifiedTotp(
  user: { factors?: readonly FactorLike[] | null } | null | undefined
): boolean {
  return (user?.factors ?? []).some(
    (f) => f.factor_type === 'totp' && f.status === 'verified'
  );
}

/**
 * Permissions dont l'usage exige `aal2` quand l'obligation est active : elles
 * engagent l'organisation ou redistribuent le pouvoir.
 *   - `manage_tenant`  : secrets du tenant, clés d'API d'espace, export complet
 *                        d'un espace, admins de pôle ;
 *   - `manage_billing` : HelloAsso (adhésions, synchronisation), facturation ;
 *   - `manage_staff`   : rôles, suppression de comptes, export des comptes.
 * Toute garde `owner` est sensible aussi (rôle qui couvre tout).
 */
export const MFA_SENSITIVE_PERMISSIONS: readonly StaffPermission[] = [
  'manage_tenant',
  'manage_billing',
  'manage_staff',
];

/**
 * Routes déclaratives sensibles dont la garde, elle, ne l'est pas : les clés
 * d'API (`manage_settings`) donnent un accès programmatique durable à l'espace.
 */
export const MFA_SENSITIVE_ROUTE_KEYS: ReadonlySet<string> = new Set([
  'admin-api-tokens',
  'admin-api-tokens-id',
]);

type GuardLike =
  | StaffRole
  | { permission: StaffPermission; scope?: string }
  | { role: StaffRole; scope?: string };

export function isMfaSensitiveGuard(guard: GuardLike): boolean {
  if (typeof guard === 'string') return guard === 'owner';
  if ('permission' in guard) {
    return MFA_SENSITIVE_PERMISSIONS.includes(guard.permission);
  }
  return guard.role === 'owner';
}

/**
 * Décision pure : faut-il refuser faute de second facteur ?
 * Jamais quand l'obligation est coupée — c'est toute la garantie anti
 * lock-out.
 */
export function mfaRequired(opts: {
  enforced: boolean;
  sensitive: boolean;
  aal: AuthenticatorAssuranceLevel | null;
}): boolean {
  return opts.enforced && opts.sensitive && opts.aal !== 'aal2';
}

/**
 * Refus faute de second facteur. Sous-classe de `StaffUnauthorizedError` :
 * toute chaîne qui sait traduire un 403 staff le traduit sans rien changer ;
 * celles qui veulent mieux (code `mfa_required`, redirection vers
 * /admin/mfa) la reconnaissent.
 */
export class StaffMfaRequiredError extends StaffUnauthorizedError {
  readonly reason = 'mfa_required';
  constructor(
    message = 'Double authentification requise : valide ton code TOTP pour continuer.'
  ) {
    super(message);
    this.name = 'StaffMfaRequiredError';
  }
}

/** Destination de redirection vers l'écran MFA, `next` conservé (URL admin). */
export function staffMfaRedirect(next: string | null | undefined): string {
  return typeof next === 'string' &&
    next.startsWith('/admin') &&
    !next.startsWith(STAFF_MFA_PATH)
    ? `${STAFF_MFA_PATH}?next=${encodeURIComponent(next)}`
    : STAFF_MFA_PATH;
}
