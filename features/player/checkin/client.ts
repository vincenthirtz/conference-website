// features/player/checkin/client.ts — le check-in d'une équipe (lot P12).
//
// UNE SEULE ROUTE, À JETON PORTEUR : POST /api/checkin/{token}. C'est la même
// que le lien envoyé par le bot et la page /checkin/[token] : le jeton EST la
// clé (pas de session exigée), et il ne sort que pour qui peut pointer
// (capitaine, coach, manager — utils/teams/canCheckIn.ts).
//
// IDEMPOTENTE CÔTÉ SERVEUR : un second envoi répond `alreadyCheckedIn: true`
// sans double écriture. L'appel reste un `fetch` nu (pas de Bearer) : ajouter
// une session à une route à jeton changerait son contrat.

import { playerRequest } from '@/utils/player/playerHttp';
import type { NextMatchPayload } from './schemas';

export type CheckinResult = {
  alreadyCheckedIn?: boolean;
  error?: string;
  [key: string]: unknown;
};

export const checkinUrls = {
  byToken: (token: string) => `/api/checkin/${encodeURIComponent(token)}`,
  nextMatch: '/api/player/next-match',
};

/**
 * Pointe l'équipe. Lève une `Error` portant le message du serveur (ou
 * `fallback`) si la réponse n'est pas OK.
 */
export async function postCheckin(
  token: string,
  fallback: string
): Promise<CheckinResult> {
  const res = await fetch(checkinUrls.byToken(token), { method: 'POST' });
  const json = (await res.json().catch(() => null)) as CheckinResult | null;
  if (!res.ok) throw new Error(json?.error || fallback);
  return json ?? {};
}

/**
 * Le prochain match de l'équipe (GET /api/player/next-match). Portée ÉQUIPE
 * seule, comme la page /player/checkin l'a toujours posée (`?teamId=`).
 */
export function fetchNextMatch(teamId: string | null) {
  return playerRequest<NextMatchPayload>(checkinUrls.nextMatch, {
    scope: { subjectId: null, actAs: false, teamId },
    skipAuthRedirect: true,
  });
}
