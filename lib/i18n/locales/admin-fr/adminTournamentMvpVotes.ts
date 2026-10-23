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
    'Le « coup de cœur du public » : ouvert par la régie jusqu’à sa clôture manuelle (4 h au plus, il se clôt ensuite tout seul), les viewers Twitch (!mvp N) et les supporters Discord. Contrairement au vote des équipes, les deux plateformes s’ADDITIONNENT. Le « en tête » applique cette règle : au moins {min} voix au total, pas d’égalité.',
  emptyPublic:
    'Aucun vote du public n’a encore été ouvert pour ce tournoi. Il s’ouvre depuis le cockpit caster (/admin/caster › Poll MVP), match rattaché.',
  sourceCombined: 'Twitch + Discord',
  openTitle: 'Lancer un vote du public',
  openHelp:
    'Pour un match en cours, terminé ou à venir — par exemple en fin de diffusion, avant la saisie du score. Le bot poste le vote dans son salon Discord (supporters), et le chat Twitch vote par !mvp <pseudo>. Le vote reste ouvert jusqu’à « Clore maintenant », 4 h au plus : passé ce délai, il se clôt et se dépouille tout seul.',
  openNone: 'Aucun match (en cours, terminé ou à venir) sans vote du public.',
  openNoneToday: 'Aucun match aujourd’hui : voici tous les matchs du tournoi.',
  openShowAll: 'Tous les matchs du tournoi ({count})',
  openStateOngoing: 'En cours',
  openStateUpcoming: 'À venir',
  openMatchLabel: 'Match',
  openCta: 'Lancer le vote',
  openDone: 'Vote du public lancé.',
  closeCta: 'Clore maintenant',
  closeConfirmTitle: 'Clore le vote du public ?',
  /** Interpole {match}, {votes}. */
  closeConfirmBody:
    '{match} — {votes} voix. Le dépouillement désigne la MVP du public et lui verse ses pièces TCG. « Relancer le vote » le rouvrirait en gardant les voix.',
  closeDone: 'Vote du public clos.',
  twitchChatMissingScope:
    'Vote lancé, mais le chat Twitch ne compte pas les !mvp : la chaîne doit être reconnectée (droits du chat). Les votes Discord comptent.',
  twitchChatNotConnected:
    'Vote lancé, mais aucune chaîne Twitch n’est connectée : seuls les votes Discord comptent.',
  twitchChatFailed:
    'Vote lancé, mais l’abonnement au chat Twitch a échoué : les !mvp du chat ne seront pas comptés. Les votes Discord comptent.',
  reopenCta: 'Relancer le vote',
  reopenConfirmTitle: 'Relancer le vote du public ?',
  reopenConfirmBody:
    'Le vote rouvre jusqu’à ce que tu le clôtures, 4 h au plus. Les voix déjà exprimées sont conservées ; le résultat affiché est effacé jusqu’à la nouvelle clôture. Si une autre joueuse l’emporte, elle reçoit aussi ses pièces TCG.',
  reopenDone: 'Vote du public relancé.',
  actionError: 'L’opération a échoué.',
});
