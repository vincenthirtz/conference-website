// Types du cockpit caster web (/admin/caster) — contrat aligné sur la table
// `caster_scenes` du Supabase partagé avec l'app desktop womenscup-caster.
//
// ⚠️ Schéma déployé = celui du repo caster (sql/001_add_caster_scenes.sql) :
// PAS de tenant_id (table mono-tenant), RLS lecture publique (les overlays
// lisent avec la clé anon) et écriture réservée au staff actif. La migration
// locale database/migrations/add_caster_scenes.sql (tenant_id, is_active…) n'a
// JAMAIS été appliquée — ne pas s'y fier.

// ⚠️ Doit rester aligné sur le CHECK de `caster_scenes.type` en base (voir
// database/migrations/extend_caster_scene_types.sql). Les 4 derniers types ont
// été ajoutés au CHECK le 2026-07-30 : le repo caster avait leurs éditeurs et
// overlays mais aucune migration, donc la base les refusait des deux côtés.
export const CASTER_SCENE_TYPES = [
  'starting',
  'match',
  'pause',
  'results',
  'end',
  'mvp',
  'scrim',
  'webcam',
  'bracket',
  'player',
  'leaderboard',
  'standings',
] as const;

export type CasterSceneType = (typeof CASTER_SCENE_TYPES)[number];

export type CasterScene = {
  id: string;
  name: string;
  type: CasterSceneType;
  /** Nom de fichier overlay historique côté app desktop (ex. `match.html`). */
  overlay: string | null;
  /** Config de la scène — shape par type (voir MatchSceneData). */
  data: Record<string, unknown>;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/** Ban héros stocké en objet complet pour que l'overlay soit autonome. */
export type HeroBan = {
  key?: string;
  name: string;
  portrait: string;
} | null;

export type CasterSocials = {
  site: string;
  discord: string;
  twitch: string;
  youtube: string;
  instagram: string;
  tiktok: string;
};

/**
 * `data` d'une scène `match` telle qu'écrite par l'app desktop (matchEditor.js)
 * — l'éditeur web écrit exactement la même shape pour rester interopérable.
 */
export type MatchSceneData = {
  team1: string;
  team2: string;
  score1: number;
  score2: number;
  map: string;
  bestOf: number;
  seriesDots: boolean;
  overwatchHud: boolean;
  ban1: HeroBan;
  ban2: HeroBan;
  casters: string[];
  /** Libellés surchargeables de l'overlay (défauts « Casters » / « Ban »). */
  castersLabel?: string;
  banLabel?: string;
  team1Logo: string;
  team2Logo: string;
  hashtag: string;
  socials: CasterSocials;
  /** Match du site lié (score live piloté par Supabase Realtime côté app). */
  matchId: string | null;
  /** Nom de la scène OBS associée (setup-overlay-scenes côté app desktop). */
  obsScene?: string;
};

// ---- Shapes `data` des autres types de scènes (lot 2) ----------------------
// Contrats relevés dans SCENE_FORMS (womenscup-caster/src/renderer/editor.js +
// *Editor.js) et recoupés avec les lignes réelles en base. Tous les éditeurs
// web écrivent `{ ...data brute, ...champs édités }` pour préserver les champs
// inconnus (obsScene, labels de thème…).

export type StartingSceneData = {
  title: string;
  /** Compte à rebours en secondes (défaut app : 300 ; seed : 600). */
  countdown: number;
  nextMatch: { team1: string; team2: string; bestOf?: number };
  hashtag: string;
  socials: CasterSocials;
  /** Libellés surchargeables (phase thème côté app). */
  nextLabel?: string;
  countdownLabel?: string;
};

export type PauseSceneData = {
  title: string;
  message: string;
  /** Bandeau défilant optionnel ('' = masqué). */
  marquee: string;
  hashtag: string;
  socials: CasterSocials;
};

export type ResultsSceneData = {
  team1: string;
  team2: string;
  score1: number;
  score2: number;
  bestOf?: number;
  /** MVP du match (optionnel, '' = masqué). */
  mvp: string;
  mapResults: Array<{ map: string; score1: number; score2: number }>;
  team1Logo: string;
  team2Logo: string;
  hashtag: string;
  socials: CasterSocials;
};

export type EndSceneData = {
  title: string;
  subtitle: string;
  credits: Array<{ label: string; value: string }>;
  sponsors: string[];
  socials: CasterSocials;
};

export type MvpCandidate = {
  name: string;
  team?: string;
  votes?: number;
};

export type MvpSceneData = {
  title: string;
  candidates: MvpCandidate[];
  /** Snapshot du poll (le tally live du chat arrive au lot 4 via broadcast). */
  total: number;
  isOpen: boolean;
};

export type ScrimSceneData = {
  /** matchup = un scrim précis ; next = le prochain public ; list = agenda. */
  mode: 'matchup' | 'next' | 'list';
  /** UUID ou slug du scrim (mode matchup), sinon null. */
  scrimId: string | null;
  title: string;
  hashtag: string;
  socials: CasterSocials;
  countdownLabel?: string;
};

export type WebcamCamConfig = { label: string; deviceId: string };

export type WebcamSceneData = {
  mode: 'solo' | 'duo';
  cam1: WebcamCamConfig;
  cam2: WebcamCamConfig;
  shape: string;
  mirror: boolean;
};

// ---- Types de scènes « données du site » (lot 6) ---------------------------
// Ces 4 scènes ne stockent qu'une RÉFÉRENCE (id de tournoi, de joueuse, slug de
// ligue) : l'overlay va chercher les données lui-même sur l'API PUBLIQUE du site
// (`/api/public/v1/*`, sans token, rate-limitée et cachée). Même découpage que
// la scène scrim : la config en base, les données live hors base.
// Shapes relevées dans les read() des éditeurs desktop
// (womenscup-caster/src/renderer/{bracket,player,leaderboard,standings}Editor.js).

export type BracketSceneData = {
  title: string;
  tournamentId: string | null;
  /** Libellé mémorisé pour l'affichage hors ligne / si l'API tombe. */
  tournamentName: string;
  theme: 'dark' | 'light';
};

export type PlayerSceneData = {
  title: string;
  /** `userId` du profil public (GET /api/public/v1/players/:userId). */
  userId: string | null;
  playerName: string;
  socials: CasterSocials;
  hashtag?: string;
};

export type LeaderboardSceneData = {
  title: string;
  /** leaderboard = classement global des joueuses ; league = une ligue. */
  mode: 'leaderboard' | 'league';
  leagueSlug: string | null;
  leagueName: string;
  /** Nombre de lignes affichées, borné 3..20 côté éditeur. */
  topN: number;
  socials: CasterSocials;
  hashtag?: string;
};

export type StandingsSceneData = {
  title: string;
  tournamentId: string | null;
  tournamentName: string;
  socials: CasterSocials;
  hashtag?: string;
};

// ---- Contrat HTTP /api/caster/v1/* (lot 5 : match picker) -------------------
// Shapes relevées dans utils/casterApi.ts (les handlers partagés v1 + legacy) —
// mêmes payloads que ceux consommés par l'app desktop (tournamentsApi.js).
// Les colonnes nullables de la base restent nullables ici : l'UI applique ses
// propres replis (TBD, 0, pool de maps par défaut…).

export type CasterApiTeam = {
  id: string;
  name: string | null;
  short_name: string | null;
  logo_url: string | null;
};

/** GET /api/caster/v1/tournaments (status ∈ {running, published}). */
export type CasterApiTournament = {
  id: string;
  name: string;
  slug: string | null;
  game: string | null;
  status: string;
  start_date: string | null;
  format_type: string | null;
};

/**
 * GET /api/caster/v1/tournaments/:id/matches (statuts pending/ongoing/finished)
 * et champ `match` de GET /api/caster/v1/matches/:id.
 */
export type CasterApiMatch = {
  id: string;
  status: string | null;
  best_of: number | null;
  match_format: string | null;
  scheduled_at: string | null;
  team1_score: number | null;
  team2_score: number | null;
  round_name: string | null;
  stream_url: string | null;
  team1: CasterApiTeam | null;
  team2: CasterApiTeam | null;
};

/** Champ `games` de GET /api/caster/v1/matches/:id (une ligne par map jouée). */
export type CasterApiGame = {
  id: string;
  map_name: string | null;
  map_order: number | null;
  team1_score: number | null;
  team2_score: number | null;
};

/** GET /api/caster/v1/tournaments/:id/maps (map pool actif du tournoi). */
export type CasterApiTournamentMap = {
  id: string;
  map_name: string;
  map_type: string | null;
  image_url: string | null;
};

/**
 * Entrée de présence trackée sur le canal Supabase Realtime `caster_presence`
 * — MÊME shape que l'app desktop (src/main/presence.js) pour que casters web et
 * desktop se voient mutuellement. `activeScene` = **id** de la scène éditée.
 *
 * ⚠️ Ne pas confondre avec la TABLE `caster_presence` (heartbeats du cockpit
 * régie, cf. pages/api/caster/heartbeat.ts) : ici c'est un canal Realtime
 * Presence éphémère, aucune écriture en base.
 */
export type CasterPresenceUser = {
  staffId: string;
  displayName: string;
  role: string;
  activeScene: string | null;
  activeField: string | null;
  joinedAt: string;
};
