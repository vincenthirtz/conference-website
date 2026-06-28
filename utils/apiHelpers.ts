// utils/apiHelpers.ts
// Shared helpers for admin API routes to reduce boilerplate

import type { NextApiRequest } from 'next';

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

/**
 * Escape a value for use inside PostgREST filter expressions (.or / .filter).
 * PostgREST treats characters like , . ( ) as operators — they must be
 * stripped or escaped so user input cannot alter the query structure.
 */
export function escapePostgrestValue(value: string): string {
  // Remove characters that PostgREST interprets as operators/delimiters
  return value.replace(/[,.*()\\]/g, '');
}

const ALLOWED_ROLES = new Set(['player', 'coach', 'substitute', 'manager']);

/**
 * Validate a member role against the allowed list.
 * Returns the role if valid, or 'player' as default.
 */
export function validateRole(role: string | null | undefined): string {
  const trimmed = (role || '').trim().toLowerCase();
  return ALLOWED_ROLES.has(trimmed) ? trimmed : 'player';
}

const ALLOWED_SPECIALTIES = new Set(['tank', 'dps', 'support', 'flex']);

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
