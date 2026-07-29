// Types du cockpit caster web (/admin/caster) — contrat aligné sur la table
// `caster_scenes` du Supabase partagé avec l'app desktop womenscup-caster.
//
// ⚠️ Schéma déployé = celui du repo caster (sql/001_add_caster_scenes.sql) :
// PAS de tenant_id (table mono-tenant), RLS lecture publique (les overlays
// lisent avec la clé anon) et écriture réservée au staff actif. La migration
// locale database/migrations/add_caster_scenes.sql (tenant_id, is_active…) n'a
// JAMAIS été appliquée — ne pas s'y fier.

export const CASTER_SCENE_TYPES = [
  'starting',
  'match',
  'pause',
  'results',
  'end',
  'mvp',
  'scrim',
  'webcam',
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
