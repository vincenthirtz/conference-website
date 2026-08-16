// lib/i18n/locales/admin-fr/adminApiTokens.ts
//
// Traductions FRANCAISES du namespace `adminApiTokens` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminApiTokens', {
  pageTitle: 'Tokens API — Admin',
  breadcrumbAdmin: 'Admin',
  breadcrumbTitle: 'Tokens API',
  kicker: 'API publique',
  heading: 'Tokens API',
  intro:
    "Créez des tokens d'accès à l'API publique, avec des permissions (scopes) restreintes. Le token en clair n'est affiché qu'une seule fois à la création.",
  createHeading: 'Créer un token',
  createSubtitle: "Nommez le token et choisissez les scopes qu'il porte.",
  nameLabel: 'Nom',
  namePlaceholder: 'ex : Intégration OBS, script de scoring…',
  scopesLabel: 'Scopes',
  scopesHint:
    "Sélectionnez au moins un scope. Un token « :write » autorise l'écriture, « :read » la lecture seule.",
  createButton: 'Créer le token',
  creating: 'Création…',
  errorNameRequired: 'Le nom est requis.',
  errorScopesRequired: 'Sélectionnez au moins un scope.',
  listHeading: 'Tokens existants',
  colName: 'Nom',
  colPrefix: 'Préfixe',
  colScopes: 'Scopes',
  colCreated: 'Créé le',
  colExpires: 'Expiration',
  colLastUsed: 'Dernière utilisation',
  colStatus: 'Statut',
  colActions: 'Actions',
  statusActive: 'Actif',
  statusRevoked: 'Révoqué',
  statusExpired: 'Expiré',
  neverUsed: 'Jamais',
  byCreator: 'par {name}',
  expiryLabel: 'Expiration',
  expiryNever: 'Jamais',
  expiryInDays: '{d} jours',
  expiryHint:
    'Passé ce délai, le token est automatiquement refusé. Utile pour la rotation ou un accès temporaire.',
  revokeButton: 'Révoquer',
  revoking: 'Révocation…',
  confirmRevokeTitle: 'Révoquer ce token ?',
  confirmRevokeSubtitle:
    'Le token cessera immédiatement de fonctionner. Cette action est irréversible.',
  confirmRevokeLabel: 'Révoquer',
  emptyState: "Aucun token pour l'instant. Créez-en un ci-dessus.",
  loading: 'Chargement des tokens…',
  toastCreated: 'Token créé.',
  toastRevoked: 'Token révoqué.',
  errorLoad: 'Impossible de charger les tokens.',
  errorCreate: 'Impossible de créer le token.',
  errorRevoke: 'Impossible de révoquer le token.',
  compLabel: 'Partenaire — accès gratuit',
  compHint:
    'Cette clé bypasse le modèle payant : accès API gratuit. À réserver aux partenaires légitimes.',
  compOwnerOnly: 'Réservé au rôle Owner.',
  compNoteLabel: 'Note partenaire (optionnel)',
  compNotePlaceholder: 'ex : Sponsor overlay, Asso amie…',
  colComp: 'Partenaire',
  badgePartner: 'Partenaire',
  compEnableButton: "Activer l'accès gratuit",
  compDisableButton: "Retirer l'accès gratuit",
  compUpdating: 'Mise à jour…',
  confirmCompTitle: "Activer l'exemption partenaire ?",
  confirmCompSubtitle:
    "Cette clé bénéficiera d'un accès API gratuit (bypass du modèle payant). À réserver aux partenaires légitimes.",
  confirmCompLabel: "Activer l'accès gratuit",
  toastCompEnabled: 'Exemption partenaire activée.',
  toastCompDisabled: 'Exemption partenaire retirée.',
  errorComp: "Impossible de mettre à jour l'exemption partenaire.",
  errorCompForbidden: 'Réservé au rôle Owner.',
});
