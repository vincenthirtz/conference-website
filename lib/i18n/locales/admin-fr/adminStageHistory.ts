// lib/i18n/locales/admin-fr/adminStageHistory.ts
//
// Traductions FRANCAISES du namespace `adminStageHistory` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminStageHistory', {
  errLoadHistory: 'Impossible de charger l’historique',
  errUnknown: 'Erreur inconnue',
  pageTitle: 'Admin – Historique de la phase',
  back: '← Retour à la phase',
  heading: 'Historique staff de la phase',
  subtitle:
    'Journal des actions staff liées à cette phase (stages, matches, etc.).',
  entityTypeLabel: "Type d'entité (entity_type)",
  entityTypePlaceholder: 'ex: "stage", "match", "team"...',
  actionLabel: 'Action',
  actionPlaceholder: 'ex: "create_match", "update_stage"...',
  limitLabel: 'Limite',
  filter: 'Filtrer',
  loading: 'Chargement...',
  logsCount: 'Logs ({count})',
  sortedHint: 'Trié du plus récent au plus ancien',
  emptyLogs: 'Aucun log trouvé pour ces filtres.',
  by: 'par',
  payloadDetails: 'Détails (payload)',
  openMatch: 'Ouvrir le match',
  openStage: 'Ouvrir la phase',
  openTeam: "Ouvrir l'équipe",
  openTournament: 'Ouvrir le tournoi',
});
