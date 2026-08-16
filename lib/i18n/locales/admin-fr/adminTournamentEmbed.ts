// lib/i18n/locales/admin-fr/adminTournamentEmbed.ts
//
// Traductions FRANCAISES du namespace `adminTournamentEmbed` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTournamentEmbed', {
  panelTitle: 'Embed / Widgets',
  panelDescription:
    'Copiez-collez ces extraits iframe pour intégrer les widgets du tournoi sur un site externe.',
  show: 'Afficher',
  hide: 'Masquer',
  themeLabel: 'Thème',
  themeLight: 'Clair',
  themeDark: 'Sombre',
  snippetLabel: 'Extrait iframe',
  copyBtn: 'Copier',
  copiedBtn: 'Copié',
  copiedToast: 'Snippet copié',
  openWidget: 'Ouvrir le widget',
  bracketName: 'Arbre',
  bracketDesc: "L'arbre du tournoi (bracket) avec les scores et l'avancement.",
  standingsName: 'Classement',
  standingsDesc: 'Le classement des équipes (victoires, défaites, points).',
  scheduleName: 'Planning',
  scheduleDesc: 'Le planning des matchs à venir et terminés.',
});
