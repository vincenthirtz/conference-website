// utils/maps/roundPools.ts
//
// Journées d'un tournoi vues du pool de cartes : parsing du paramètre `round`
// et construction de la liste des journées à partir du PLANNING.
//
// POURQUOI ICI : `tournament_maps.round_number` existe depuis la migration
// `tournament_maps_round_scoped_pool.sql`, mais l'écran d'administration du
// pool ne connaissait qu'un seul pool par tournoi. Il listait donc les lignes
// de TOUTES les journées mélangées, et son bouton « supprimer toutes les
// maps » effaçait les pools des journées avec le reste. Les fonctions ci-dessous
// sont PURES pour que ce découpage soit testable sans base.

/** Une journée telle que l'écran d'administration la propose. */
export type RoundOption = {
  /** `matches.round_number` — la clé du pool de cette journée. */
  round: number;
  /** `matches.round_name` quand il existe, sinon « J<n> ». */
  label: string;
  /** Jours distincts programmés, en `YYYY-MM-DD` (Europe/Paris), triés. */
  days: string[];
  /** Nombre de cartes déjà déclarées pour cette journée. */
  mapsCount: number;
};

export type ParsedRound =
  | { ok: true; round: number | null }
  | { ok: false; error: string };

/**
 * Journée demandée par l'appelant.
 *
 * Absent, vide ou `default` → `null`, c'est-à-dire le POOL PAR DÉFAUT du
 * tournoi (`round_number IS NULL`) : le comportement historique reste celui
 * d'un appel sans paramètre, et aucun client existant ne change de sens.
 *
 * Toute autre valeur doit être un entier ≥ 1. On REFUSE plutôt que de retomber
 * silencieusement sur le pool par défaut : un `?round=deux` traité comme
 * « défaut » ferait écrire dans le mauvais pool sans que personne le voie.
 * PURE.
 */
export function parseRoundParam(value: unknown): ParsedRound {
  if (Array.isArray(value)) return { ok: false, error: 'Invalid round' };
  if (value === undefined || value === null) return { ok: true, round: null };

  const raw = String(value).trim();
  if (raw === '' || raw.toLowerCase() === 'default') return { ok: true, round: null };

  // `Number()` accepterait « 2.5 », « 2e10 » ou « 0x2 » : on impose la forme
  // décimale entière, seule à correspondre à `matches.round_number`.
  if (!/^\d+$/.test(raw)) return { ok: false, error: 'Invalid round' };

  const round = Number(raw);
  if (!Number.isSafeInteger(round) || round < 1) {
    return { ok: false, error: 'Invalid round' };
  }
  return { ok: true, round };
}

/**
 * Jour civil d'un instant, à Paris, en `YYYY-MM-DD`.
 *
 * Le fuseau est EXPLICITE : sans lui, un serveur en UTC classerait un match du
 * 23/09 à 00h30 (heure de Paris) au 22/09. Renvoie null si la date est
 * inexploitable. PURE.
 */
export function parisDayKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  // `en-CA` produit déjà `YYYY-MM-DD`, sans reconstruction manuelle.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

type MatchRow = {
  round_number: number | null;
  round_name?: string | null;
  scheduled_at?: string | null;
};

/**
 * Journées proposables, dérivées du PLANNING (`matches`) et non d'une saisie
 * libre : on ne peut déclarer un pool que pour une journée qui existe.
 *
 * `mapCounts` associe une journée au nombre de cartes déjà déclarées ; une
 * journée sans pool propre apparaît quand même, à zéro — c'est justement celle
 * qu'on vient remplir.
 *
 * Trié par numéro de journée croissant. PURE.
 */
export function buildRoundOptions(
  matches: MatchRow[],
  mapCounts: Map<number, number> = new Map()
): RoundOption[] {
  const byRound = new Map<number, { label: string | null; days: Set<string> }>();

  for (const row of matches) {
    const round = row.round_number;
    if (typeof round !== 'number' || !Number.isFinite(round)) continue;

    const entry = byRound.get(round) ?? { label: null, days: new Set<string>() };
    // Le premier libellé non vide gagne : `round_name` est censé être constant
    // pour une journée, mais rien ne l'impose en base.
    if (!entry.label && row.round_name) entry.label = row.round_name;
    const day = parisDayKey(row.scheduled_at ?? null);
    if (day) entry.days.add(day);
    byRound.set(round, entry);
  }

  // Une journée peut porter un pool sans (ou avant d'avoir) de match daté :
  // elle doit rester listée, sinon son pool deviendrait inaccessible à l'écran.
  for (const round of mapCounts.keys()) {
    if (!byRound.has(round)) {
      byRound.set(round, { label: null, days: new Set<string>() });
    }
  }

  return [...byRound.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([round, entry]) => ({
      round,
      label: entry.label || `J${round}`,
      days: [...entry.days].sort(),
      mapsCount: mapCounts.get(round) ?? 0,
    }));
}
