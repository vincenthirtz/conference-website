// lib/i18n/locales/admin-fr/adminLeaguesList.ts
//
// Traductions FRANCAISES du namespace `adminLeaguesList` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminLeaguesList', {
  statusDraft: 'Brouillon',
  statusActive: 'Active',
  statusFinished: 'Terminée',
  statusArchived: 'Archivée',
  errNameRequired: 'Le nom est requis.',
  errSlugFormat:
    'Le slug doit être en minuscules, chiffres et tirets uniquement.',
  errPointsShape:
    'Le barème de points doit être un objet JSON { rang: points }.',
  toastCreated: 'Ligue créée.',
  errSlugConflict: 'Ce slug est déjà utilisé par une autre ligue.',
  errCreate: 'Erreur lors de la création.',
  formTitle: 'Nouvelle ligue',
  nameLabel: 'Nom *',
  namePlaceholder: 'Saison Été 2026',
  slugLabel: 'Slug *',
  slugPlaceholder: 'saison-ete-2026',
  descriptionLabel: 'Description',
  gameLabel: 'Jeu',
  gamePlaceholder: 'Overwatch 2',
  startDateLabel: 'Date de début',
  endDateLabel: 'Date de fin',
  pointsLabel: 'Barème de points (JSON rang → points)',
  pointsHelp: 'Laisser tel quel pour le barème par défaut.',
  publicLabel: 'Ligue publique (visible sur le site)',
  creating: 'Création…',
  submit: 'Créer la ligue',
  cancel: 'Annuler',
  pageTitle: 'Admin – Ligues',
  breadcrumbAdmin: 'Admin',
  breadcrumbLeagues: 'Ligues',
  heading: 'Ligues & saisons',
  loading: 'Chargement…',
  leagueCount_one: '{count} ligue',
  leagueCount_other: '{count} ligues',
  ratingsLink: 'Ratings',
  newLeague: 'Nouvelle ligue',
  errLoad: 'Erreur lors du chargement.',
  retry: 'Réessayer',
  emptyTitle: 'Aucune ligue',
  emptyDescription:
    'Crée une première ligue/saison pour agréger les classements de plusieurs tournois.',
  publicBadge: 'Public',
  edit: 'Éditer',
  delete: 'Supprimer',
  deleteConfirmTitle: 'Supprimer « {name} » ?',
  deleteConfirmSubtitle:
    'La ligue et ses standings seront supprimés. Cette action est irréversible.',
  deleteConfirmLabel: 'Supprimer',
  errDeleteStatus: 'Suppression échouée ({status})',
  toastDeleted: 'Ligue supprimée.',
  errDelete: 'Erreur lors de la suppression.',
});
