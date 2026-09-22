// lib/i18n/locales/admin-fr/adminTournamentMvpVotes.ts
//
// Traductions FRANCAISES du namespace `adminTournamentMvpVotes` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts`. Toute cle ajoutee ici doit
// l'etre aussi cote anglais : le garde-fou `../admin-parity.ts` casse le
// typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTournamentMvpVotes', {
  heading: 'Votes MVP',
  intro:
    'Décompte en direct des votes MVP, match par match. Le « en tête » applique la règle du dépouillement : Twitch prime s’il a des voix, au moins {min} voix, pas d’égalité.',
  refresh: 'Rafraîchir',
  autoRefresh:
    'Actualisation automatique toutes les {seconds} s tant qu’un vote est ouvert.',
  loading: 'Chargement…',
  errorLoad: 'Impossible de charger les votes.',
  empty: 'Aucun vote MVP n’a encore été ouvert pour ce tournoi.',
  totalVotes: 'Voix exprimées',
  openPolls: 'Votes ouverts',
  matchesWithVotes: 'Matchs avec des voix',
  filterAll: 'Tous',
  filterOpen: 'Ouverts',
  filterClosed: 'Clos',
  stateOpen: 'Vote ouvert',
  stateExpired: 'À dépouiller',
  stateClosed: 'Clos',
  stateNone: 'Pas de vote ouvert',
  closesAt: 'Clôture {date}',
  closedAt: 'Clos le {date}',
  noVotes: 'Aucune voix pour l’instant.',
  votesCount: '{count} voix',
  leader: 'En tête : {name}',
  leaderDetail: '{votes}/{total} voix sur {source}',
  reasonNoVotes: 'Personne en tête : aucune voix.',
  reasonTooFew: 'Personne en tête : moins de {min} voix.',
  reasonTie: 'Personne en tête : égalité.',
  winner: 'MVP : {name}',
  winnerManual: 'tranché par le staff',
  sourceTwitch: 'Twitch',
  sourceDiscord: 'Discord',
  vs: 'vs',
  tbd: 'À déterminer',
});
