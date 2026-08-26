// lib/i18n/locales/fr/actualitesPreview.ts
//
// Traductions FRANCAISES du namespace `actualitesPreview` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('actualitesPreview', {
  statusCancelled: 'Annulé',
  title: 'Tournoi Mixte',
  subtitle:
    'Tournoi mixte hommes/femmes pour lancer la saison compétitive. Un avant-goût de ce qui vous attend en octobre !',
  cardMixteValue: 'Mixte',
  cardMixteLabel: 'Format ouvert',
  cardDateValue: '3 Avril',
  cardDateLabel: 'Save the date',
  cardSeasonValue: 'Saison 2026',
  cardSeasonLabel: "Coup d'envoi",
  castLabel: 'Cast',
  registerTeam: 'Inscrire mon équipe',
  seeProgram: 'Voir le programme',
  seeStatement: 'Voir le communiqué',
});
