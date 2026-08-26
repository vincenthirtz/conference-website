// lib/i18n/locales/fr/homeEvents.ts
//
// Traductions FRANCAISES du namespace `homeEvents` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('homeEvents', {
  locTwitch: 'Sur Twitch',
  locDiscord: 'Sur Discord',
  locIrl: 'IRL',
  locOnline: 'En ligne',
  learnMore: 'En savoir plus',
  eyebrow: 'Agenda',
  title: 'Prochains rendez-vous',
  subtitle: 'Tournois, lives caritatifs et événements communautaires.',
  badgeTournament: 'Tournoi',
  badgeLive: 'En direct',
  teamsRegisteredSuffix: 'équipes inscrites',
  teamsRegisteredSimple: '{count} équipes inscrites',
  slotsLeft_one: '{count} place restante',
  slotsLeft_other: '{count} places restantes',
  viewMatches: 'Voir les matchs',
  register: "S'inscrire",
  guideLink: 'Première inscription ? Voir le guide capitaine',
});
