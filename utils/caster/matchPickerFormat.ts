// Logique pure du match picker du cockpit caster web — port fidèle des helpers
// de l'app desktop womenscup-caster (src/renderer/matchPickerFormat.js pour les
// libellés/recherche, src/renderer/matchPicker.js:buildSceneDataFromMatch pour
// le mapping match → data de scène). Zéro DOM / zéro fetch : testé en Vitest.

import type {
  CasterApiGame,
  CasterApiMatch,
  CasterApiTeam,
  CasterSceneType,
} from '@/types/caster';

/**
 * Au-delà de ce nombre de matchs, le picker affiche un champ de recherche —
 * en dessous, faire défiler la liste est plus rapide que de taper. Même seuil
 * que l'app desktop.
 */
export const MATCH_FILTER_THRESHOLD = 8;

/**
 * Pastille de statut : le caster repère le match live / terminé / à venir d'un
 * coup d'œil au lieu de décoder le suffixe de score. Mêmes glyphes que l'app
 * desktop (interopérabilité visuelle entre les deux cockpits).
 */
export function matchStatusGlyph(status: string | null | undefined): string {
  if (status === 'ongoing') return '🔴 ';
  if (status === 'finished') return '✓ ';
  return '◷ ';
}

/**
 * Best-of d'un match : la colonne explicite gagne, sinon le premier entier de
 * `match_format` (« bo5 » / « BO3 »), sinon un BO5 par défaut.
 */
export function bestOfFromMatch(
  match: Pick<CasterApiMatch, 'best_of' | 'match_format'>
): number {
  if (match.best_of) return match.best_of;
  const m = /(\d+)/.exec(match.match_format || '');
  return m ? parseInt(m[1], 10) : 5;
}

/**
 * Minuscule sans accents pour la recherche de match (« perceval » trouve
 * « Percevál » : personne ne se bat avec des diacritiques en plein direct).
 */
export function normalizeSearch(value: string | null | undefined): string {
  return (value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Nom court d'affichage d'une équipe (short_name > name > repli « TBD »). */
export function teamLabel(
  team: CasterApiTeam | null | undefined,
  fallback = 'TBD'
): string {
  return team?.short_name || team?.name || fallback;
}

/**
 * Heure programmée, affichée sur les matchs à venir uniquement : pour un match
 * live ou terminé, le signal pertinent est le score, pas le créneau. '' sinon.
 */
export function matchTimeLabel(
  match: Pick<CasterApiMatch, 'status' | 'scheduled_at'>,
  locale = 'fr-FR'
): string {
  if (match.status !== 'pending' || !match.scheduled_at) return '';
  const d = new Date(match.scheduled_at);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleString(locale, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

/**
 * Libellé d'une option du sélecteur de match :
 * `🔴 PERC vs KARA (1-2) — Demi-finale · 12/07 20:30`.
 */
export function matchOptionLabel(
  match: CasterApiMatch,
  opts: { locale?: string; tbdLabel?: string } = {}
): string {
  const t1 = teamLabel(match.team1, opts.tbdLabel);
  const t2 = teamLabel(match.team2, opts.tbdLabel);
  const score =
    match.status === 'ongoing' || match.status === 'finished'
      ? ` (${match.team1_score || 0}-${match.team2_score || 0})`
      : '';
  const round = match.round_name ? ` — ${match.round_name}` : '';
  const time = matchTimeLabel(match, opts.locale);
  return `${matchStatusGlyph(match.status)}${t1} vs ${t2}${score}${round}${
    time ? ` · ${time}` : ''
  }`;
}

/**
 * Botte de foin de recherche : noms complets + noms courts + nom de tour,
 * normalisés — le caster peut taper le code affiché ou le nom complet.
 */
export function matchSearchHaystack(match: CasterApiMatch): string {
  return normalizeSearch(
    [
      match.team1?.name,
      match.team1?.short_name,
      match.team2?.name,
      match.team2?.short_name,
      match.round_name,
    ]
      .filter(Boolean)
      .join(' ')
  );
}

/** Filtre accent-insensible de la liste de matchs ('' = tout garder). */
export function filterMatches(
  matches: CasterApiMatch[],
  query: string
): CasterApiMatch[] {
  const q = normalizeSearch(query).trim();
  if (!q) return matches;
  return matches.filter((m) => matchSearchHaystack(m).includes(q));
}

/** Résultats par map d'un match terminé, dérivés des lignes `games`. */
export function mapResultsFromGames(
  games: CasterApiGame[] | null | undefined
): Array<{ map: string; score1: number; score2: number }> {
  return (games || [])
    .filter((g) => g && (g.map_name || g.team1_score || g.team2_score))
    .map((g) => ({
      map: g.map_name || '',
      score1: g.team1_score || 0,
      score2: g.team2_score || 0,
    }));
}

/**
 * Construit la `data` d'une scène pilotée par le tournoi (match / results)
 * depuis le détail d'un match. Le spread de la data précédente vient EN
 * PREMIER : le contexte saisi par le caster (casters, marque/réseaux, MVP,
 * pastilles de série, libellés de thème) survit à un ré-import — seuls les
 * champs dérivés du match sont écrasés. Sémantique identique au desktop.
 */
export function buildSceneDataFromMatch({
  sceneType,
  prev,
  match,
  games,
}: {
  sceneType: CasterSceneType;
  prev: Record<string, unknown> | null | undefined;
  match: CasterApiMatch;
  games?: CasterApiGame[] | null;
}): Record<string, unknown> {
  const common = {
    team1: teamLabel(match.team1),
    team2: teamLabel(match.team2),
    score1: match.team1_score || 0,
    score2: match.team2_score || 0,
    team1Logo: match.team1?.logo_url || '',
    team2Logo: match.team2?.logo_url || '',
    matchId: match.id,
  };

  if (sceneType === 'results') {
    // Le détail par map existe déjà côté serveur : aucune raison de le retaper.
    return {
      ...(prev || {}),
      ...common,
      bestOf: bestOfFromMatch(match),
      mapResults: mapResultsFromGames(games),
    };
  }

  // Scène `match` : la map courante = 1re map jouée, et les bans repartent à
  // zéro (nouveau match → bans pas encore connus, le caster les ressaisit).
  return {
    ...(prev || {}),
    ...common,
    map: games?.[0]?.map_name || '',
    bestOf: bestOfFromMatch(match),
    ban1: null,
    ban2: null,
  };
}

/** Score d'un match, normalisé en nombres (les colonnes sont nullables). */
export function matchScores(match: CasterApiMatch): {
  score1: number;
  score2: number;
} {
  return {
    score1: match.team1_score || 0,
    score2: match.team2_score || 0,
  };
}

/**
 * Le score d'un match a-t-il bougé depuis le dernier passage ? Sert au suivi
 * du match lié (poll) pour n'écrire dans la scène que sur changement réel.
 */
export function matchScoreChanged(
  prev: CasterApiMatch | null | undefined,
  next: CasterApiMatch
): boolean {
  if (!prev) return true;
  const a = matchScores(prev);
  const b = matchScores(next);
  return (
    a.score1 !== b.score1 ||
    a.score2 !== b.score2 ||
    prev.status !== next.status
  );
}
