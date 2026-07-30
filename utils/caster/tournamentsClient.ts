// Lectures HTTP du match picker web — mêmes routes que l'app desktop
// (`/api/caster/v1/*`, GET publics, contrat documenté dans
// docs/CASTER_API_CONTRACT.md). Port de womenscup-caster/src/main/utils/tournamentsApi.js.
//
// Pourquoi un `fetch` nu et pas useAdminFetch : ces routes sont des GET publics
// SANS gate d'auth (posture volontaire, cf. l'en-tête de utils/casterApi.ts) —
// y coller un Bearer Supabase n'apporterait rien et couplerait le picker à la
// session. Appels same-origin : pas de header `x-tenant-id` → tenant par défaut,
// exactement comme le desktop hors harnais E2E.
//
// Chaque GET est borné par AbortController : `fetch` n'a pas de timeout par
// défaut, et un site qui pend gèlerait le picker en plein direct.

import type {
  CasterApiGame,
  CasterApiMatch,
  CasterApiTournament,
  CasterApiTournamentMap,
} from '@/types/caster';

export const CASTER_API_TIMEOUT_MS = 8000;

async function apiGet<T>(pathname: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CASTER_API_TIMEOUT_MS);
  try {
    const res = await fetch(pathname, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      throw new Error(`timeout (${CASTER_API_TIMEOUT_MS}ms)`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Tournois diffusables (status running/published), plus récents d'abord. */
export async function fetchCasterTournaments(): Promise<CasterApiTournament[]> {
  const json = await apiGet<{ tournaments?: CasterApiTournament[] }>(
    '/api/caster/v1/tournaments'
  );
  return json?.tournaments || [];
}

/** Matchs d'un tournoi (pending/ongoing/finished), triés par créneau. */
export async function fetchCasterTournamentMatches(
  tournamentId: string
): Promise<CasterApiMatch[]> {
  const json = await apiGet<{ matches?: CasterApiMatch[] }>(
    `/api/caster/v1/tournaments/${encodeURIComponent(tournamentId)}/matches`
  );
  return json?.matches || [];
}

/** Map pool actif d'un tournoi (alimente le select map de l'éditeur match). */
export async function fetchCasterTournamentMaps(
  tournamentId: string
): Promise<CasterApiTournamentMap[]> {
  const json = await apiGet<{ maps?: CasterApiTournamentMap[] }>(
    `/api/caster/v1/tournaments/${encodeURIComponent(tournamentId)}/maps`
  );
  return json?.maps || [];
}

/** Détail d'un match + ses `games` (résultats par map). */
export async function fetchCasterMatchDetail(matchId: string): Promise<{
  match: CasterApiMatch | null;
  games: CasterApiGame[];
}> {
  const json = await apiGet<{
    match?: CasterApiMatch | null;
    games?: CasterApiGame[];
  }>(`/api/caster/v1/matches/${encodeURIComponent(matchId)}`);
  return { match: json?.match || null, games: json?.games || [] };
}
