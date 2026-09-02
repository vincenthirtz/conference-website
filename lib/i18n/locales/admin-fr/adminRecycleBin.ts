// lib/i18n/locales/admin-fr/adminRecycleBin.ts
//
// Traductions FRANCAISES du namespace `adminRecycleBin` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminRecycleBin', {
  pageTitle: 'Admin – Corbeille',
  typeStage: 'Phase',
  typeTeam: 'Equipe',
  typeMatch: 'Match',
  typePartner: 'Partenaire',
  typeCastMember: 'Casteur',
  typeAdherent: 'Adherent',
  typeStaff: 'Staff',
  typeScrim: 'Scrim',
  backToDashboard: 'Retour au dashboard',
  heading: 'Corbeille',
  subtitle:
    'Elements desactives ou annules. Restaurez-les pour les remettre en service.',
  countInBin_one: '{count} element dans la corbeille.',
  countInBin_other: '{count} elements dans la corbeille.',
  filterAll: 'Tous les types',
  filterStages: 'Phases',
  filterTeams: 'Equipes',
  filterMatches: 'Matches',
  filterPartners: 'Partenaires',
  filterCastMembers: 'Casteurs',
  filterAdherents: 'Adherents',
  filterStaff: 'Staff',
  filterScrims: 'Scrims',
  refresh: 'Rafraichir',
  empty: 'La corbeille est vide.',
  deletedOn: 'Supprime le {date}',
  restoring: 'Restauration…',
  restore: 'Restaurer',
  previous: 'Precedent',
  next: 'Suivant',
  paginationTotal: ' sur {total}',
  confirmRestoreTitle: 'Restaurer {type} "{name}" ?',
  confirmRestoreLabel: 'Restaurer',
  toastRestored: '{type} "{name}" restaure avec succes.',
  errorUnexpected: 'Erreur inattendue',
  errorRestore: 'Erreur lors de la restauration',
});
