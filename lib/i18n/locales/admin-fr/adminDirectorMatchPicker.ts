// lib/i18n/locales/admin-fr/adminDirectorMatchPicker.ts
//
// Traductions FRANCAISES du namespace `adminDirectorMatchPicker` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminDirectorMatchPicker', {
  notPlanned: 'non planifie',
  searching: 'Recherche…',
  searchError: 'Erreur de recherche.',
  selectedChange: 'Match selectionne — taper pour changer',
  searchPlaceholder: 'Rechercher un match (equipe, tournoi)…',
  clearAria: 'Effacer la selection',
  noMatch: "Aucun match trouve. Verifie le nom de l'equipe ou du tournoi.",
  noTournament: 'Sans tournoi',
});
