// lib/i18n/locales/fr/tournamentTeams.ts
//
// Traductions FRANCAISES du namespace `tournamentTeams` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('tournamentTeams', {
  headTitle: 'Équipes · {name}',
  metaDescription: 'Toutes les équipes inscrites au tournoi {name}.',
  eyebrow: 'Tournoi · Équipes',
  heading: 'Équipes inscrites',
  teamsCount_one: '· {count} équipe',
  teamsCount_other: '· {count} équipes',
  empty: 'Aucune équipe inscrite pour le moment.',
  backToTournament: 'Retour au tournoi',
});
