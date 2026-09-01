// lib/i18n/locales/admin-en/adminCommunicationsHub.ts
//
// Traductions ANGLAISES du namespace admin `adminCommunicationsHub`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminCommunicationsHub.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – Communication',
  heading: 'Communication',
  subtitle:
    'News, announcements, email campaigns, social posts and staff push notifications.',
  tabsAriaLabel: 'Communication sections',
  tabNews: 'News',
  tabAnnouncements: 'Announcements',
  tabCampaigns: 'Campaigns',
  tabNotifications: 'Notifications',
  tabTeams: 'Teams',
  tabSocial: 'Social',
};
