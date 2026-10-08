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
  // --- Vote MVP DU PUBLIC (onglet `mvp-public`) ------------------------------
  headingPublic: 'Votes MVP du public',
  introPublic:
    'Le « coup de cœur du public » : ouvert par la régie depuis le cockpit caster, une dizaine de minutes, les viewers Twitch (!mvp N) et les supporters Discord. Contrairement au vote des équipes, les deux plateformes s’ADDITIONNENT. Le « en tête » applique cette règle : au moins {min} voix au total, pas d’égalité.',
  emptyPublic:
    'Aucun vote du public n’a encore été ouvert pour ce tournoi. Il s’ouvre depuis le cockpit caster (/admin/caster › Poll MVP), match rattaché.',
  sourceCombined: 'Twitch + Discord',
  openTitle: 'Lancer un vote du public',
  openHelp:
    'Pour un match en cours, terminé ou à venir — par exemple en fin de diffusion, avant la saisie du score. Le bot poste le vote dans son salon Discord (supporters), et le chat Twitch vote par !mvp <pseudo>.',
  openNone: 'Aucun match (en cours, terminé ou à venir) sans vote du public.',
  openStateOngoing: 'En cours',
  openStateUpcoming: 'À venir',
  openMatchLabel: 'Match',
  openMinutesLabel: 'Durée (min)',
  openCta: 'Lancer le vote',
  openDone: 'Vote du public lancé.',
  closeCta: 'Clore maintenant',
  closeDone: 'Vote du public clos.',
  reopenCta: 'Relancer le vote',
  reopenConfirmTitle: 'Relancer le vote du public ?',
  /** Interpole `{minutes}`. */
  reopenConfirmBody:
    'Le vote rouvre pour {minutes} min. Les voix déjà exprimées sont conservées ; le résultat affiché est effacé jusqu’à la nouvelle clôture. Si une autre joueuse l’emporte, elle reçoit aussi ses pièces TCG.',
  reopenDone: 'Vote du public relancé.',
  actionError: 'L’opération a échoué.',
});
