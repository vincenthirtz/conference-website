// utils/apiHelpers.ts
// Shared helpers for admin API routes to reduce boilerplate

import type { NextApiRequest } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { TEAM_ROLE_VALUES } from '@/utils/teamRoles';

/**
 * Extract and validate pagination parameters (limit + offset) from query string.
 * Clamps values to safe ranges and provides defaults.
 */
export function parsePagination(
  req: NextApiRequest,
  defaults: { limit?: number; offset?: number; maxLimit?: number } = {}
): { limit: number; offset: number } {
  const {
    limit: defaultLimit = 50,
    offset: defaultOffset = 0,
    maxLimit = 1000,
  } = defaults;
  const rawLimit = req.query.limit;
  const rawOffset = req.query.offset;

  const limit = Math.max(
    1,
    Math.min(
      maxLimit,
      parseInt(
        (Array.isArray(rawLimit) ? rawLimit[0] : rawLimit) ??
          String(defaultLimit),
        10
      ) || defaultLimit
    )
  );

  const offset = Math.max(
    0,
    parseInt(
      (Array.isArray(rawOffset) ? rawOffset[0] : rawOffset) ??
        String(defaultOffset),
      10
    ) || defaultOffset
  );

  return { limit, offset };
}

/**
 * Sanitize a search query parameter: handle arrays, trim, and cap length.
 * Returns a clean string or empty string if invalid.
 */
export function sanitizeSearch(
  raw: string | string[] | undefined,
  maxLength: number = 500
): string {
  if (!raw) return '';
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return '';
  return value.trim().slice(0, maxLength);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Check if a string is a valid UUID v4 format.
 */
export function isValidUUID(value: string): boolean {
  return UUID_RE.test(value);
}

export type AcceptUserIdResult =
  | { ok: true; userId: string }
  | { ok: false; status: number; error: string };

/**
 * Validate a client-supplied raw `user_id` before it is trusted enough to be
 * inserted into `team_members` / promoted to `teams.captain_id`.
 *
 * This guards PUBLIC, unauthenticated endpoints (e.g.
 * `pages/api/teams/create-with-member.ts`) where an attacker who learns a
 * user id (these ids leak — `pages/profile.tsx` renders `user.id`) could
 * otherwise pin an arbitrary user as a team member/captain.
 *
 * Two gates, both required:
 *   1. The value must be a well-formed UUID (rejects arbitrary strings, which
 *      also keeps CodeQL taint tracking happy: we never forward unparsed input
 *      into a DB write — we re-emit a typed, format-checked value).
 *   2. The id must correspond to an EXISTING auth user. A non-existent id is
 *      rejected outright (404-ish → 400 for a public boundary).
 *
 * NOTE: existence does NOT prove consent. A caller who already knows a real
 * victim's id still passes both gates. On a public consent-free endpoint that
 * residual risk is inherent; the legit website flow never supplies `user_id`
 * (it resolves members by email), so prefer email resolution upstream and only
 * reach this validator for the rare/explicit raw-id path.
 */
export async function validateExistingUserId(
  rawUserId: string | null | undefined
): Promise<AcceptUserIdResult> {
  const trimmed = (rawUserId ?? '').trim();
  if (!trimmed) {
    return { ok: false, status: 400, error: 'A user id is required.' };
  }
  if (!isValidUUID(trimmed)) {
    return {
      ok: false,
      status: 400,
      error: 'Invalid user id: a valid user UUID is required.',
    };
  }
  if (!supabaseAdmin) {
    return { ok: false, status: 503, error: 'Service unavailable.' };
  }
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(trimmed);
  if (error || !data?.user?.id) {
    return {
      ok: false,
      status: 400,
      error: 'Unknown user id: no matching user exists.',
    };
  }
  return { ok: true, userId: data.user.id };
}

/**
 * Escape a value for use inside PostgREST filter expressions (.or / .filter).
 * PostgREST treats characters like , . ( ) as operators — they must be
 * stripped or escaped so user input cannot alter the query structure.
 */
export function escapePostgrestValue(value: string): string {
  // Remove characters that PostgREST interprets as operators/delimiters
  return value.replace(/[,.*()\\]/g, '');
}

// Liste unique : cf. utils/teamRoles.ts (miroir de la CHECK `chk_team_members_role`).
const ALLOWED_ROLES: ReadonlySet<string> = new Set(TEAM_ROLE_VALUES);

/**
 * Validate a member role against the allowed list.
 * Returns the role if valid, or 'player' as default.
 */
export function validateRole(role: string | null | undefined): string {
  const trimmed = (role || '').trim().toLowerCase();
  return ALLOWED_ROLES.has(trimmed) ? trimmed : 'player';
}

/**
 * Les postes reconnus. Exporté parce que trois routes en ont besoin pour
 * REFUSER une valeur inconnue plutôt que de la ramener silencieusement à null —
 * `validateSpecialty` seul ne permet pas de distinguer « effacer » de « valeur
 * erronée ». Chaque route en gardait sa propre copie.
 */
export const ALLOWED_SPECIALTIES = new Set([
  'tank',
  'dps',
  'support',
  'flex',
]);

/**
 * Validate a team member in-game specialty against the allowed list
 * (tank | dps | support | flex). Anything else (including empty/unknown)
 * resolves to `null` — the DB column is nullable and means "unspecified".
 */
export function validateSpecialty(
  specialty: string | null | undefined
): string | null {
  const trimmed = (specialty || '').trim().toLowerCase();
  return ALLOWED_SPECIALTIES.has(trimmed) ? trimmed : null;
}

const SAFE_URL_SCHEMES = new Set(['http:', 'https:']);

/**
 * Validate that a string is a well-formed URL with http(s) scheme.
 * Returns the trimmed URL if valid, or null if invalid/empty.
 * Rejects javascript:, data:, and other dangerous schemes.
 */
export function sanitizeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return SAFE_URL_SCHEMES.has(url.protocol) ? trimmed : null;
  } catch {
    return null;
  }
}
