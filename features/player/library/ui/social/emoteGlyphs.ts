// features/player/library/ui/social/emoteGlyphs.ts — le pictogramme de chaque
// emote (lot 5). Décoratif : le bouton porte toujours son libellé traduit, et
// le pictogramme est masqué aux lecteurs d'écran. Le moteur (lot 5B) peut
// reprendre la même table pour la bulle au-dessus d'une tête, en attendant
// des sprites.

import type { LibraryEmoteId } from '../../realtime/social';

export const LIBRARY_EMOTE_GLYPHS: Readonly<Record<LibraryEmoteId, string>> = {
  wave: '\u{1F44B}',
  clap: '\u{1F44F}',
  heart: '\u{2764}\u{FE0F}',
  laugh: '\u{1F604}',
  dance: '\u{1F483}',
};
