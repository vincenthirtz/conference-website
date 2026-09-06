// utils/stages/tiebreakers.ts
//
// Le départage d'un classement de poule ou de round robin — lot 7 de
// docs/PLAN-plateforme-tournois.md.
//
// CE QUI MANQUAIT. Le classement triait par points, puis différence de score,
// puis victoires, puis seed. La CONFRONTATION DIRECTE n'y était pas, alors
// qu'elle est le premier départage de la quasi-totalité des règlements : à
// égalité de points, celle qui a battu l'autre passe devant. Et rien n'indiquait
// aux équipes par quel critère elles avaient été départagées — un classement
// qu'on ne peut pas expliquer est un classement qu'on conteste.
//
// COMMENT ÇA MARCHE. Les équipes sont d'abord groupées par points. Chaque groupe
// à égalité est ensuite scindé par les critères dans l'ORDRE configuré, et la
// récursion recommence sur les sous-groupes encore à égalité. Chaque équipe
// retient le critère qui l'a effectivement séparée du peloton.
//
// LA CONFRONTATION DIRECTE SE CALCULE DANS LE GROUPE, pas sur tout le tableau :
// « qui a battu qui » ne veut dire quelque chose qu'entre les équipes à égalité.
// À trois dans un cycle (A bat B, B bat C, C bat A), le critère ne tranche rien
// et laisse la main au suivant — c'est le comportement attendu, pas un défaut.
//
// Logique PURE : aucun accès base.

export type TiebreakerKey =
  /** Points marqués dans les matchs entre les seules équipes à égalité. */
  | 'head_to_head'
  /** Différence de score sur tout le stage. */
  | 'score_diff'
  /** Nombre de victoires. */
  | 'wins'
  /** Points de score marqués (et non la différence). */
  | 'scored'
  /** Tête de série. Dernier recours : il départage toujours. */
  | 'seed';

export const TIEBREAKER_KEYS: TiebreakerKey[] = [
  'head_to_head',
  'score_diff',
  'wins',
  'scored',
  'seed',
];

/**
 * L'ordre par défaut.
 *
 * `head_to_head` en tête parce que c'est la règle que les équipes connaissent.
 * `seed` en queue parce qu'il départage TOUJOURS : sans lui, deux équipes
 * parfaitement à égalité sortiraient dans un ordre dépendant de la base.
 */
export const DEFAULT_TIEBREAKER_ORDER: TiebreakerKey[] = [
  'head_to_head',
  'score_diff',
  'wins',
  'seed',
];

export interface TiebreakerTeam {
  teamId: string;
  points: number;
  wins: number;
  scoreDiff: number;
  /** Score total marqué sur le stage. */
  scored: number;
  seed: number | null;
}

/** Un match terminé, réduit à ce dont le départage a besoin. */
export interface TiebreakerMatch {
  team1Id: string | null;
  team2Id: string | null;
  team1Score: number | null;
  team2Score: number | null;
  winnerTeamId: string | null;
}

export interface RankedTeam extends TiebreakerTeam {
  rank: number;
  /**
   * Le critère qui a séparé cette équipe des autres à égalité de points.
   * `null` quand elle n'était à égalité avec personne, ou quand aucun critère
   * n'a tranché (elle reste ex æquo, l'ordre venant du dernier recours).
   */
  tiebrokenBy: TiebreakerKey | null;
}

/** Nettoie une liste venue des settings ; rend `null` si rien d'exploitable. */
export function parseTiebreakerOrder(
  value: unknown
): TiebreakerKey[] | null {
  if (!Array.isArray(value)) return null;
  const seen = new Set<string>();
  const out: TiebreakerKey[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const key = raw as TiebreakerKey;
    if (!TIEBREAKER_KEYS.includes(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  if (out.length === 0) return null;
  // `seed` fermé d'office : un ordre sans dernier recours rendrait le classement
  // dépendant de l'ordre de lecture en base, donc instable d'un affichage à
  // l'autre — le pire défaut possible pour un classement.
  if (!out.includes('seed')) out.push('seed');
  return out;
}

/**
 * Points de confrontation directe DANS le groupe : 3 par victoire, 1 par nul.
 * Le barème est celui du classement lui-même — en changer ici ferait deux
 * échelles de mérite dans le même tableau.
 */
function headToHeadPoints(
  group: TiebreakerTeam[],
  matches: TiebreakerMatch[]
): Map<string, number> {
  const ids = new Set(group.map((t) => t.teamId));
  const pts = new Map<string, number>(group.map((t) => [t.teamId, 0]));

  for (const m of matches) {
    if (!m.team1Id || !m.team2Id) continue;
    if (!ids.has(m.team1Id) || !ids.has(m.team2Id)) continue;
    if (m.winnerTeamId === m.team1Id) {
      pts.set(m.team1Id, (pts.get(m.team1Id) ?? 0) + 3);
    } else if (m.winnerTeamId === m.team2Id) {
      pts.set(m.team2Id, (pts.get(m.team2Id) ?? 0) + 3);
    } else {
      pts.set(m.team1Id, (pts.get(m.team1Id) ?? 0) + 1);
      pts.set(m.team2Id, (pts.get(m.team2Id) ?? 0) + 1);
    }
  }
  return pts;
}

/**
 * Valeur d'un critère pour une équipe, dans le contexte de son groupe.
 * Plus c'est GRAND, mieux c'est — `seed` est donc inversé.
 */
function valueOf(
  key: TiebreakerKey,
  team: TiebreakerTeam,
  h2h: Map<string, number>
): number {
  switch (key) {
    case 'head_to_head':
      return h2h.get(team.teamId) ?? 0;
    case 'score_diff':
      return team.scoreDiff;
    case 'wins':
      return team.wins;
    case 'scored':
      return team.scored;
    case 'seed':
      // Un seed absent passe derrière tous les seeds connus.
      return -(team.seed ?? 9999);
    default:
      return 0;
  }
}

/**
 * Scinde un groupe à égalité selon les critères restants, récursivement.
 * Rend les équipes ordonnées, chacune portant le critère qui l'a séparée.
 */
function splitGroup(
  group: TiebreakerTeam[],
  matches: TiebreakerMatch[],
  keys: TiebreakerKey[],
  decided: Map<string, TiebreakerKey | null>
): TiebreakerTeam[] {
  if (group.length <= 1 || keys.length === 0) return group;

  const [key, ...rest] = keys;
  const h2h = key === 'head_to_head' ? headToHeadPoints(group, matches) : new Map();

  const buckets = new Map<number, TiebreakerTeam[]>();
  for (const team of group) {
    const v = valueOf(key, team, h2h);
    const list = buckets.get(v);
    if (list) list.push(team);
    else buckets.set(v, [team]);
  }

  // Le critère n'a rien séparé : on passe au suivant sans rien retenir.
  if (buckets.size <= 1) return splitGroup(group, matches, rest, decided);

  const out: TiebreakerTeam[] = [];
  for (const value of [...buckets.keys()].sort((a, b) => b - a)) {
    const bucket = buckets.get(value) as TiebreakerTeam[];
    for (const team of bucket) {
      // Première séparation effective seulement : c'est celle qui explique la
      // place, les suivantes ne font qu'affiner à l'intérieur d'un sous-groupe.
      if (!decided.has(team.teamId)) decided.set(team.teamId, key);
    }
    out.push(...splitGroup(bucket, matches, rest, decided));
  }
  return out;
}

/**
 * Classe des équipes déjà agrégées, en appliquant les départages configurés.
 *
 * L'entrée n'est pas mutée. Les points restent le critère premier — un
 * départage ne renverse jamais un écart de points, il n'ordonne qu'à égalité.
 */
export function rankWithTiebreakers(
  teams: TiebreakerTeam[],
  matches: TiebreakerMatch[],
  order: TiebreakerKey[] = DEFAULT_TIEBREAKER_ORDER
): RankedTeam[] {
  const decided = new Map<string, TiebreakerKey | null>();

  const byPoints = new Map<number, TiebreakerTeam[]>();
  for (const team of teams) {
    const list = byPoints.get(team.points);
    if (list) list.push(team);
    else byPoints.set(team.points, [team]);
  }

  const ordered: TiebreakerTeam[] = [];
  for (const points of [...byPoints.keys()].sort((a, b) => b - a)) {
    const group = byPoints.get(points) as TiebreakerTeam[];
    ordered.push(...splitGroup(group, matches, order, decided));
  }

  return ordered.map((team, idx) => ({
    ...team,
    rank: idx + 1,
    tiebrokenBy: decided.get(team.teamId) ?? null,
  }));
}
