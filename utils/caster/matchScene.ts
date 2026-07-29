// Logique pure de la scène `match` du cockpit caster web — port fidèle des
// helpers de l'app desktop womenscup-caster (src/renderer/teamFields.js +
// la logique inline de src/overlays/match.html). Zéro DOM : testé en Vitest.

import type { HeroBan, MatchSceneData } from '@/types/caster';

/** Map pool Overwatch de secours quand le tournoi ne fournit pas ses maps. */
export const DEFAULT_MAPS = [
  'Ilios',
  'Lijiang Tower',
  'Nepal',
  'Oasis',
  'Busan',
  'Antarctic Peninsula',
  'Samoa',
  'Circuit Royal',
  'Dorado',
  'Havana',
  'Junkertown',
  'Rialto',
  'Route 66',
  'Shambali Monastery',
  "King's Row",
  'Midtown',
  'Numbani',
  'Hollywood',
  'Eichenwalde',
  'Blizzard World',
  'Colosseo',
  'Esperança',
  'New Junk City',
  'Suravasa',
  'New Queen Street',
  'Paraíso',
  'Flashpoint',
] as const;

/**
 * Un ban est stocké en `{ key, name, portrait }` mais on reste tolérant à une
 * chaîne nue (legacy / saisie manuelle) utilisée comme nom.
 */
export function normalizeBan(
  ban: unknown
): { name: string; portrait: string } | null {
  if (!ban) return null;
  if (typeof ban === 'string') {
    const name = ban.trim();
    return name ? { name, portrait: '' } : null;
  }
  if (typeof ban !== 'object') return null;
  const b = ban as { key?: string; name?: string; portrait?: string };
  const name = b.name || b.key || '';
  if (!name) return null;
  return { name, portrait: b.portrait || '' };
}

export type SeriesDotsModel = {
  /** Une entrée par map de la série (BO5 → 5, plafonné à 9), true = gagnée. */
  t1: boolean[];
  t2: boolean[];
};

/**
 * Pastilles de progression de série au-dessus du scoreboard. `null` = masquées
 * (désactivées par la scène, ou BO absent/invalide).
 */
export function seriesDotsModel(
  data: Pick<MatchSceneData, 'bestOf' | 'score1' | 'score2' | 'seriesDots'>
): SeriesDotsModel | null {
  const bo = Number(data.bestOf) || 0;
  if (data.seriesDots === false || bo < 2) return null;
  const total = Math.min(bo, 9);
  const s1 = Number(data.score1) || 0;
  const s2 = Number(data.score2) || 0;
  return {
    t1: Array.from({ length: total }, (_, i) => i < s1),
    t2: Array.from({ length: total }, (_, i) => i < s2),
  };
}

/** `womenscup` → `#womenscup` ; conserve un # déjà présent ; '' → ''. */
export function formatHashtag(hashtag: string): string {
  if (!hashtag) return '';
  return hashtag.startsWith('#') ? hashtag : `#${hashtag}`;
}

/** Ligne des casters du ticker (` · ` comme l'overlay desktop). */
export function castersLine(casters: unknown): string {
  if (Array.isArray(casters)) return casters.filter(Boolean).join(' · ');
  return casters ? String(casters) : '';
}

/** Initiale de repli quand une équipe n'a pas de logo. */
export function teamInitial(name: string): string {
  return (name || '?').charAt(0).toUpperCase();
}

/** `"Caster A, Caster B"` → `['Caster A', 'Caster B']` (saisie de l'éditeur). */
export function parseCastersInput(value: string): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
}

/**
 * Options du <select> map de l'éditeur : maps du tournoi si fournies, sinon le
 * pool par défaut ; la valeur courante est conservée même hors liste.
 */
export function mapOptions(
  tournamentMaps: Array<{ map_name: string }> | null | undefined,
  current: string
): string[] {
  const maps =
    tournamentMaps && tournamentMaps.length > 0
      ? tournamentMaps.map((m) => m.map_name)
      : [...DEFAULT_MAPS];
  if (current && !maps.includes(current)) maps.unshift(current);
  return maps;
}

/** Valeurs par défaut d'une scène match vide (aligne l'app desktop). */
export function defaultMatchData(): MatchSceneData {
  return {
    team1: '',
    team2: '',
    score1: 0,
    score2: 0,
    map: DEFAULT_MAPS[0],
    bestOf: 5,
    seriesDots: true,
    overwatchHud: false,
    ban1: null,
    ban2: null,
    casters: [],
    team1Logo: '',
    team2Logo: '',
    hashtag: '',
    socials: {
      site: '',
      discord: '',
      twitch: '',
      youtube: '',
      instagram: '',
      tiktok: '',
    },
    matchId: null,
  };
}

/**
 * Fusionne la `data` jsonb brute d'une scène match avec les défauts — les
 * scènes créées côté app peuvent omettre des champs récents.
 */
export function normalizeMatchData(
  raw: Record<string, unknown> | null | undefined
): MatchSceneData {
  const d = (raw || {}) as Partial<MatchSceneData>;
  const base = defaultMatchData();
  return {
    ...base,
    ...d,
    score1: Number(d.score1) || 0,
    score2: Number(d.score2) || 0,
    bestOf: Number(d.bestOf) || base.bestOf,
    seriesDots: d.seriesDots !== false,
    overwatchHud: d.overwatchHud === true,
    ban1: (d.ban1 as HeroBan) ?? null,
    ban2: (d.ban2 as HeroBan) ?? null,
    casters: Array.isArray(d.casters) ? d.casters : [],
    socials: { ...base.socials, ...(d.socials || {}) },
  };
}
