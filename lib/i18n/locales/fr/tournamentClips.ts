// lib/i18n/locales/fr/tournamentClips.ts
//
// Traductions FRANCAISES du namespace `tournamentClips` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts`. Toute cle ajoutee ici doit
// l'etre aussi cote anglais : le garde-fou `../parity.ts` casse le typecheck.

import { ns } from '../../ns';

export default ns('tournamentClips', {
  eyebrow: 'Les temps forts',
  heading: 'Clips',
  intro:
    'Les clips les plus vus de la chaîne Twitch pendant le tournoi, de la première journée à la finale.',
  openChannel: 'Voir la chaîne Twitch',
  empty:
    'Pas encore de clip pour ce tournoi. Revenez après les prochains matchs !',
  notStarted:
    'Le tournoi n’a pas encore commencé : les clips arriveront avec les premiers matchs.',
  twitchNote: 'Les clips s’ouvrent sur Twitch, dans un nouvel onglet.',
  views_one: '{count} vue',
  views_other: '{count} vues',
});
