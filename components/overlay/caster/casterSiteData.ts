// components/overlay/caster/casterSiteData.ts
//
// Lectures + shaping CLIENT-SIDE des 4 scènes caster « données du site »
// (`player`, `leaderboard`, `standings` ; `bracket` n'a pas d'API, il embarque
// l'iframe d'embed du site). Port fidèle des `<script>` de womenscup-caster
// src/overlays/{player,leaderboard,standings}.html.
//
// scene.data ne porte qu'une RÉFÉRENCE (userId / leagueSlug / tournamentId) :
// l'overlay va chercher les données lui-même sur l'API PUBLIQUE versionnée du
// site. Contrairement au desktop qui tape `https://owwomenscup.fr` en dur
// (CORS ouvert), on est ICI en SAME-ORIGIN : chemins relatifs, aucun CORS.
//
// L'enveloppe de `/api/public/v1/*` est `{ data }` / `{ data, pagination }`
// (utils/publicApi.ts) — d'où le `.data` systématique.

import type {
  LeaderboardPlayer,
  PlayerProfileResponse,
  ProfileBadge,
  ProfilePlacement,
} from '@/types/rating';
import type { LeagueDetailResponse } from '@/types/leagues';
import type { PublicStanding } from '@/utils/public/readStandings';

/**
 * Cadence de rafraîchissement des tableaux (leaderboard / standings). Les
 * overlays desktop ne pollent PAS (ils refetchent à chaque postMessage de
 * l'éditeur) ; une Browser Source hébergée tourne des heures sans édition, il
 * faut donc un poll — 30 s, aligné sur le `cacheSeconds: 60` des endpoints.
 * La scène `player` n'en a pas (profil quasi statique pendant un show), comme
 * le desktop.
 */
export const SITE_DATA_POLL_MS = 30_000;

/**
 * Chaque GET est borné : `fetch` n'a pas de timeout par défaut, et une requête
 * qui pend pendant des heures dans une Browser Source accumulerait les sockets.
 * Un abandon vaut une erreur ⇒ dernier rendu conservé, poll suivant retente.
 */
const SITE_DATA_TIMEOUT_MS = 8000;

/** GET JSON same-origin, enveloppe `{ data }` de l'API publique. */
async function fetchPublicData<T>(path: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SITE_DATA_TIMEOUT_MS);
  try {
    const res = await fetch(path, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { data?: T };
    return json?.data as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Initiales de repli (2 lettres) — même règle que `initials()` des overlays
 * desktop : première lettre du premier mot + première du dernier.
 */
export function nameInitials(name: string): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

// ---- Tableaux (leaderboard / league) ---------------------------------------

/** Ligne uniforme du tableau `leaderboard` — shape de `renderRows()`. */
export type BoardRow = {
  key: string;
  rank: number | null;
  name: string;
  /** Colonne principale (Rating ou « N pts ») déjà formatée. */
  main: string;
  /** Colonne secondaire (Bilan ou nb de tournois) déjà formatée. */
  sub: string;
  logoUrl: string | null;
};

/** `mapLeaderboard()` du desktop — classement global des joueuses. */
export function mapLeaderboardRows(
  list: LeaderboardPlayer[] | null | undefined,
  topN: number
): BoardRow[] {
  return (list || []).slice(0, topN).map((p, i) => ({
    key: p.userId || String(i),
    rank: p.rank != null ? p.rank : null,
    name: p.displayName || p.battleTag || 'Joueuse',
    main: p.rating != null ? String(Math.round(p.rating)) : '—',
    sub: `${p.wins || 0}–${p.losses || 0}`,
    // NB : l'API expose `avatarUrl` mais le desktop ne l'affiche pas en mode
    // leaderboard (initiales seules) — parité conservée.
    logoUrl: null,
  }));
}

/** `mapStandings()` du desktop (leaderboard.html) — classement de ligue. */
export function mapLeagueRows(
  list: LeagueDetailResponse['standings'] | null | undefined,
  topN: number
): BoardRow[] {
  return (list || []).slice(0, topN).map((s, i) => ({
    key: s.teamId || String(i),
    rank: s.rank != null ? s.rank : null,
    name: s.teamName || 'Équipe',
    main: `${s.points != null ? s.points : 0} pts`,
    sub: String(s.tournamentsCounted || 0),
    logoUrl: s.logoUrl || null,
  }));
}

/** `GET /api/public/v1/leaderboard?limit=N` → lignes shapées. */
export async function fetchLeaderboardRows(topN: number): Promise<BoardRow[]> {
  const data = await fetchPublicData<LeaderboardPlayer[]>(
    `/api/public/v1/leaderboard?limit=${encodeURIComponent(topN)}`
  );
  return mapLeaderboardRows(data, topN);
}

/** `GET /api/public/v1/leagues/:slug` → lignes shapées + nom de la ligue. */
export async function fetchLeagueBoard(
  slug: string,
  topN: number
): Promise<{ leagueName: string | null; rows: BoardRow[] }> {
  const data = await fetchPublicData<LeagueDetailResponse>(
    `/api/public/v1/leagues/${encodeURIComponent(slug)}`
  );
  return {
    leagueName: data?.league?.name || null,
    rows: mapLeagueRows(data?.standings, topN),
  };
}

// ---- Classement final de tournoi (standings) -------------------------------

/** Ligne du classement final — shape de `renderRows()` de standings.html. */
export type StandingRow = {
  key: string;
  rank: number | null;
  name: string;
  prize: string | null;
  logoUrl: string | null;
};

/** `mapStandings()` du desktop (standings.html). */
export function mapTournamentStandingRows(
  list: PublicStanding[] | null | undefined
): StandingRow[] {
  return (list || []).map((s, i) => ({
    key: s.teamId || String(i),
    rank: s.rank != null ? s.rank : null,
    name: s.teamName || 'Équipe',
    prize: s.prize || null,
    logoUrl: s.logoUrl || null,
  }));
}

/** `GET /api/public/v1/tournaments/:id/standings` → lignes shapées. */
export async function fetchTournamentStandingRows(
  idOrSlug: string
): Promise<StandingRow[]> {
  const data = await fetchPublicData<PublicStanding[]>(
    `/api/public/v1/tournaments/${encodeURIComponent(idOrSlug)}/standings`
  );
  return mapTournamentStandingRows(data);
}

// ---- Profil joueuse (player) ----------------------------------------------

/** Pastille de forme récente (V / D / N). */
export type FormDot = { cls: 'w' | 'l' | 'd'; char: 'V' | 'D' | 'N' };

/** Profil prêt à rendre — sortie de `renderProfile()` de player.html. */
export type PlayerProfileView = {
  name: string;
  avatarUrl: string | null;
  /** BattleTag affiché seulement s'il diffère du nom affiché. */
  tag: string | null;
  /** Rang formaté (`#3`), null si inconnu. */
  rank: string | null;
  rating: string;
  /** `± 45` (incertitude Glicko), '' si inconnue. */
  rd: string;
  peak: string;
  record: string;
  games: string;
  winrate: string;
  form: FormDot[];
  /** `Adversaire — 3–1` (adversaire le plus joué), null si aucun H2H. */
  h2h: string | null;
  /** Palmarès en chips : 4 badges max + meilleur placement. */
  chips: string[];
};

/** Profil « vide » — les valeurs par défaut du HTML desktop. */
export const EMPTY_PLAYER_PROFILE: PlayerProfileView = {
  name: '—',
  avatarUrl: null,
  tag: null,
  rank: null,
  rating: '—',
  rd: '',
  peak: '—',
  record: '—',
  games: '',
  winrate: '—',
  form: [],
  h2h: null,
  chips: [],
};

/**
 * `renderProfile()` du desktop, en pur. Tolérant : accepte un profil partiel
 * (l'app desktop injecte parfois un mock résolu dans scene.data).
 */
export function shapePlayerProfile(
  profile: Partial<PlayerProfileResponse> | null | undefined
): PlayerProfileView {
  const p = (profile?.player || {}) as Partial<
    PlayerProfileResponse['player']
  > & { battleTag?: string | null };
  const name = p.displayName || p.battleTag || 'Joueuse';

  const wins = p.wins || 0;
  const losses = p.losses || 0;
  const played = wins + losses;

  // Forme récente : les 5 premiers recentMatches (l'API renvoie le plus
  // récent d'abord).
  const recent = Array.isArray(profile?.recentMatches)
    ? profile!.recentMatches
    : [];
  const form: FormDot[] = recent.slice(0, 5).map((m) => {
    if (m?.result === 'win') return { cls: 'w', char: 'V' };
    if (m?.result === 'loss') return { cls: 'l', char: 'D' };
    return { cls: 'd', char: 'N' };
  });

  // Meilleur head-to-head = l'adversaire le plus joué.
  const h2hList = Array.isArray(profile?.h2h) ? profile!.h2h : [];
  const best = h2hList
    .slice()
    .sort((a, b) => (b?.games || 0) - (a?.games || 0))[0];
  const h2h = best
    ? `${best.opponentDisplayName || best.opponentBattleTag || 'Adversaire'} — ${best.wins || 0}–${best.losses || 0}`
    : null;

  // Palmarès : jusqu'à 4 badges + le meilleur placement.
  const ach = profile?.achievements;
  const badges: ProfileBadge[] = Array.isArray(ach?.badges) ? ach!.badges : [];
  const chips: string[] = [];
  for (const b of badges.slice(0, 4)) {
    if (b && b.label) chips.push(b.label);
  }
  const palmares: ProfilePlacement[] = Array.isArray(ach?.palmares)
    ? ach!.palmares
    : [];
  const top = palmares[0];
  if (top && top.tournamentName) {
    chips.push(`#${top.rank} ${top.tournamentName}`);
  }

  return {
    name,
    avatarUrl: p.avatarUrl || null,
    tag: p.battleTag && p.battleTag !== p.displayName ? p.battleTag : null,
    rank: p.rank != null ? `#${p.rank}` : null,
    rating: p.rating != null ? String(Math.round(p.rating)) : '—',
    rd: p.rd != null ? `± ${Math.round(p.rd)}` : '',
    peak: p.peakRating != null ? String(Math.round(p.peakRating)) : '—',
    record: `${wins}–${losses}`,
    games: `${p.gamesPlayed != null ? p.gamesPlayed : played} matchs`,
    winrate: played > 0 ? `${Math.round((wins / played) * 100)}%` : '—',
    form,
    h2h,
    chips,
  };
}

/** `GET /api/public/v1/players/:userId` → profil shapé. */
export async function fetchPlayerProfile(
  userId: string
): Promise<PlayerProfileView> {
  const data = await fetchPublicData<PlayerProfileResponse>(
    `/api/public/v1/players/${encodeURIComponent(userId)}`
  );
  return shapePlayerProfile(data);
}
