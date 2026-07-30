// Lectures HTTP de l'API PUBLIQUE versionnée du site (`/api/public/v1/*`) pour
// les pickers des scènes « données du site » du cockpit caster (lot 6 :
// bracket, player, leaderboard, standings).
//
// Pourquoi un client dédié et pas tournamentsClient.ts : celui-là parle à
// `/api/caster/v1/*` (enveloppes `{ tournaments }`, `{ matches }`… et périmètre
// running/published seulement). Ici le contrat est différent — enveloppe
// `{ data, pagination }` de `withPublicApi` — et le périmètre inclut les
// tournois `completed`, indispensable pour la scène `standings` (classement
// FINAL). Deux contrats, deux clients.
//
// Aucune auth : `withPublicApi` n'exige aucun token (posture volontaire
// documentée dans utils/publicApi.ts), et ce sont exactement les routes que les
// overlays consomment. Appels same-origin, donc tenant par défaut.
//
// Chaque GET est borné par AbortController : `fetch` n'a pas de timeout par
// défaut, et un endpoint qui pend gèlerait le picker en plein direct.

export const PUBLIC_API_TIMEOUT_MS = 8000;

/** Ligne de GET /api/public/v1/tournaments (champs consommés par le picker). */
export type PublicApiTournamentRow = {
  id: string;
  name: string | null;
  slug: string | null;
  status: string | null;
};

/** Ligne de GET /api/public/v1/leaderboard (cf. types/rating LeaderboardPlayer). */
export type PublicApiPlayerRow = {
  userId: string;
  displayName: string | null;
  battleTag: string | null;
  rank: number | null;
  rating: number | null;
};

/** Ligne de GET /api/public/v1/leagues (cf. types/leagues League). */
export type PublicApiLeagueRow = {
  slug: string;
  name: string | null;
  status: string | null;
};

/** GET + enveloppe `{ data }` de withPublicApi, avec timeout borné. */
async function publicGetList<T>(pathname: string): Promise<T[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PUBLIC_API_TIMEOUT_MS);
  try {
    const res = await fetch(pathname, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => null)) as {
      data?: T[];
      error?: string;
    } | null;
    if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
    const data = json?.data;
    return Array.isArray(data) ? data : [];
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      throw new Error(`timeout (${PUBLIC_API_TIMEOUT_MS}ms)`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Tournois publics (published / running / completed), plus récents d'abord.
 * Alimente les pickers des scènes `bracket` et `standings`.
 */
export async function fetchPublicTournaments(
  limit = 100
): Promise<PublicApiTournamentRow[]> {
  return publicGetList<PublicApiTournamentRow>(
    `/api/public/v1/tournaments?limit=${encodeURIComponent(String(limit))}`
  );
}

/**
 * Classement Glicko-2 public — sert de répertoire de joueuses au picker de la
 * scène `player` (exactement ce que fait playerEditor.js côté desktop).
 */
export async function fetchPublicLeaderboard(
  limit = 100
): Promise<PublicApiPlayerRow[]> {
  return publicGetList<PublicApiPlayerRow>(
    `/api/public/v1/leaderboard?limit=${encodeURIComponent(String(limit))}`
  );
}

/** Ligues publiques (picker de la scène `leaderboard` en mode « ligue »). */
export async function fetchPublicLeagues(): Promise<PublicApiLeagueRow[]> {
  return publicGetList<PublicApiLeagueRow>('/api/public/v1/leagues');
}
