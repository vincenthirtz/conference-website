// utils/overlay/matchOverlay.ts
//
// Le cœur PUR des sources de stream par match : transformer des lignes de base
// en ce qu'une source navigateur OBS affiche, et choisir « le match du
// moment » quand l'URL ne nomme pas de match.
//
// Pourquoi ici, et pas dans le handler : une régie tourne pendant des heures,
// et personne ne relit un tableau de score en direct pour vérifier que le
// bandeau dit la vérité. Les règles qui décident du score affiché, du gagnant
// d'une manche ou du match retenu doivent donc être testables sans base et
// sans navigateur — c'est tout l'objet de ce fichier.
//
// Rien ici ne touche au réseau. Le handler lit, ce module décide.

/** Où en est le match, du point de vue de l'écran. */
export type OverlayPhase = 'upcoming' | 'live' | 'final';

/** Un côté du match. 1 = équipe à gauche, 2 = équipe à droite. */
export type OverlaySide = 1 | 2;

/**
 * Statuts qui closent un match.
 *
 * `cancelled` en fait partie : un match annulé n'est plus à venir, et laisser
 * un compte à rebours courir dessus serait pire qu'un écran vide. La liste est
 * volontairement tolérante (`completed` ET `finished`) — les deux orthographes
 * circulent dans le code selon l'âge des chemins, et une source de stream
 * n'est pas le bon endroit pour trancher ce débat.
 *
 * `walkover` AUSSI : c'est le statut qu'écrit le forfait automatique (équipe
 * non enregistrée à l'heure). L'oublier laissait un match déjà tranché « à
 * venir » — sans score, et même désigné match du moment (constaté le
 * 2026-09-18 sur `/overlay/day`).
 */
const CLOSED_STATUSES = new Set([
  'finished',
  'completed',
  'forfeit',
  'walkover',
  'cancelled',
  'canceled',
]);

export type MatchRowForOverlay = {
  id: string;
  status: string | null;
  started_at: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  match_format: string | null;
  round_name: string | null;
  team1_id: string | null;
  team2_id: string | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
};

export type TeamRowForOverlay = {
  id: string;
  name: string | null;
  short_name: string | null;
  logo_url: string | null;
};

export type GameRowForOverlay = {
  map_name: string | null;
  map_order: number | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
};

export type VetoRowForOverlay = {
  step_number: number | null;
  action: string | null;
  map_name: string | null;
  team_id: string | null;
};

export type OverlayTeamView = {
  name: string;
  shortName: string | null;
  logoUrl: string | null;
  /** Score du match (manches gagnées), jamais `null` à l'écran : 0 par défaut. */
  score: number;
  isWinner: boolean;
};

export type OverlayMapView = {
  order: number;
  name: string | null;
  team1Score: number | null;
  team2Score: number | null;
  winner: OverlaySide | null;
};

export type OverlayVetoStepView = {
  step: number;
  action: 'ban' | 'pick' | 'decider';
  map: string | null;
  /** Qui a joué l'étape. `null` pour une decider map, que personne ne choisit. */
  side: OverlaySide | null;
};

export type OverlayMatchView = {
  id: string;
  phase: OverlayPhase;
  /** `bo1`, `bo3`… tel que saisi ; l'écran en tire « BO3 ». */
  format: string | null;
  roundName: string | null;
  scheduledAt: string | null;
  startedAt: string | null;
  team1: OverlayTeamView | null;
  team2: OverlayTeamView | null;
  maps: OverlayMapView[];
  veto: OverlayVetoStepView[];
};

/** Phase d'un match, du point de vue de l'écran. */
export function matchPhase(row: {
  status: string | null;
  started_at: string | null;
}): OverlayPhase {
  const status = (row.status ?? '').trim().toLowerCase();
  if (CLOSED_STATUSES.has(status)) return 'final';
  return row.started_at ? 'live' : 'upcoming';
}

function sideOf(
  teamId: string | null | undefined,
  team1Id: string | null,
  team2Id: string | null
): OverlaySide | null {
  if (!teamId) return null;
  if (teamId === team1Id) return 1;
  if (teamId === team2Id) return 2;
  return null;
}

function teamView(
  team: TeamRowForOverlay | null | undefined,
  score: number | null,
  isWinner: boolean
): OverlayTeamView | null {
  if (!team) return null;
  return {
    name: team.name ?? '',
    shortName: team.short_name ?? null,
    logoUrl: team.logo_url ?? null,
    score: typeof score === 'number' && Number.isFinite(score) ? score : 0,
    isWinner,
  };
}

const VETO_ACTIONS = new Set(['ban', 'pick', 'decider']);

/**
 * Projette un match et ses satellites en ce que l'écran affiche.
 *
 * Deux partis pris qui se voient à l'antenne :
 * - le score manquant s'affiche `0`, pas « — ». Un tableau de score qui montre
 *   un tiret pendant les dix premières minutes d'un direct a l'air cassé ;
 * - le vainqueur vient de `winner_team_id`, jamais d'une comparaison de
 *   scores. Un forfait se règle 3-0 en base mais peut aussi se régler 0-0 :
 *   recalculer le gagnant à l'écran, c'est contredire la feuille de match.
 */
export function buildOverlayMatch(input: {
  match: MatchRowForOverlay;
  team1: TeamRowForOverlay | null;
  team2: TeamRowForOverlay | null;
  games?: GameRowForOverlay[];
  vetos?: VetoRowForOverlay[];
}): OverlayMatchView {
  const { match, team1, team2 } = input;
  const winnerSide = sideOf(
    match.winner_team_id,
    match.team1_id,
    match.team2_id
  );

  const maps: OverlayMapView[] = (input.games ?? [])
    .slice()
    .sort((a, b) => (a.map_order ?? 0) - (b.map_order ?? 0))
    .map((g, i) => ({
      order: g.map_order ?? i + 1,
      name: g.map_name ?? null,
      team1Score: typeof g.team1_score === 'number' ? g.team1_score : null,
      team2Score: typeof g.team2_score === 'number' ? g.team2_score : null,
      winner: sideOf(g.winner_team_id, match.team1_id, match.team2_id),
    }));

  const veto: OverlayVetoStepView[] = (input.vetos ?? [])
    .filter((v) => VETO_ACTIONS.has((v.action ?? '').trim().toLowerCase()))
    .slice()
    .sort((a, b) => (a.step_number ?? 0) - (b.step_number ?? 0))
    .map((v, i) => ({
      step: v.step_number ?? i + 1,
      action: (v.action ?? '').trim().toLowerCase() as
        | 'ban'
        | 'pick'
        | 'decider',
      map: v.map_name ?? null,
      side: sideOf(v.team_id, match.team1_id, match.team2_id),
    }));

  return {
    id: match.id,
    phase: matchPhase(match),
    format: match.match_format ?? null,
    roundName: match.round_name ?? null,
    scheduledAt: match.scheduled_at ?? null,
    startedAt: match.started_at ?? null,
    team1: teamView(team1, match.team1_score, winnerSide === 1),
    team2: teamView(team2, match.team2_score, winnerSide === 2),
    maps,
    veto,
  };
}

/**
 * Fenêtre pendant laquelle un match terminé reste affiché, faute de mieux.
 *
 * Deux heures : le temps que la régie garde le résultat à l'écran après la
 * dernière manche sans qu'un overlay laissé branché ressuscite un match de la
 * veille en pleine émission du lendemain.
 */
export const RECENT_FINAL_WINDOW_MS = 2 * 60 * 60 * 1000;

/**
 * Tolérance avant l'heure prévue pendant laquelle un match compte déjà comme
 * « celui du moment ».
 *
 * Un match dont personne n'a cliqué « démarrer » reste `upcoming` en base. Sans
 * cette fenêtre, l'overlay « match du moment » basculerait sur le suivant à la
 * seconde où l'heure passe, en plein milieu du match réel.
 */
export const STARTING_SOON_MS = 90 * 60 * 1000;

/**
 * Choisit le match à afficher quand l'URL dit « le prochain » plutôt qu'un
 * identifiant.
 *
 * C'est la fonction qui permet de coller UNE URL dans OBS pour toute une
 * journée de compétition. L'ordre de préférence :
 *   1. un match en cours (le plus récemment démarré) ;
 *   2. sinon le prochain à jouer — y compris celui dont l'heure vient de
 *      passer sans que personne ne l'ait démarré (cf. STARTING_SOON_MS) ;
 *   3. sinon le dernier terminé, tant qu'il est frais (cf. la fenêtre) ;
 *   4. sinon rien : à l'écran, c'est l'écran d'attente, pas une erreur.
 */
export function pickOverlayMatch<T extends MatchRowForOverlay>(
  rows: T[],
  nowMs: number
): T | null {
  const live: T[] = [];
  const upcoming: T[] = [];
  const finals: T[] = [];

  for (const row of rows) {
    const phase = matchPhase(row);
    if (phase === 'live') live.push(row);
    else if (phase === 'upcoming') upcoming.push(row);
    else finals.push(row);
  }

  if (live.length > 0) {
    return live.sort(
      (a, b) => msOf(b.started_at, 0) - msOf(a.started_at, 0)
    )[0]!;
  }

  const playable = upcoming
    .filter((r) => r.scheduled_at != null)
    .filter((r) => msOf(r.scheduled_at, 0) + STARTING_SOON_MS >= nowMs)
    .sort((a, b) => msOf(a.scheduled_at, 0) - msOf(b.scheduled_at, 0));
  if (playable.length > 0) return playable[0]!;

  // Un match à venir sans heure (bracket pas encore planifié) vaut mieux qu'un
  // écran vide, mais passe après tout ce qui est daté.
  const undated = upcoming.filter((r) => r.scheduled_at == null);

  const recent = finals
    .filter(
      (r) =>
        msOf(r.completed_at ?? r.started_at, 0) > 0 &&
        nowMs - msOf(r.completed_at ?? r.started_at, 0) <=
          RECENT_FINAL_WINDOW_MS
    )
    .sort(
      (a, b) =>
        msOf(b.completed_at ?? b.started_at, 0) -
        msOf(a.completed_at ?? a.started_at, 0)
    );
  if (recent.length > 0) return recent[0]!;

  return undated[0] ?? null;
}

function msOf(iso: string | null | undefined, fallback: number): number {
  if (!iso) return fallback;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : fallback;
}

/** Les sources disponibles, et l'ordre dans lequel l'admin les propose. */
export const OVERLAY_SOURCES = [
  'scoreboard',
  'teams',
  'maps',
  'countdown',
  'waiting',
] as const;

export type OverlaySource = (typeof OVERLAY_SOURCES)[number];

/** Normalise le paramètre `source` d'une URL. Inconnu → tableau de score. */
export function parseOverlaySource(raw: unknown): OverlaySource {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return (OVERLAY_SOURCES as readonly string[]).includes(value)
    ? (value as OverlaySource)
    : 'scoreboard';
}
