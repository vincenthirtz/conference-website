// lib/i18n/locales/admin-fr/adminTournamentHistory.ts
//
// Traductions FRANCAISES du namespace `adminTournamentHistory` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTournamentHistory', {
  pageTitle: 'Admin – Historique du tournoi',
  backToTournament: '← Retour au tournoi',
  heading: 'Historique staff du tournoi',
  intro:
    'Journal des actions staff (création / update / batch, etc.) sur ce tournoi et ses entités liées.',
  labelEntityType: 'Type d’entité (entity_type)',
  placeholderEntityType: 'ex: "tournament", "match", "stage"...',
  labelAction: 'Action',
  placeholderAction: 'ex: "update_tournament", "create_match"...',
  labelLimit: 'Limite',
  filter: 'Filtrer',
  loading: 'Chargement...',
  logsCount: 'Logs ({count})',
  sortedNewestFirst: 'Trié du plus récent au plus ancien',
  empty: 'Aucun log trouvé pour ces filtres.',
  by: 'par',
  detailsPayload: 'Détails (payload)',
  openMatch: 'Ouvrir le match',
  openStage: 'Ouvrir la phase (stage)',
  openTeam: 'Ouvrir l’équipe',
  errorLoad: 'Impossible de charger l’historique',
  errorUnknown: 'Erreur inconnue',
});
