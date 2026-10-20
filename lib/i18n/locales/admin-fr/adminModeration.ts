// lib/i18n/locales/admin-fr/adminModeration.ts
//
// Traductions FRANCAISES du namespace `adminModeration` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminModeration', {
  pageTitle: 'Admin – Modération',
  heading: 'Modération',
  subtitle:
    'Commentaires, litiges, blacklists (joueurs, équipes & structures) et tickets de support.',
  tabsAriaLabel: 'Sections de modération',
  tabComments: 'Commentaires',
  tabDisputes: 'Litiges',
  tabBlacklist: 'Blacklist',
  tabSupport: 'Support',
  blSubTabsAriaLabel: 'Types de blacklist',
  blSubTabPlayers: 'Joueurs',
  blSubTabEntities: 'Équipes & structures',

  // Onglet « Library » (Women's Library, docs/PLAN-womens-library.md) : seul
  // son libellé vit ici. Les textes des panneaux, chargés avec eux, sont dans
  // `adminModerationLibrary` : la page du hub ne les embarque pas.
  tabLibrary: 'Library',
});
