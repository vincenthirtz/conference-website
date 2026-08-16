// lib/i18n/locales/fr/teamDetail.ts
//
// Traductions FRANCAISES du namespace `teamDetail` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('teamDetail', {
  editPage: 'Éditer la page',
  active: 'Active',
  statMatches: 'Matchs',
  statWins: 'Victoires',
  statLosses: 'Défaites',
  statMembers: 'Membres',
  socialWebsite: 'Site web',
  achievementsTitle: 'Palmarès',
  sponsorsTitle: 'Sponsors & partenaires',
  scrimCtaTitle: 'Tu veux affronter {name} en scrim ?',
  scrimCtaDesc:
    'Pas besoin de compte — laisse un contact, le capitaine te répondra.',
  scrimCtaBtn: 'Proposer un scrim',
  rosterLabel: 'Roster',
  rosterCount_one: '{count} titulaire',
  rosterCount_other: '{count} titulaires',
  emptyRoster: 'Aucun membre affiché pour cette équipe.',
  substitutesLabel: 'Remplaçantes',
  staffLabel: 'Staff',
  recentMatchesTitle: 'Matchs récents',
  emptyMatches: 'Aucun match récent.',
  tournamentsTitle: 'Tournois',
  tournamentsCount_one: '{count} tournoi',
  tournamentsCount_other: '{count} tournois',
  emptyTournaments: 'Aucun tournoi pour le moment.',
  statisticsTitle: 'Statistiques',
  winRateLabel: 'Win rate',
  statDraws: 'Nuls',
  activeInLabel: 'Actuellement en compétition dans :',
  memberFallback: 'Membre',
  captainAria: 'Capitaine',
  substituteBadge: 'Remplaçante',
  specialtyTank: 'Tank',
  specialtyDps: 'DPS',
  specialtySupport: 'Support',
  specialtyFlex: 'Flex',
  matchVs: 'vs',
  resultWin: 'V',
  resultLoss: 'D',
  resultDraw: 'N',
  statusRunning: 'En cours',
  statusUpcoming: 'À venir',
  statusFinished: 'Terminé',
  statusDraft: 'Brouillon',
  scrimCtaBtnConnected: 'Proposer un scrim',
  networkTitle: 'Dans le réseau',
  networkResponseRate: '{rate} % de réponse aux propositions',
  networkResponseDelay: 'répond en {hours} h en moyenne',
  networkSample: 'sur {count} proposition(s) reçue(s)',
  networkScrimsTitle: 'Derniers scrims',
  networkUnknownOpponent: 'Adversaire inconnu',
});
