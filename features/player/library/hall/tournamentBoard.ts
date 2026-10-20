// features/player/library/hall/tournamentBoard.ts — le MODÈLE du tableau du
// tournoi en cours, dans le hall (lot 7 de docs/PLAN-womens-library.md). PUR :
// il lit des réponses déjà reçues et décide quoi montrer. Les appels vivent
// dans `tournamentClient.ts`, le rendu dans `ui/hall/TournamentBoardPanel.tsx`.
//
// RIEN DE NOUVEAU CÔTÉ API : les lectures sont celles du site public.
//   - `GET /api/public/v1/tournaments`, puis `/{id}` (les phases) et
//     `/{id}/matches` ;
//   - le classement EN COURS de `GET /api/overlay/standings` — le même calcul
//     que la page « Classement » (readPublicStandings). `/v1/{id}/standings`
//     ne rend que le classement FINAL (`final_rankings`), vide pendant le
//     tournoi.
// Et les règles du site public :
//   - quel tournoi : celles de utils/currentTournament.ts (en cours, sinon
//     publié et commencé depuis moins de 30 jours), puis le PROCHAIN annoncé ;
//   - quels matchs : `buildLiveHub` (utils/tournament/liveHub.ts), le bloc
//     « Où en est le tournoi » de la landing, forfaits compris ;
//   - quelle table : celle de la phase en cours, sinon `pickStandingsTable`.

import type { PublicMatch } from '@/utils/public/readMatches';
import {
  type OverlayStandingsTableView,
  pickStandingsTable,
} from '@/utils/overlay/standingsOverlay';
import { BRACKET_STAGE_TYPE } from '@/utils/stages/bracketStage';
import type { PublicStandingsTable } from '@/utils/stages/publicStandings';
import {
  buildLiveHub,
  type HubMatch,
  type HubTeam,
  hasResult,
  type LiveHub,
} from '@/utils/tournament/liveHub';

/** Une ligne de `GET /api/public/v1/tournaments` (contrat v1). */
export type BoardTournamentRow = {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
};

/** Une phase de `GET /api/public/v1/tournaments/{id}` (`stages`). */
export type BoardStageRow = {
  id: string;
  name: string | null;
  stage_type: string | null;
  /** `active` | `inactive` (dérivé de `is_active` par l'API). */
  status: string;
};

export type BoardTournamentDetail = BoardTournamentRow & {
  stages: BoardStageRow[];
};

/** `running` : en cours (ou commencé) ; `upcoming` : le prochain annoncé. */
export type BoardPhase = 'running' | 'upcoming';

export type BoardStandings =
  | { kind: 'tables'; tables: PublicStandingsTable[] }
  | { kind: 'unavailable' };

export type BoardRoundSide = 'main' | 'lower' | 'final';

/** Le tour en cours d'un côté du tableau (élimination). */
export type BoardRound = {
  side: BoardRoundSide;
  round: number;
  matches: HubMatch[];
};

export type TournamentBoard = {
  tournament: BoardTournamentRow;
  phase: BoardPhase;
  stage: BoardStageRow | null;
  hub: LiveHub;
  /** null : la phase en cours n'est pas une phase à points. */
  standings: BoardStandings | null;
  /** null : la phase en cours n'est pas un arbre d'élimination. */
  bracket: BoardRound[] | null;
};

/**
 * Phases à points — `STANDINGS_STAGE_TYPES` de utils/stages/publicStandings,
 * recopié ici parce que ce module-là lit la base (test de parité :
 * tests/unit/libraryHallTournament.test.tsx).
 */
export const BOARD_STANDINGS_STAGE_TYPES = [
  'round_robin',
  'group',
  'swiss',
] as const;

/** La fenêtre de utils/currentTournament.ts (étape 3). */
export const STARTED_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** Matchs à venir et derniers résultats montrés (en direct : tous). */
export const BOARD_LIMITS = { upcoming: 3, recent: 3 } as const;

const DECIDED = new Set(['finished', 'completed', 'walkover']);

function startOf(t: { start_date: string | null }): number | null {
  const ms = t.start_date ? Date.parse(t.start_date) : Number.NaN;
  return Number.isFinite(ms) ? ms : null;
}

const MIN = Number.MIN_SAFE_INTEGER;
const MAX = Number.MAX_SAFE_INTEGER;

/**
 * Le tournoi du tableau : le plus récent EN COURS ; sinon un tournoi publié
 * commencé depuis moins de 30 jours (le statut n'a pas encore été basculé) ;
 * sinon le PROCHAIN annoncé (date la plus proche, puis sans date) ; sinon
 * rien. Les tournois terminés n'y vont jamais.
 */
export function pickBoardTournament(
  list: readonly BoardTournamentRow[],
  now: Date
): { tournament: BoardTournamentRow; phase: BoardPhase } | null {
  const nowMs = now.getTime();
  const latestFirst = (a: BoardTournamentRow, b: BoardTournamentRow) =>
    (startOf(b) ?? MIN) - (startOf(a) ?? MIN);

  const running = list.filter((t) => t.status === 'running').sort(latestFirst);
  if (running[0]) return { tournament: running[0], phase: 'running' };

  const published = list.filter((t) => t.status === 'published');
  const started = published
    .filter((t) => {
      const s = startOf(t);
      return s !== null && s <= nowMs && s >= nowMs - STARTED_WINDOW_MS;
    })
    .sort(latestFirst);
  if (started[0]) return { tournament: started[0], phase: 'running' };

  const next = published
    .filter((t) => (startOf(t) ?? MAX) > nowMs)
    .sort((a, b) => (startOf(a) ?? MAX) - (startOf(b) ?? MAX));
  return next[0] ? { tournament: next[0], phase: 'upcoming' } : null;
}

function hubTeam(
  id: string | null,
  name: string | null,
  logoUrl: string | null
): HubTeam | null {
  return id
    ? { id, slug: null, name: name ?? '', short_name: null, logo_url: logoUrl }
    : null;
}

/** Un match de l'API v1 dans la forme du bloc « Où en est le tournoi ». */
export function toHubMatch(m: PublicMatch): HubMatch {
  return {
    id: m.id,
    scheduled_at: m.scheduled_at,
    status: m.status,
    // La v1 ne dit pas `is_bye` : un match tranché à qui il manque une équipe
    // est une exemption, pas un match.
    is_bye: DECIDED.has(m.status) && (!m.team1_id || !m.team2_id),
    round_name: null,
    match_format: null,
    team1_score: m.team1_score,
    team2_score: m.team2_score,
    winner_team_id: m.winner_team_id,
    forfeit_team_id: null,
    stream_url: null,
    team1: hubTeam(m.team1_id, m.team1_name, m.team1_logo_url),
    team2: hubTeam(m.team2_id, m.team2_name, m.team2_logo_url),
  };
}

/**
 * La phase en cours : celle d'un match en direct (la plus avancée) ; sinon la
 * dernière phase active ; sinon celle du prochain match ; sinon la dernière
 * qui a un résultat ; sinon aucune (tournoi pas encore lancé).
 */
export function boardStageOf(
  stages: readonly BoardStageRow[],
  matches: readonly PublicMatch[]
): BoardStageRow | null {
  const order = new Map(stages.map((s, i) => [s.id, i]));
  const latest = (list: readonly PublicMatch[]) => {
    let best = -1;
    for (const m of list)
      best = Math.max(best, order.get(m.stage_id ?? '') ?? -1);
    return best >= 0 ? stages[best] : null;
  };

  const live = latest(matches.filter((m) => m.status === 'ongoing'));
  if (live) return live;
  const active = [...stages].reverse().find((s) => s.status === 'active');
  if (active) return active;
  const next = matches
    .filter((m) => m.status === 'pending' && order.has(m.stage_id ?? ''))
    .sort(
      (a, b) =>
        (a.scheduled_at ? Date.parse(a.scheduled_at) : MAX) -
        (b.scheduled_at ? Date.parse(b.scheduled_at) : MAX)
    )[0];
  if (next) return stages[order.get(next.stage_id ?? '') ?? 0];
  return latest(matches.filter((m) => DECIDED.has(m.status)));
}

export function isStandingsStage(stage: BoardStageRow | null): boolean {
  return (BOARD_STANDINGS_STAGE_TYPES as readonly string[]).includes(
    stage?.stage_type ?? ''
  );
}

/** Les tables de la phase (une par poule), sinon celle du classement en cours. */
export function stageTables(
  tables: readonly OverlayStandingsTableView[],
  stageId: string | null
): OverlayStandingsTableView[] {
  const own = stageId
    ? tables.filter((t) => t.key === stageId || t.key.startsWith(`${stageId}:`))
    : [];
  if (own.length > 0) return own;
  const picked = pickStandingsTable([...tables]);
  return picked ? [picked] : [];
}

/**
 * Une table du classement en cours, dans la forme qu'attend `StandingsMini`
 * (la landing). La source ne donne que l'ÉCART de maps : il est rendu tel
 * quel (`StandingsMini` n'affiche que lui), jamais des maps inventées à part.
 */
export function toPublicStandingsTable(
  view: OverlayStandingsTableView,
  stageType: string
): PublicStandingsTable {
  return {
    key: view.key,
    stageName: view.stageName,
    stageType,
    groupKey: view.groupKey,
    rows: view.rows.map((r) => ({
      rank: r.rank,
      teamId: r.team.id,
      teamName: r.team.name,
      shortName: r.team.shortName,
      slug: null,
      logoUrl: r.team.logoUrl,
      played: r.played,
      wins: r.wins,
      losses: r.losses,
      draws: r.draws,
      points: r.points,
      mapsWon: Math.max(0, r.mapDiff),
      mapsLost: Math.max(0, -r.mapDiff),
      form: r.form,
      tiebrokenBy: null,
      disqualified: r.disqualified,
      disqualificationMode: null,
    })),
  };
}

const SIDE_ORDER: readonly BoardRoundSide[] = ['main', 'lower', 'final'];

function sideOf(raw: string | null): BoardRoundSide {
  if (raw === 'lb') return 'lower';
  if (raw === 'final') return 'final';
  return 'main';
}

const bySchedule = (a: HubMatch, b: HubMatch) =>
  (a.scheduled_at ? Date.parse(a.scheduled_at) : MAX) -
  (b.scheduled_at ? Date.parse(b.scheduled_at) : MAX);

/**
 * Le tour EN COURS de chaque côté d'un arbre : le premier tour qui a un match
 * sans résultat, sinon le dernier. Exemptions exclues ; un côté dont aucune
 * affiche n'est encore connue (finale à venir) n'est montré que s'il est seul.
 */
export function currentRounds(
  matches: readonly PublicMatch[],
  stageId: string
): BoardRound[] {
  const sides = new Map<BoardRoundSide, Map<number, HubMatch[]>>();
  for (const m of matches) {
    if (m.stage_id !== stageId || m.status === 'cancelled') continue;
    const hub = toHubMatch(m);
    if (hub.is_bye) continue;
    const side = sideOf(m.bracket_side);
    const rounds = sides.get(side) ?? new Map<number, HubMatch[]>();
    const round = m.round_number ?? 1;
    rounds.set(round, [...(rounds.get(round) ?? []), hub]);
    sides.set(side, rounds);
  }
  const out: BoardRound[] = [];
  for (const side of SIDE_ORDER) {
    const rounds = sides.get(side);
    if (!rounds) continue;
    const numbers = [...rounds.keys()].sort((a, b) => a - b);
    const round =
      numbers.find((n) => rounds.get(n)?.some((m) => !hasResult(m))) ??
      numbers[numbers.length - 1];
    const list = [...(rounds.get(round) ?? [])].sort(bySchedule);
    out.push({ side, round, matches: list });
  }
  const known = out.filter((r) => r.matches.some((m) => m.team1 || m.team2));
  return known.length > 0 ? known : out;
}

/** Ce qu'une ligne de match affiche à droite des équipes. */
export type BoardMatchState =
  | { kind: 'live'; score1: number; score2: number }
  | { kind: 'upcoming'; at: string | null }
  | { kind: 'result'; score1: number; score2: number }
  | {
      kind: 'forfeit';
      score: { score1: number; score2: number } | null;
      winner: HubTeam | null;
    };

/**
 * En direct : le score du moment ; à venir : l'horaire ; joué : le score. Un
 * FORFAIT montre son score, sauf à 0 - 0 — ce n'en est pas un (cf.
 * pages/tournament/[id]/matches.tsx) : c'est alors le vainqueur qui le dit.
 */
export function boardMatchState(m: HubMatch): BoardMatchState {
  if (m.status === 'ongoing')
    return {
      kind: 'live',
      score1: m.team1_score ?? 0,
      score2: m.team2_score ?? 0,
    };
  if (m.status === 'walkover') {
    const blank = !m.team1_score && !m.team2_score;
    const winner = !m.winner_team_id
      ? null
      : m.team1?.id === m.winner_team_id
        ? m.team1
        : m.team2?.id === m.winner_team_id
          ? m.team2
          : null;
    return {
      kind: 'forfeit',
      score: blank
        ? null
        : { score1: m.team1_score ?? 0, score2: m.team2_score ?? 0 },
      winner,
    };
  }
  if (hasResult(m))
    return {
      kind: 'result',
      score1: m.team1_score ?? 0,
      score2: m.team2_score ?? 0,
    };
  return { kind: 'upcoming', at: m.scheduled_at };
}

/** Le tableau, à partir des lectures (`standings` : null si non demandé). */
export function buildTournamentBoard(
  input: {
    phase: BoardPhase;
    detail: BoardTournamentDetail;
    matches: readonly PublicMatch[];
    stage: BoardStageRow | null;
    standings: readonly OverlayStandingsTableView[] | 'unavailable' | null;
  },
  now: Date
): TournamentBoard {
  const { detail, stage, standings } = input;
  let boardStandings: BoardStandings | null = null;
  if (stage && isStandingsStage(stage)) {
    boardStandings =
      standings === null || standings === 'unavailable'
        ? { kind: 'unavailable' }
        : {
            kind: 'tables',
            tables: stageTables(standings, stage.id).map((v) =>
              toPublicStandingsTable(v, stage.stage_type ?? '')
            ),
          };
  }
  return {
    tournament: {
      id: detail.id,
      name: detail.name,
      slug: detail.slug,
      status: detail.status,
      start_date: detail.start_date,
      end_date: detail.end_date,
    },
    phase: input.phase,
    stage,
    hub: buildLiveHub(input.matches.map(toHubMatch), now, BOARD_LIMITS),
    standings: boardStandings,
    bracket:
      stage?.stage_type === BRACKET_STAGE_TYPE
        ? currentRounds(input.matches, stage.id)
        : null,
  };
}
