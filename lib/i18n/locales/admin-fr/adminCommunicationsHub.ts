// lib/i18n/locales/admin-fr/adminCommunicationsHub.ts
//
// Traductions FRANCAISES du namespace `adminCommunicationsHub` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminCommunicationsHub', {
  pageTitle: 'Admin – Communication',
  heading: 'Communication',
  subtitle:
    'Actualités, annonces, campagnes emails et notifications push du staff.',
  tabsAriaLabel: 'Sections communication',
  tabNews: 'Actualités',
  tabAnnouncements: 'Annonces',
  tabCampaigns: 'Campagnes',
  tabNotifications: 'Notifications',
  tabTeams: 'Équipes',
});
