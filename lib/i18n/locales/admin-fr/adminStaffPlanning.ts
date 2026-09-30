// lib/i18n/locales/admin-fr/adminStaffPlanning.ts
//
// Traductions FRANCAISES du namespace admin `adminStaffPlanning`.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` ; le garde-fou
// `../admin-parity.ts` casse le typecheck si une cle manque d'un cote.

import { adminNs } from '../../ns';

export default adminNs('adminStaffPlanning', {
  headTitle: 'Planning du staff — Admin',
  eyebrow: 'Staff & Asso',
  pageTitle: 'Planning du staff',
  subtitle:
    'Qui est disponible, quel soir : cast, modération, prod OBS et gestion du live.',
  loadError: 'Impossible de charger le planning.',
  monthPrev: 'Mois précédent',
  monthNext: 'Mois suivant',
  today: 'Aujourd’hui',
  moreEvents: '+{count} autres',
  collapse: 'réduire',
  legendTitle: 'Équipe',
  legendHint: 'Clique un nom pour ne voir que ses créneaux.',
  legendAll: 'Tout le monde',
  legendCount: '{count} ce mois',
  emptyMonth: 'Aucun créneau ce mois-ci.',
  roleNone: 'Rôle non précisé',
  role_cast: 'Cast',
  role_moderation: 'Staff / modération',
  role_prod_obs: 'Prod OBS',
  role_live_prod: 'Gestion du live / prod TV',
  sourceCsv: 'importé du tableur',
  sourceManual: 'saisi à la main',
  untilNextDay: '(fin le lendemain)',
  dayTitle: 'Créneaux du {date}',
  dayEmpty: 'Personne n’est inscrit ce jour-là.',
  deleteSlot: 'Retirer',
  confirmDeleteTitle: 'Retirer ce créneau ?',
  confirmDeleteSubtitle: '{person} · {date} · {range}',
  toastDeleted: 'Créneau retiré',
  errorDelete: 'Suppression impossible.',
  addTitle: 'Ajouter un créneau',
  fieldPerson: 'Personne',
  fieldDate: 'Jour',
  fieldStart: 'Début',
  fieldEnd: 'Fin',
  fieldRole: 'Rôle',
  fieldNote: 'Note (facultatif)',
  addSubmit: 'Ajouter',
  toastAdded: 'Créneau ajouté',
  errorAdd: 'Ajout impossible.',
  importTitle: 'Importer le tableur',
  importHint:
    'Fichier › Télécharger › CSV depuis le tableur « Calendrier disponibilité ». Les créneaux importés des mois du fichier remplacent l’import précédent ; ceux saisis ici restent.',
  importPick: 'Choisir le fichier CSV',
  importSummary: '{entries} créneaux · {people} personnes · {months}',
  importWarnings: '{count} cellule(s) non comprise(s) :',
  importNothing: 'Aucun mois reconnu dans ce fichier.',
  importSubmit: 'Importer',
  importCancel: 'Annuler',
  toastImported: '{inserted} créneaux importés',
  errorImport: 'Import impossible.',
  readOnlyNote:
    'Lecture seule : la gestion du planning est réservée à la gestion du staff.',
});
