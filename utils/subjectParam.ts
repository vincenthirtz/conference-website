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
 * Query param demandant explicitement d'AGIR à la place du sujet (S4).
 * Sans lui (ou sans le header équivalent), `?as=` reste en lecture seule.
 */
export const ACT_AS_QUERY_PARAM = 'act';

/** Header équivalent, pour les appelants qui maîtrisent leurs en-têtes. */
export const ACT_AS_HEADER = 'x-staff-act-as';

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
  subjectId?: string | null,
  actAs = false
): string {
  if (!subjectId) return url;
  const sep = url.includes('?') ? '&' : '?';
  const base = `${url}${sep}${SUBJECT_QUERY_PARAM}=${encodeURIComponent(subjectId)}`;
  return actAs ? `${base}&${ACT_AS_QUERY_PARAM}=1` : base;
}
