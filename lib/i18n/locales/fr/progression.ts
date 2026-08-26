// lib/i18n/locales/fr/progression.ts
//
// Traductions FRANCAISES du namespace `progression` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('progression', {
  title: 'Ta progression',
  subtitle:
    "Ton niveau dans le temps et les jalons de ton équipe. Rien d'inventé : chaque ligne est un fait mesuré.",
  ratingLabel: 'Niveau actuel',
  deltaOverGames: '{delta} sur tes {count} derniers matchs notés',
  deltaUnknown: 'Pas encore assez de matchs notés pour mesurer une évolution.',
  peakInline: '· meilleur : {rating}',
  sparkAria: 'Évolution du niveau sur {count} matchs notés, de {from} à {to}.',
  firstEncounter: 'Premier affrontement le {date}',
  firstWin: 'Première victoire le {date}',
  encountersReached: '{count} affrontements joués',
  peakRating: 'Meilleur niveau atteint : {rating}',
  streakWin: 'Série en cours : {count} victoires',
  streakLoss: 'Série en cours : {count} défaites',
});
