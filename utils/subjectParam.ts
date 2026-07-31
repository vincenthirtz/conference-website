// utils/subjectParam.ts
//
// The `?as=` contract, isolated so BOTH sides can import it.
//
// `utils/subject.ts` (the server half) pulls in supabaseAdmin, staff auth and
// staff_logs — importing it from a React component would drag all of that into
// the client bundle. This module holds only the wire format.

/** Query param carrying the inspected user id. */
export const SUBJECT_QUERY_PARAM = 'as';

/**
 * Append `?as=<subjectId>` to an API path.
 *
 * No-op when `subjectId` is falsy, so call sites can pass the context value
 * unconditionally instead of branching:
 *
 *   adminFetchJson(withSubjectParam('/api/player/matches', subjectId))
 */
export function withSubjectParam(
  url: string,
  subjectId?: string | null
): string {
  if (!subjectId) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}${SUBJECT_QUERY_PARAM}=${encodeURIComponent(subjectId)}`;
}
