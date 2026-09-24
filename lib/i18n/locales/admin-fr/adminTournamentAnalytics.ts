// lib/i18n/locales/admin-fr/adminTournamentAnalytics.ts
//
// Traductions FRANCAISES du namespace `adminTournamentAnalytics` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTournamentAnalytics', {
  pageTitle: 'Admin – Analytics du tournoi',
  back: '← Retour au tableau de bord',
  heading: 'Analytics du tournoi',
  tournamentLabel: 'Tournoi : ',
  loading: 'Chargement...',
  refresh: 'Actualiser',
  loadingAnalytics: 'Chargement des analytics...',
  empty: 'Aucune donnée analytique pour ce tournoi (aucun match joué).',
  kpiMatchesPlayed: 'Matchs joués',
  kpiGamesPlayed: 'Games jouées',
  kpiAvgDuration: 'Durée moy. / game',
  kpiOvertime: '% Overtime',
  kpiDecisiveGames: '% Games décisifs',
  kpiTotalMatches: 'Matchs total',
  tierListTitle: 'Tier list',
  tierListSubtitle:
    'Composite : 65 % de matchs gagnés, 35 % de manches gagnées. Seuils fixes — un plateau serré peut n’avoir aucune équipe en S.',
  tierListEmpty: 'Pas encore assez de matchs joués pour classer les équipes.',
  tierTeamTitle:
    '{wins} victoires, {losses} défaites — {maps} de manches gagnées',
  tierUnranked: 'Non classées (moins de {minPlayed} matchs joués) : {teams}.',
  comparatorTitle: 'Comparateur',
  comparatorSubtitle:
    'Deux équipes côte à côte, et leur face-à-face réel dans ce tournoi.',
  comparatorLeft: 'Équipe A',
  comparatorRight: 'Équipe B',
  comparatorMetric: 'Mesure',
  comparatorPlayed: 'Matchs joués',
  comparatorRecord: 'Bilan (V–D)',
  comparatorWinRate: 'Taux de victoire',
  comparatorMaps: 'Manches (gagnées–perdues)',
  comparatorDuel:
    'Face-à-face : {matches} match(s) — {left} {leftWins}, {right} {rightWins} ; manches {leftMaps}–{rightMaps}.',
  comparatorNoDuel:
    'Ces deux équipes ne se sont pas rencontrées dans ce tournoi.',
  comparatorPickTwo: 'Choisissez deux équipes différentes.',
  teamsTitle: 'Équipes',
  teamsSubtitle: 'Classées par taux de victoire, puis par victoires',
  teamsEmpty: "Aucune statistique d'équipe.",
  colTeam: 'Équipe',
  colPlayed: 'Joués',
  colWins: 'V',
  colLosses: 'D',
  colWinrate: 'Winrate',
  colMaps: 'Maps',
  mapsTitle: 'Maps',
  mapsSubtitle:
    'Picks (veto ou saisie par partie), bans de veto, parties jouées. « Choix gagnants » : maps remportées par l’équipe qui les a choisies.',
  mapsEmpty: 'Aucune statistique de map.',
  colMap: 'Map',
  colPicks: 'Picks',
  colBans: 'Bans',
  colGames: 'Games',
  colAvgDuration: 'Durée moy.',
  colOvertime: '% OT',
  heroesTitle: 'Héros',
  heroesSubtitle: 'Picks / bans / winrate',
  heroesEmpty: 'Aucune statistique de héros.',
  colHero: 'Héros',
  kpiPickedMaps: 'Maps choisies',
  kpiPickerWinRate: 'Map choisie → gagnée',
  kpiPickerWinRateHint: '{wins} sur {total} maps choisies',
  kpiHeroBans: 'Bans de héros',
  kpiHeroBansHint: 'sur {maps} maps',
  notRecorded:
    'Non saisi pour ce tournoi : {fields}. Les indicateurs correspondants sont masqués.',
  notRecordedDuration: 'durée des parties',
  notRecordedOvertime: 'prolongations',
  notRecordedTiebreaker: 'manches décisives',
  colPickerWins: 'Choix gagnants',
  heroBansTitle: 'Bans de héros',
  heroBansSubtitle:
    '{bans} bans sur {maps} maps. « % des maps » : part des maps où le héros a été banni.',
  colRole: 'Rôle',
  colBanRate: '% des maps',
  colBannedBy: 'Banni par',
  roleTank: 'Tank',
  roleDamage: 'DPS',
  roleSupport: 'Soutien',
  teamBansTitle: 'Bans par équipe',
  teamBansSubtitle:
    'Ce que chaque équipe retire à ses adversaires, et ce que ses adversaires lui retirent — ce qu’on craint d’elle.',
  colBansMade: 'Ses bans',
  colBansReceived: 'Bans subis',
  errorUnexpected: 'Erreur inattendue',
  entryCta: 'Saisir une soirée',
  entryHeading: 'Saisie d’une soirée',
  entrySubtitle:
    'Pour chaque match du jour : les maps jouées, qui a choisi la map, les bans de héros et le score de chaque map. Le score du match se calcule tout seul à partir des maps.',
  entryDayLabel: 'Soirée',
  entryMatchCount: '{count} match(s)',
  entryToFill: '{count} à saisir',
  entryNoMatches: 'Aucun match programmé dans ce tournoi.',
  entryForfeit: 'Forfait : rien à saisir.',
  entryTbd: 'Affiche pas encore fixée.',
  entryOpenMatch: 'Ouvrir la fiche du match',
  entryUnsaved: 'Modifications non enregistrées',
  entryRecomputeNote:
    'À l’enregistrement, le score du match est recalculé depuis les maps et le match passe « terminé ».',
  entryTieWarning:
    '{count} map(s) à égalité : aucune gagnante ne sera comptée pour elles.',
  entrySaveMatch: 'Enregistrer ce match',
  entrySaveAll: 'Enregistrer les {count} matchs modifiés',
  entrySaving: 'Enregistrement…',
  entrySaved: 'Match enregistré.',
  entrySavedAll: '{ok} match(s) enregistré(s) sur {total}.',
  entrySaveError: 'Enregistrement impossible.',
  entryUnnamedMap: 'Une map a un score ou des bans mais pas de nom.',
  entryMissingMaps: 'Il faut au moins {count} maps pour ce format.',
  entryLoadError: 'Impossible de charger les matchs.',
});
