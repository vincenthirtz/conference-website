// utils/tcg/overlayThemeShape.ts
//
// La FORME de l'habillage de l'overlay TCG : types, défauts, validation.
// Module PUR — aucune I/O, aucun import de `supabaseAdmin`.
//
// POURQUOI CE FICHIER EST SÉPARÉ DE `overlayTheme.ts`, ET C'EST TOUTE SA RAISON
// D'ÊTRE. La page de l'overlay et l'éditeur admin ont besoin du défaut et des
// bornes — des VALEURS, pas seulement des types. Or `overlayTheme.ts` importe
// `supabaseAdmin` pour lire la base : un composant client qui y puiserait une
// constante ferait entrer ~490 ko de polyfills Node dans le bundle, sans erreur
// ni avertissement. Le dépôt s'est déjà fait prendre ainsi.
//
// La règle qui en découle : ce qui est partagé avec le navigateur vit ICI ;
// ce qui touche la base vit à côté.

/** Coins d'ancrage proposés dans la scène OBS. Clos : cf. la migration. */
export const OVERLAY_POSITIONS = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
] as const;
export type OverlayPosition = (typeof OVERLAY_POSITIONS)[number];

export type OverlayMediaKind = 'image' | 'video';

/**
 * Longueur maximale d'une formulation, en accord avec le CHECK de la base.
 * Partagée avec l'éditeur pour qu'il borne AVANT l'envoi plutôt que de récolter
 * un refus de Postgres.
 */
export const OVERLAY_LINE_MAX = 120;

/** L'habillage tel que l'overlay le consomme : jamais de valeur manquante. */
export type OverlayTheme = {
  accentColor: string;
  /** URL publique du média, ou `null` si l'espace n'en a pas déposé. */
  mediaUrl: string | null;
  mediaKind: OverlayMediaKind | null;
  /** Interpolent `{name}`. `null` = l'overlay garde sa formulation traduite. */
  dropLine: string | null;
  winLine: string | null;
  position: OverlayPosition;
};

/**
 * L'habillage d'origine — celui d'avant cette fonctionnalité, à l'identique.
 *
 * `accentColor` reprend la valeur que la pastille utilisait en dur pour un
 * drop. Les formulations restent à `null` DÉLIBÉRÉMENT : le défaut n'est pas
 * une phrase française écrite ici, c'est la clé i18n de l'overlay, qui sait se
 * traduire. L'écrire ici la figerait dans une seule langue.
 */
export const DEFAULT_OVERLAY_THEME: OverlayTheme = {
  accentColor: '#facc15',
  mediaUrl: null,
  mediaKind: null,
  dropLine: null,
  winLine: null,
  position: 'top-left',
};

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

/**
 * Nettoie une formulation venue de l'éditeur.
 *
 * Rend `null` pour une chaîne vide — « effacer le champ » signifie « reviens au
 * défaut traduit », pas « affiche une ligne vide en direct ».
 *
 * Les caractères de contrôle sont retirés : la phrase part dans un rendu texte,
 * où un saut de ligne ou un caractère invisible ne produirait qu'un dégât de
 * mise en page. Le rendu se fait en TEXTE et jamais en HTML : il n'y a pas
 * d'échappement à faire ici, React s'en charge.
 *
 * La plage est ÉCRITE ÉCHAPPÉE à dessein. Avec les octets littéraux elle est
 * sémantiquement identique, mais elle glisse un NUL dans le source — de quoi
 * faire passer le fichier pour un binaire aux yeux de `grep`, et rendre la
 * ligne illisible en revue.
 */
export function cleanOverlayLine(value: unknown): string | null {
  if (typeof value !== 'string') return null;
   
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!cleaned) return null;
  return cleaned.slice(0, OVERLAY_LINE_MAX);
}

export type ThemePatch = {
  accentColor?: string | null;
  dropLine?: string | null;
  winLine?: string | null;
  position?: string | null;
};

export type ValidatedPatch =
  | { ok: true; row: Record<string, unknown> }
  | { ok: false; code: string };

/**
 * Traduit une demande de l'éditeur en colonnes, en refusant ce que la base
 * refuserait de toute façon.
 *
 * Valider ICI plutôt que de laisser la contrainte parler permet de rendre un
 * `code` que l'interface sait traduire, au lieu d'un message Postgres brut.
 *
 * Seules les clés PRÉSENTES sont traitées : c'est ce qui rend le patch partiel
 * — régler la couleur ne doit pas effacer la position au passage.
 */
export function validateThemePatch(patch: ThemePatch): ValidatedPatch {
  const row: Record<string, unknown> = {};

  if ('accentColor' in patch) {
    const value = patch.accentColor;
    if (value === null || value === '') {
      row.accent_color = null;
    } else if (typeof value === 'string' && HEX_RE.test(value)) {
      row.accent_color = value;
    } else {
      return { ok: false, code: 'invalid_color' };
    }
  }

  if ('position' in patch) {
    const value = patch.position;
    if (value === null || value === '') {
      row.position = null;
    } else if (
      typeof value === 'string' &&
      (OVERLAY_POSITIONS as readonly string[]).includes(value)
    ) {
      row.position = value;
    } else {
      return { ok: false, code: 'invalid_position' };
    }
  }

  if ('dropLine' in patch) row.drop_line = cleanOverlayLine(patch.dropLine);
  if ('winLine' in patch) row.win_line = cleanOverlayLine(patch.winLine);

  return { ok: true, row };
}
