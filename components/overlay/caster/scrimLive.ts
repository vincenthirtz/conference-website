// components/overlay/caster/scrimLive.ts
//
// Shaping CLIENT-SIDE des données live de la scène `scrim` — port fidèle de
// womenscup-caster/src/main/utils/scrimData.js (+ la boucle de fetch de
// src/main/scrim.js). L'overlay web fetch same-origin `GET /api/scrims` /
// `GET /api/scrims/:idOrSlug` — le même contrat public que le desktop —
// puisque les données live (équipes, score de série, horaires) ne sont PAS
// dans scene.data (config seulement : mode / scrimId / titre / marque).

export type ScrimTeamView = { name: string; logo: string };

export type ScrimView = {
  id: string;
  slug: string;
  name: string;
  game: string;
  statusKey: 'live' | 'upcoming' | 'done' | 'cancelled' | 'draft';
  statusLabel: string;
  scheduledDate: string | null;
  streamUrl?: string;
  bestOf?: number | null;
  team1: ScrimTeamView;
  team2: ScrimTeamView;
  score1?: number;
  score2?: number;
};

type ApiTeam = {
  name?: string;
  short_name?: string;
  logo_url?: string;
} | null;

export type ApiScrimRow = {
  id: string;
  slug: string;
  name: string;
  game?: string;
  status?: string;
  scheduled_date?: string | null;
  stream_url?: string;
  team1_id?: string | null;
  team2_id?: string | null;
  team1?: ApiTeam;
  team2?: ApiTeam;
};

export type ApiMatch = {
  is_bye?: boolean;
  best_of?: number | null;
  team1_id?: string | null;
  team2_id?: string | null;
  team1_score?: number | null;
  team2_score?: number | null;
  winner_team_id?: string | null;
};

/** Nom court + logo depuis un objet team du site. */
function normTeam(t: ApiTeam): ScrimTeamView {
  if (!t) return { name: '', logo: '' };
  return { name: t.short_name || t.name || '', logo: t.logo_url || '' };
}

/** Statut scrim → libellé FR + clé de style de l'overlay. */
export function statusInfo(status: string | undefined): {
  key: ScrimView['statusKey'];
  label: string;
} {
  switch (status) {
    case 'running':
      return { key: 'live', label: 'En direct' };
    case 'scheduled':
      return { key: 'upcoming', label: 'À venir' };
    case 'completed':
      return { key: 'done', label: 'Terminé' };
    case 'cancelled':
      return { key: 'cancelled', label: 'Annulé' };
    default:
      return { key: 'draft', label: 'Brouillon' };
  }
}

/**
 * Score de série agrégé depuis les matchs d'un scrim, attribué par id
 * d'équipe (un swap home/away par match ne retourne pas le scoreboard) :
 *  - exactement 1 match → son score de maps (ex. BO5 3-2)
 *  - plusieurs matchs   → nombre de matchs gagnés par camp (série)
 */
export function computeScore(
  scrim: ApiScrimRow,
  matches: ApiMatch[]
): { score1: number; score2: number } {
  const played = (matches || []).filter((m) => m && !m.is_bye);
  let score1 = 0;
  let score2 = 0;
  if (played.length === 1) {
    const m = played[0];
    if (m.team1_id && m.team1_id === scrim.team2_id) {
      score1 = m.team2_score || 0;
      score2 = m.team1_score || 0;
    } else {
      score1 = m.team1_score || 0;
      score2 = m.team2_score || 0;
    }
  } else {
    for (const m of played) {
      if (!m.winner_team_id) continue;
      if (m.winner_team_id === scrim.team1_id) score1++;
      else if (m.winner_team_id === scrim.team2_id) score2++;
    }
  }
  return { score1, score2 };
}

/** Détail scrim (+ matchs) du site → shape de rendu de l'overlay. */
export function normScrimDetail(
  scrim: ApiScrimRow,
  matches: ApiMatch[]
): ScrimView {
  const { score1, score2 } = computeScore(scrim, matches);
  const si = statusInfo(scrim.status);
  return {
    id: scrim.id,
    slug: scrim.slug,
    name: scrim.name,
    game: scrim.game || '',
    statusKey: si.key,
    statusLabel: si.label,
    scheduledDate: scrim.scheduled_date || null,
    streamUrl: scrim.stream_url || '',
    bestOf: (matches || []).find((m) => m && m.best_of)?.best_of || null,
    team1: normTeam(scrim.team1 ?? null),
    team2: normTeam(scrim.team2 ?? null),
    score1,
    score2,
  };
}

/** Ligne de liste scrim du site → shape de rendu (agenda / next). */
export function normScrimRow(s: ApiScrimRow): ScrimView {
  const si = statusInfo(s.status);
  return {
    id: s.id,
    slug: s.slug,
    name: s.name,
    game: s.game || '',
    statusKey: si.key,
    statusLabel: si.label,
    scheduledDate: s.scheduled_date || null,
    team1: normTeam(s.team1 ?? null),
    team2: normTeam(s.team2 ?? null),
  };
}

/**
 * Dé-doublonne par id et trie par scheduled_date croissante (nulls en
 * dernier). L'entrée est la concaténation des fetchs par statut.
 */
export function dedupeAndSortUpcoming(rows: ApiScrimRow[]): ApiScrimRow[] {
  const seen = new Set<string>();
  const out: ApiScrimRow[] = [];
  for (const s of rows || []) {
    if (!s || seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
  }
  out.sort((a, b) => {
    const ta = a.scheduled_date ? Date.parse(a.scheduled_date) : Infinity;
    const tb = b.scheduled_date ? Date.parse(b.scheduled_date) : Infinity;
    return ta - tb;
  });
  return out;
}

/** `GET /api/scrims?...` (running + scheduled), soonest first. */
export async function fetchUpcoming(limit: number): Promise<ScrimView[]> {
  const out: ApiScrimRow[] = [];
  for (const status of ['running', 'scheduled']) {
    try {
      const res = await fetch(`/api/scrims?status=${status}&limit=${limit}`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { scrims?: ApiScrimRow[] };
      if (Array.isArray(json?.scrims)) out.push(...json.scrims);
    } catch {
      /* par-statut avalé ; le résultat combiné est géré par l'appelant */
    }
  }
  return dedupeAndSortUpcoming(out).map(normScrimRow);
}

/** `GET /api/scrims/:idOrSlug` → détail shapé, ou null si introuvable. */
export async function fetchScrimDetail(
  idOrSlug: string
): Promise<ScrimView | null> {
  const res = await fetch(`/api/scrims/${encodeURIComponent(idOrSlug)}`, {
    headers: { Accept: 'application/json' },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as {
    scrim?: ApiScrimRow;
    matches?: ApiMatch[];
  };
  if (!json?.scrim) return null;
  return normScrimDetail(json.scrim, json.matches || []);
}
