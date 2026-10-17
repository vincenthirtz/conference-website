// utils/overlay/standingsOverlay.ts
//
// Le cœur PUR de la source « classement » (`/overlay/standings`) : le
// classement EN COURS d'un tournoi, tel qu'une source navigateur OBS
// l'affiche — quelle table montrer, quelles colonnes, et la zone qualificative.
//
// LE CALCUL EST CELUI DE LA PAGE « CLASSEMENT ». Les lignes viennent de
// `readPublicStandings` (utils/stages/publicStandings) : points, départages,
// forfaits et équipes disqualifiées compris. Ce module ne recompte rien, il
// choisit et met en forme : un classement d'antenne qui divergerait de la page
// publique serait pire que pas de classement.
//
// À NE PAS CONFONDRE avec la scène `standings` du cockpit caster, qui montre
// le classement FINAL (`final_rankings`, vide tant que le tournoi n'est pas
// clos).
//
// Rien ici ne touche au réseau. Le handler lit, ce module décide.

import type {
  FormResult,
  PublicStandingsTable,
} from '@/utils/stages/publicStandings';
import type { OverlayBranding } from './branding';

/** Au-delà, les lignes ne tiennent plus lisiblement dans un cadre 1080p. */
export const MAX_STANDINGS_ROWS = 20;

export type OverlayStandingsTeamView = {
  id: string;
  name: string;
  shortName: string | null;
  logoUrl: string | null;
};

export type OverlayStandingsRowView = {
  rank: number;
  team: OverlayStandingsTeamView;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  /** Maps gagnées moins maps perdues. */
  mapDiff: number;
  /** Derniers résultats, du plus ancien au plus récent. */
  form: FormResult[];
  /** Classée en dernier par la règle de disqualification : à marquer. */
  disqualified: boolean;
};

export type OverlayStandingsTableView = {
  /** Clé stable de la table (phase, ou phase + poule) : `?stage=` la vise. */
  key: string;
  stageName: string;
  groupKey: string | null;
  rows: OverlayStandingsRowView[];
};

export type OverlayStandingsResponse = {
  tables: OverlayStandingsTableView[];
  /**
   * Places qualificatives pour les finales hors phase (règle de la page
   * « Phase finale » : 2 par match de finale). 0 = pas de zone à marquer.
   */
  qualifiers: number;
  tournament: {
    id: string;
    slug: string | null;
    name: string | null;
    shortName: string | null;
    game: string | null;
  };
  branding: OverlayBranding | null;
  serverTime: string;
};

export function toOverlayStandingsTables(
  tables: PublicStandingsTable[]
): OverlayStandingsTableView[] {
  return tables.map((table) => ({
    key: table.key,
    stageName: table.stageName,
    groupKey: table.groupKey,
    rows: table.rows.map((r) => ({
      rank: r.rank,
      team: {
        id: r.teamId,
        name: r.teamName,
        shortName: r.shortName,
        logoUrl: r.logoUrl,
      },
      played: r.played,
      wins: r.wins,
      losses: r.losses,
      draws: r.draws,
      points: r.points,
      mapDiff: r.mapsWon - r.mapsLost,
      form: r.form,
      disqualified: r.disqualified,
    })),
  }));
}

/**
 * Places qualificatives : 2 par match de finale hors phase (1er contre 2e,
 * 3e contre 4e…), bornées au nombre d'équipes éligibles. Plusieurs tables
 * (poules) : aucune zone — sans règle inter-poules, « top 4 » ne veut rien
 * dire, comme sur la page « Phase finale ».
 */
export function standingsQualifiers(
  finalsMatchCount: number,
  tables: OverlayStandingsTableView[]
): number {
  if (tables.length !== 1 || finalsMatchCount <= 0) return 0;
  const eligible = tables[0].rows.filter((r) => !r.disqualified).length;
  return Math.min(finalsMatchCount * 2, eligible);
}

/**
 * La table à l'écran : celle que l'URL demande (`?stage=<clé>`), sinon la
 * DERNIÈRE phase déjà commencée — dans un tournoi suisse puis poules, c'est la
 * phase en cours qu'on veut voir —, sinon la première.
 */
export function pickStandingsTable(
  tables: OverlayStandingsTableView[],
  key?: string | null
): OverlayStandingsTableView | null {
  if (tables.length === 0) return null;
  if (key) {
    const wanted = tables.find((t) => t.key === key);
    if (wanted) return wanted;
  }
  for (let i = tables.length - 1; i >= 0; i -= 1) {
    if (tables[i].rows.some((r) => r.played > 0)) return tables[i];
  }
  return tables[0];
}

/** `?limit=` : 1 → MAX_STANDINGS_ROWS lignes ; absent ou illisible = toutes. */
export function parseStandingsLimit(raw: string | undefined): number | null {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return null;
  return Math.min(MAX_STANDINGS_ROWS, Math.max(1, n));
}

/**
 * `?qualify=` : force la zone qualificative (0 la masque). Absent ou
 * illisible = `null`, la règle du serveur s'applique.
 */
export function parseQualifyParam(raw: string | undefined): number | null {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return null;
  return Math.min(MAX_STANDINGS_ROWS, Math.max(0, n));
}
