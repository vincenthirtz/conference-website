// features/player/library/hall/tournamentClient.ts — les lectures du tableau
// du tournoi en cours, dans le hall (lot 7 de docs/PLAN-womens-library.md).
// Les URLs vivent ici ; `ui/` ne touche pas le réseau.
//
// DES ROUTES PUBLIQUES, PAS DE SESSION. Ce sont celles du site public
// (`tournamentBoard.ts` dit lesquelles et pourquoi) : ni jeton, ni en-tête
// au-delà d'`Accept` — `/api/public/*` part vers l'API distante
// (utils/remoteApi.ts), qui n'autorise que les en-têtes simples.
//
// Chaque appel est borné (`fetch` n'a pas de délai par défaut). Une réponse
// en erreur lève une `ApiHttpError` : une 4xx ne se réessaie pas
// (`playerRetry`). Le classement, lui, ne fait jamais échouer le tableau :
// refusé (palier sans sources de stream : 402) ou en panne, il devient
// « à lire sur la page du tournoi ».

import { ApiHttpError } from '@/utils/http/authedRequest';
import type { OverlayStandingsResponse } from '@/utils/overlay/standingsOverlay';
import type { PublicMatch } from '@/utils/public/readMatches';
import {
  type BoardTournamentDetail,
  type BoardTournamentRow,
  boardStageOf,
  buildTournamentBoard,
  isStandingsStage,
  pickBoardTournament,
  type TournamentBoard,
} from './tournamentBoard';

export const TOURNAMENT_BOARD_TIMEOUT_MS = 8000;

const tournamentPath = (id: string) =>
  `/api/public/v1/tournaments/${encodeURIComponent(id)}`;

export const tournamentBoardUrls = {
  /** Les tournois publics, les plus récents d'abord (en cours, publiés, finis). */
  list: '/api/public/v1/tournaments?limit=50',
  detail: tournamentPath,
  matches: (id: string) => `${tournamentPath(id)}/matches`,
  /** Le classement EN COURS (celui de la page « Classement »). */
  standings: (id: string) =>
    `/api/overlay/standings?tournament=${encodeURIComponent(id)}`,
} as const;

async function getJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    TOURNAMENT_BOARD_TIMEOUT_MS
  );
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) throw new ApiHttpError(`HTTP ${res.status}`, res.status, body);
    return body as T;
  } finally {
    clearTimeout(timer);
  }
}

/** L'enveloppe `{ data }` des routes `/api/public/v1/*`. */
async function dataOf<T>(url: string): Promise<T> {
  const body = await getJson<{ data?: T } | null>(url);
  if (!body || body.data === undefined || body.data === null)
    throw new ApiHttpError('Réponse illisible', 502, body);
  return body.data;
}

async function readStandings(
  id: string
): Promise<OverlayStandingsResponse['tables'] | 'unavailable'> {
  try {
    const body = await getJson<OverlayStandingsResponse | null>(
      tournamentBoardUrls.standings(id)
    );
    return Array.isArray(body?.tables) ? body.tables : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

/**
 * Le tableau du tournoi en cours (ou du prochain), `null` s'il n'y en a
 * aucun. Trois allers-retours au plus : la liste, puis la fiche et les
 * matchs ensemble, puis le classement si la phase en cours en a un.
 */
export async function loadTournamentBoard(
  now: Date = new Date()
): Promise<TournamentBoard | null> {
  const list = await dataOf<BoardTournamentRow[]>(tournamentBoardUrls.list);
  const picked = pickBoardTournament(Array.isArray(list) ? list : [], now);
  if (!picked) return null;
  const id = picked.tournament.id;
  const [detail, rawMatches] = await Promise.all([
    dataOf<BoardTournamentDetail>(tournamentBoardUrls.detail(id)),
    dataOf<PublicMatch[]>(tournamentBoardUrls.matches(id)),
  ]);
  const matches = Array.isArray(rawMatches) ? rawMatches : [];
  const stage = boardStageOf(detail.stages ?? [], matches);
  const standings = isStandingsStage(stage) ? await readStandings(id) : null;
  return buildTournamentBoard(
    { phase: picked.phase, detail, matches, stage, standings },
    now
  );
}
