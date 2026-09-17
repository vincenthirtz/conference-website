// utils/overlay/dayOverlay.ts
//
// Le cœur PUR de la source « matchs du jour » (`/overlay/day`) : quelle journée
// l'URL désigne, quels matchs d'un tournoi y tombent, dans quel ordre, et
// lequel est « celui du moment ».
//
// LA JOURNÉE EST CELLE DE PARIS, pas celle du serveur (UTC sur Netlify) ni
// celle du PC de régie. Un match programmé à 00:30 heure de Paris est en UTC la
// veille au soir : sans ce calage, la dernière rencontre d'une soirée tardive
// disparaîtrait de la liste — ou celle du lendemain s'y inviterait. Les
// sources par match affichent déjà leurs heures en Europe/Paris.
//
// Rien ici ne touche au réseau. Le handler lit, ce module décide.

import {
  buildOverlayMatch,
  pickOverlayMatch,
  type MatchRowForOverlay,
  type OverlayMatchView,
  type TeamRowForOverlay,
} from '@/utils/overlay/matchOverlay';

export const OVERLAY_DAY_TIME_ZONE = 'Europe/Paris';

/** Au-delà, la liste ne tient plus dans un cadre 1080p ; le reste est coupé. */
export const MAX_DAY_MATCHES = 40;

/** Un match de la journée : la vue d'antenne, sans manches ni veto. */
export type OverlayDayMatchView = Omit<OverlayMatchView, 'maps' | 'veto'>;

export type DayBounds = {
  /** `YYYY-MM-DD`, jour calendaire à Paris. */
  date: string;
  startMs: number;
  /** Exclusif : minuit du lendemain, à Paris. */
  endMs: number;
};

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: OVERLAY_DAY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function parisParts(ms: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of partsFormatter.formatToParts(new Date(ms))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return out;
}

/** Décalage de Paris sur UTC à cet instant, en ms (+1 h l'hiver, +2 h l'été). */
function parisOffsetMs(ms: number): number {
  const p = parisParts(ms);
  const asUtc = Date.UTC(
    p.year!,
    p.month! - 1,
    p.day!,
    p.hour!,
    p.minute!,
    p.second!
  );
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** Minuit à Paris pour ce jour calendaire, en ms UTC. */
function parisMidnight(year: number, month: number, day: number): number {
  const guess = Date.UTC(year, month - 1, day);
  // Deux passes : le décalage lu au « faux minuit » UTC peut différer de celui
  // du vrai minuit parisien les nuits de changement d'heure.
  const first = guess - parisOffsetMs(guess);
  return guess - parisOffsetMs(first);
}

/** Jour calendaire parisien d'un instant, `YYYY-MM-DD`. */
export function parisDateKey(ms: number): string {
  const p = parisParts(ms);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/**
 * Lit `?date=` : absent → aujourd'hui à Paris ; `YYYY-MM-DD` valide → ce jour ;
 * tout le reste → `null` (erreur de configuration, 400 côté route).
 */
export function resolveDayBounds(
  raw: string | null | undefined,
  nowMs: number
): DayBounds | null {
  const value = (raw ?? '').trim();
  const key = value || parisDateKey(nowMs);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // Refuse le 2026-02-31 que Date.UTC normaliserait silencieusement en mars.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return {
    date: key,
    startMs: parisMidnight(year, month, day),
    endMs: parisMidnight(year, month, day + 1),
  };
}

function msOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * L'instant qui range un match dans la journée : son heure prévue, sinon son
 * coup d'envoi réel. Un match lancé sans horaire (bracket joué « à la suite »)
 * appartient au jour où il s'est joué.
 */
function dayAnchorMs(row: MatchRowForOverlay): number | null {
  return msOf(row.scheduled_at) ?? msOf(row.started_at) ?? null;
}

/** Les matchs de la journée, dans l'ordre du programme. */
export function selectDayMatches<T extends MatchRowForOverlay>(
  rows: T[],
  bounds: DayBounds
): T[] {
  return rows
    .filter((row) => {
      const at = dayAnchorMs(row);
      return at != null && at >= bounds.startMs && at < bounds.endMs;
    })
    .sort((a, b) => {
      const diff = (dayAnchorMs(a) ?? 0) - (dayAnchorMs(b) ?? 0);
      if (diff !== 0) return diff;
      // Deux matchs à la même heure (poules en parallèle) : ordre stable et
      // lisible plutôt que l'ordre de la base, qui peut changer d'un appel à
      // l'autre et faire sauter les lignes à l'écran.
      return (
        (a.round_name ?? '').localeCompare(b.round_name ?? '') ||
        a.id.localeCompare(b.id)
      );
    })
    .slice(0, MAX_DAY_MATCHES);
}

/**
 * Projette la journée pour l'écran.
 *
 * `currentMatchId` reprend la règle du « match du moment » des sources par
 * match (en cours, sinon prochain à jouer, sinon dernier résultat frais), mais
 * restreinte à la journée : la source « du jour » ne doit pas mettre en avant
 * un match de la veille.
 */
export function buildDayOverlay(input: {
  rows: MatchRowForOverlay[];
  teams: Map<string, TeamRowForOverlay>;
  bounds: DayBounds;
  nowMs: number;
}): { matches: OverlayDayMatchView[]; currentMatchId: string | null } {
  const dayRows = selectDayMatches(input.rows, input.bounds);
  const matches = dayRows.map((row) => {
    const {
      maps: _maps,
      veto: _veto,
      ...view
    } = buildOverlayMatch({
      match: row,
      team1: input.teams.get(row.team1_id ?? '') ?? null,
      team2: input.teams.get(row.team2_id ?? '') ?? null,
    });
    return view;
  });
  return {
    matches,
    currentMatchId: pickOverlayMatch(dayRows, input.nowMs)?.id ?? null,
  };
}

/**
 * Les lignes montrées quand la journée dépasse `limit` : une fenêtre qui garde
 * le match du moment en deuxième position (le précédent reste visible pour son
 * résultat), sans jamais laisser de vide en bas de liste.
 */
export function dayWindow<T extends { id: string }>(
  matches: T[],
  currentMatchId: string | null,
  limit: number
): T[] {
  if (matches.length <= limit) return matches;
  const idx = currentMatchId
    ? matches.findIndex((m) => m.id === currentMatchId)
    : -1;
  const start =
    idx < 0 ? 0 : Math.min(Math.max(0, idx - 1), matches.length - limit);
  return matches.slice(start, start + limit);
}

/** `?limit=` : 1 → 12, 8 par défaut (ce qui tient lisiblement en 1080p). */
export function parseDayLimit(raw: string | null | undefined): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return 8;
  return Math.min(12, Math.max(1, n));
}
