// lib/i18n/locales/admin-fr/adminStagesCreate.ts
//
// Traductions FRANCAISES du namespace `adminStagesCreate` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminStagesCreate', {
  errLoadTournaments: 'Erreur inattendue lors du chargement des tournois',
  errSettingsInvalid: 'Le JSON de configuration (settings) est invalide.',
  errSelectTournament: 'Merci de sélectionner un tournoi.',
  errNameRequired: 'Le nom de la phase est obligatoire.',
  errDateOrder: 'La date de fin doit être postérieure à la date de début.',
  errSettingsGeneric: 'Erreur dans le JSON de configuration.',
  toastCreated: 'Phase créée avec succès.',
  errCreate: 'Erreur inconnue lors de la création de la phase',
  pageTitle: 'Admin – Créer une phase',
  back: '← Retour',
  heading: 'Nouvelle phase (stage)',
  subtitle: 'Associe cette phase à un tournoi puis configure ses paramètres.',
  parentTournamentTitle: 'Tournoi parent',
  tournamentLabel: 'Tournoi',
  loadingTournaments: 'Chargement des tournois…',
  selectTournament: 'Sélectionner un tournoi',
  tournamentHelp:
    'La phase sera rattachée à ce tournoi et visible dans son dashboard admin.',
  generalInfoTitle: 'Informations générales',
  nameLabel: 'Nom de la phase',
  namePlaceholder: 'Playoffs, Groupes A, Swiss #1…',
  slugLabel: 'Slug (URL interne)',
  slugPlaceholder: 'playoffs, swiss-1…',
  slugHelp: 'Laisse vide pour laisser le backend gérer.',
  stageTypeLabel: 'Type de phase',
  stageTypeNone: '(Non défini / custom)',
  stageTypeGroup: 'Groupes',
  stageTypeBracket: 'Bracket (elim)',
  stageTypeSwiss: 'Swiss',
  stageTypeRoundRobin: 'Round Robin',
  stageTypeShowmatch: 'Showmatch',
  stageTypeOther: 'Autre',
  orderLabel: 'Ordre dans le tournoi',
  orderPlaceholder: '1, 2, 3…',
  orderHelp: 'Pour trier les phases (1 = première, 2 = deuxième, etc.).',
  visibilityTitle: 'Visibilité & planning',
  activeLabel: 'Phase active (prise en compte dans le tournoi)',
  publicLabel: 'Visible publiquement (page tournoi)',
  startLabel: 'Début de la phase',
  endLabel: 'Fin de la phase',
  settingsTitle: 'Configuration avancée (settings JSON)',
  settingsHelp:
    'Utilisé pour stocker la configuration spécifique de la phase (options Swiss, nombre de maps, seedings, etc.). Tu peux laisser le JSON vide ou minimal et le compléter plus tard.',
  cancel: 'Annuler',
  creating: 'Création…',
  submit: 'Créer la phase',
});
