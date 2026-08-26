// lib/i18n/locales/fr/leagueDetail.ts
//
// Traductions FRANCAISES du namespace `leagueDetail` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('leagueDetail', {
  statusDraft: 'Brouillon',
  statusActive: 'En cours',
  statusFinished: 'Terminée',
  statusArchived: 'Archivée',
  backToLeagues: '← Retour aux ligues',
  standingsHeading: 'Classement',
  tournamentsHeading: 'Tournois de la saison',
  scrimsHeading: 'Scrims de la saison',
  standingsEmpty:
    "Aucun classement disponible pour le moment. Les points apparaîtront dès qu'un tournoi de la saison sera terminé.",
  colRank: 'Rang',
  colTeam: 'Équipe',
  colPoints: 'Points',
  colTournaments: 'Tournois',
  colScrims: 'Scrims',
  colBestRank: 'Meilleur rang',
  unknownTeam: 'Équipe inconnue',
  tournamentsEmpty: 'Aucun tournoi rattaché à cette saison pour le moment.',
  tournamentFallback: 'Tournoi',
  scrimsEmpty: 'Aucun scrim rattaché à cette saison pour le moment.',
  scrimFallback: 'Scrim',
  notFoundHeading: 'Ligue introuvable',
  notFoundBody: "Cette ligue n'existe pas ou n'est pas publique.",
  viewLeagues: 'Voir les ligues',
  errorHeading: 'Impossible de charger cette ligue',
  errorBody: 'Une erreur est survenue. Réessayez dans quelques instants.',
  retry: 'Réessayer',
});
