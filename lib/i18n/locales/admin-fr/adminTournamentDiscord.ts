// lib/i18n/locales/admin-fr/adminTournamentDiscord.ts
//
// Traductions FRANCAISES du namespace `adminTournamentDiscord` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTournamentDiscord', {
  pageTitle: 'Admin – Discord',
  backToTournament: 'Retour au tournoi',
  heading: 'Webhooks Discord',
  introBefore:
    "Configurez un webhook par type de channel. Si rien n'est configuré pour un type, la ",
  introLinkMaster: 'configuration maître',
  introMiddle: ' sert de fallback. Réservé au rôle ',
  introAfter: '.',
  strategyBefore:
    'Stratégie : un webhook configuré ici prend la main pour ce tournoi. Sinon, le webhook global déclaré dans ',
  strategyLink: 'Paramètres du site → Webhooks Discord',
  strategyAfter: " s'applique automatiquement.",
  overrideActiveTitle:
    'Cette configuration override le webhook maître pour ce tournoi',
  overrideActive: 'Override actif',
  masterFallbackTitle: 'Voir / modifier le webhook maître',
  masterFallback: 'Maître (fallback) ↗',
  notConfiguredTitle:
    'Aucun webhook (ni override ni maître) — pas de notification pour ce channel',
  notConfigured: 'Non configuré',
  webhookUrlLabel: 'URL du webhook Discord',
  active: 'Actif',
  roleMentionLabel:
    'Rôle à pinger (optionnel) — ID Discord, "everyone", ou "here"',
  roleHintBefore: 'Astuce : pour récupérer un ID de rôle Discord, tape ',
  roleHintAfter:
    " dans Discord puis envoie le message — il affichera l'ID brut.",
  saving: 'Enregistrement...',
  save: 'Enregistrer',
  test: 'Tester',
  delete: 'Supprimer',
  confirmDeleteTitle: 'Supprimer le webhook "{label}" pour ce tournoi ?',
  confirmDeleteSubtitle:
    "Le webhook maître (s'il existe) reprendra la main pour ce channel.",
  confirmDeleteLabel: 'Supprimer',
  toastUrlRequired: 'URL du webhook requise',
  toastSaved: 'Webhook enregistré',
  toastDeleted: 'Webhook supprimé',
  toastTestSent: 'Message de test envoyé',
  errorLoad: 'Impossible de charger les webhooks',
  errorSave: 'Échec de la sauvegarde',
  errorDelete: 'Échec de la suppression',
  errorTest: 'Échec du test',
});
