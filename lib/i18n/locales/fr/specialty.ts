// lib/i18n/locales/fr/specialty.ts
//
// Traductions FRANCAISES du namespace `specialty` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.
//
// Les postes Overwatch. Ce sont des termes de jeu : ils ne se traduisent pas
// d'une langue a l'autre, mais ils vivent quand meme dans l'i18n pour que la
// pastille partagee (components/Team/SpecialtyBadge) n'ait pas a decider
// toute seule de ce qu'elle affiche.

import { ns } from '../../ns';

export default ns('specialty', {
  fieldLabel: 'Mon poste',
  none: 'Non déclaré',
  fieldHint:
    'Il s’affiche sur le roster de ton équipe et sur sa page publique.',
  tank: 'Tank',
  dps: 'DPS',
  support: 'Support',
  flex: 'Flex',
});
