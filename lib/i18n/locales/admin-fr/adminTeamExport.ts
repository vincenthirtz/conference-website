// lib/i18n/locales/admin-fr/adminTeamExport.ts
//
// Traductions FRANCAISES du namespace `adminTeamExport` — SOURCE DE VERITE.
// Export CSV / PDF des equipes : boutons (TeamExportActions) et feuille
// imprimable (pages/admin/teams/print.tsx, TeamExportSheet).
// Le pendant anglais vit dans `../admin-en/adminTeamExport.ts` : toute cle
// ajoutee ici doit l'etre aussi cote anglais (garde-fou `../admin-parity.ts`).

import { adminNs } from '../../ns';

export default adminNs('adminTeamExport', {
  groupLabel: 'Exporter les équipes',
  exportCsv: 'Exporter CSV',
  exportPdf: 'Exporter PDF',
  csvExporting: 'Export en cours…',
  csvHintList:
    'Télécharge un CSV de toutes les équipes qui correspondent aux filtres affichés (pas seulement la page en cours)',
  csvHintTeam: 'Télécharge un CSV de cette équipe',
  pdfHintList:
    'Ouvre une version imprimable des équipes filtrées dans un nouvel onglet (« Enregistrer au format PDF » dans la boîte d’impression)',
  pdfHintTeam:
    'Ouvre une version imprimable de cette équipe dans un nouvel onglet (« Enregistrer au format PDF » dans la boîte d’impression)',
  csvDone: 'Export CSV téléchargé',
  csvError: 'L’export CSV a échoué : {message}',
  csvHttpError: 'erreur {status}',
  headTitle: 'Admin – Export des équipes',
  titleAll: 'Toutes les équipes',
  titleTournament: 'Équipes — {name}',
  titleTeamFallback: 'Équipe',
  generatedAt: 'Généré le {date}',
  dateLocale: 'fr-FR',
  teamCount_one: '{count} équipe',
  teamCount_other: '{count} équipes',
  filtersPrefix: 'Filtres : ',
  filterSearch: 'recherche « {q} »',
  filterActive: 'actives',
  filterInactive: 'inactives',
  truncated:
    'Export tronqué : toutes les équipes n’ont pas pu être incluses. Affinez les filtres (tournoi, recherche) pour obtenir une liste complète.',
  loading: 'Préparation de l’export…',
  loadError: 'Impossible de charger l’export : {message}',
  retry: 'Réessayer',
  emptyTitle: 'Aucune équipe à exporter',
  emptyDesc: 'Aucune équipe ne correspond à ces critères.',
  backToList: '← Retour à la liste des équipes',
  backToTeam: '← Retour à la fiche de l’équipe',
  roster: 'Roster',
  subs: 'Remplaçantes',
  staff: 'Staff',
  none: 'Aucun membre',
  colPseudo: 'Pseudo',
  colBattleTag: 'BattleTag',
  colDiscord: 'Discord',
  colRole: 'Rôle / poste',
  captain: 'Capitaine',
  registration: 'Inscription : {status}',
  regStatus: {
    registered: 'inscrite',
    pending: 'en attente',
    confirmed: 'confirmée',
    checked_in: 'check-in fait',
    waitlist: 'liste d’attente',
    withdrawn: 'retirée',
    rejected: 'refusée',
    disqualified: 'disqualifiée',
  },
  specialty: {
    tank: 'Tank',
    dps: 'DPS',
    support: 'Support',
    flex: 'Flex',
  },
});
