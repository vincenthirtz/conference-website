// lib/i18n/locales/admin-fr/adminDiscordTeamChannels.ts
//
// Traductions FRANCAISES du namespace `adminDiscordTeamChannels` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminDiscordTeamChannels', {
  pageTitle: 'Salons Discord des équipes',
  intro:
    'Le bot ne gère plus les salons tout seul. Chaque action part d’ici, et rien ne se déclenche sans un clic.',
  refreshAll: 'Rafraîchir l’état',
  refreshing: 'Demande envoyée…',
  neverRefreshed: 'Jamais rafraîchi',
  capturedAt: 'Vu le {date}',
  loading: 'Chargement…',
  empty: 'Aucune équipe.',

  colTeam: 'Équipe',
  colRole: 'Rôle',
  colText: 'Salon texte',
  colVoice: 'Salon vocal',
  colAccess: 'Accès',
  colActions: 'Actions',

  statusOk: 'OK',
  statusMissing: 'Manquant',
  statusUnknown: '—',
  storedButGone: 'Enregistré mais introuvable sur Discord',
  notProvisioned: 'Jamais provisionné',
  inactiveBadge: 'Inactive',

  actionProvision: 'Provisionner',
  actionRepair: 'Réparer les permissions',
  actionDeleteText: 'Supprimer le salon texte',
  actionDeleteVoice: 'Supprimer le salon vocal',
  actionManage: 'Gérer les accès',
  actionClose: 'Fermer',

  accessTitle: 'Qui peut entrer',
  accessNone: 'Personne pour l’instant.',
  accessViaRole: 'par le rôle d’équipe',
  accessViaText: 'accès individuel — salon texte',
  accessViaVoice: 'accès individuel — salon vocal',
  accessRevoke: 'Retirer',

  grantTitle: 'Donner un accès',
  grantHelp:
    'Le rôle d’équipe ouvre les deux salons et marque l’appartenance. Un accès individuel n’ouvre qu’un salon — pour un coach externe ou une casteuse invitée.',
  grantUserLabel: 'ID Discord',
  grantUserPlaceholder: '123456789012345678',
  grantModeRole: 'Rôle d’équipe',
  grantModeText: 'Salon texte seulement',
  grantModeVoice: 'Salon vocal seulement',
  grantSubmit: 'Donner l’accès',

  confirmDeleteTitle: 'Supprimer ce salon ?',
  confirmDeleteBody:
    'Le salon et tout son historique disparaissent définitivement. Rien ne les rend.',
  confirmDelete: 'Supprimer',
  confirmCancel: 'Annuler',

  toastQueued:
    'Demande transmise au bot. L’état se met à jour dans quelques secondes.',
  toastQueuedOffline:
    'Bot injoignable : la demande est en file, elle partira à sa prochaine connexion.',
  toastError: 'L’action a échoué.',
  errorLoad: 'Impossible de charger l’état des salons.',
  errorInvalidId: 'ID Discord invalide (15 à 25 chiffres).',
});
