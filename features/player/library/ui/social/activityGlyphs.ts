// features/player/library/ui/social/activityGlyphs.ts — lot 15c : le
// pictogramme de ce qu'une joueuse fait d'un meuble, dans le style des emotes
// (`./emoteGlyphs.ts`). À part : seule la vue de la salle (chargée à la
// demande) le lit, il ne pèse pas sur la page.

import type { UseActivity } from '../../engine/interactions';

/**
 * Lot 15c — le pictogramme de ce qu'une joueuse fait d'un meuble, porté
 * au-dessus de sa tête tant qu'elle ne bouge pas (même style que les emotes).
 */
export const LIBRARY_ACTIVITY_GLYPHS: Readonly<Record<UseActivity, string>> = {
  dress: '\u{1F457}',
  read: '\u{1F4D6}',
  play: '\u{1F3AE}',
  warm: '\u{1F525}',
  music: '\u{1F3B5}',
  watch: '\u{1F4FA}',
  water: '\u{1F4A7}',
};
