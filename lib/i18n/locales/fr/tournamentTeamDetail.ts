// lib/i18n/locales/fr/tournamentTeamDetail.ts
//
// Traductions FRANCAISES du namespace `tournamentTeamDetail` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('tournamentTeamDetail', {
  headTitle: '{team} · {tournament}',
  metaDescription:
    'Roster, stats et résultats de {team} sur le tournoi {tournament}',
  outcomeOngoing: 'En cours',
  outcomeUpcoming: 'À venir',
  outcomeWin: 'Victoire',
  outcomeLoss: 'Défaite',
  outcomeDraw: 'Nul',
  eyebrow: 'Tournoi · Équipe',
  globalProfile: 'Profil global',
  backToTournament: '← Tournoi',
  statPlayed: 'Matchs joués',
  statWins: 'Victoires',
  statLosses: 'Défaites',
  statWinrate: 'Winrate',
  statMvp: 'MVP',
  rosterHeading: 'Roster ({count})',
  rosterEmpty: 'Aucun membre listé.',
  starters: 'Titulaires',
  substitutes: 'Remplaçants',
  teamStaff: "Staff de l'équipe",
  matchesHeading: 'Matchs sur ce tournoi',
  matchesEmpty: 'Aucun match programmé pour cette équipe sur ce tournoi.',
  unknownMember: '— inconnu —',
  captainBadge: 'CAPITAINE',
});
