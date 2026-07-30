// Thèmes des overlays caster (table `caster_themes`, lot 5).
//
// Même shape que les fichiers de thème de l'app desktop
// (womenscup-caster/src/main/themes.js) : elle est consommée telle quelle par
// l'applyTheme() des overlays, donc un thème exporté du desktop est importable
// ici et réciproquement.
//
// Fichier séparé de `types/caster.ts` (scènes) : les thèmes sont une autre
// table, avec son propre cycle de vie.

/** Variante de gabarit des overlays (densité / taille du scoreboard). */
export const CASTER_TEMPLATES = [
  'default',
  'compact',
  'full',
  'minimal',
] as const;

export type CasterTemplate = (typeof CASTER_TEMPLATES)[number];

export type CasterThemeColors = {
  bg: string;
  bgCard: string;
  accent1: string;
  accent2: string;
  accent3: string;
  text: string;
  textMuted: string;
  winner: string;
};

/** Position absolue d'un bloc sur le canvas 1920×1080. */
export type CasterThemePosition = { x: number; y: number };

export type CasterThemePositions = {
  scoreboard?: CasterThemePosition;
  mapInfo?: CasterThemePosition;
  branding?: CasterThemePosition;
  /** Bandeaux d'équipe du HUD Overwatch (calage sur la capture de jeu). */
  owTeam1?: CasterThemePosition;
  owTeam2?: CasterThemePosition;
};

export type CasterThemeData = {
  template: CasterTemplate;
  colors: CasterThemeColors;
  font: string;
  /** Police des titres/scores ; défaut = police de corps. */
  headingFont?: string;
  /** Graisse de base appliquée au body ('400' = comportement d'origine). */
  fontWeight?: string;
  /** Échelle de toutes les tailles de texte (1 = taille d'origine). */
  fontScale?: number;
  positions?: CasterThemePositions;
};

export type CasterTheme = {
  id: string;
  name: string;
  data: CasterThemeData;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/** Thème par défaut — identique au DEFAULT_THEME du desktop et au seed SQL. */
export const DEFAULT_CASTER_THEME: CasterThemeData = {
  template: 'default',
  colors: {
    bg: '#0f0820',
    bgCard: '#1b1130',
    accent1: '#00f0ff',
    accent2: '#ff2ec8',
    accent3: '#bb00ff',
    text: '#ffffff',
    textMuted: '#8888aa',
    winner: '#10b981',
  },
  font: 'Segoe UI',
  positions: {
    scoreboard: { x: 960, y: 0 },
    mapInfo: { x: 960, y: 72 },
    branding: { x: 1896, y: 1040 },
  },
};
