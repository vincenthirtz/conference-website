// lib/i18n/locales/admin-fr/adminSiteSettingsDiscord.ts
//
// Traductions FRANCAISES du namespace `adminSiteSettingsDiscord` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminSiteSettingsDiscord', {
  pageTitle: 'Admin — Webhooks Discord (global)',
  back: 'Retour aux parametres',
  heading: 'Webhooks Discord — configuration maitre',
  introPart1: "Ces webhooks s'appliquent",
  introDefault: 'par defaut',
  introPart2:
    'a tous les tournois. Si un tournoi declare son propre webhook pour un channel donne (via',
  introLink: '/admin/tournament/:id/discord',
  introPart3:
    "), c'est le webhook du tournoi qui prend la main pour ce channel.",
  reservedPrefix: 'Reserve au role',
  reservedSuffix: '.',
  statusActive: 'Actif',
  statusConfiguredInactive: 'Configure (inactif)',
  statusNotConfigured: 'Non configure',
  webhookUrlLabel: 'URL du webhook Discord',
  roleMentionLabel:
    'Role a pinger (optionnel) — ID Discord, "everyone" ou "here"',
  checkboxActive: 'Actif',
  saving: 'Enregistrement...',
  save: 'Enregistrer',
  test: 'Tester',
  testDisabledTitle:
    "Enregistre d'abord la configuration pour pouvoir la tester",
  delete: 'Supprimer',
  webhookUrlRequired: 'URL du webhook requise',
  saveSuccess: 'Webhook global enregistre',
  deleteConfirmTitle: 'Supprimer le webhook global "{label}" ?',
  deleteConfirmSubtitle:
    "Les tournois qui n'ont pas leur propre configuration n'auront plus aucune notification pour ce type de channel.",
  deleteConfirmLabel: 'Supprimer',
  deleteSuccess: 'Webhook global supprime',
  testSuccess: 'Message de test envoye',
});
