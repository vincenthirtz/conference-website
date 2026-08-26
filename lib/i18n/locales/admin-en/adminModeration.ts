// lib/i18n/locales/admin-en/adminModeration.ts
//
// Traductions ANGLAISES du namespace admin `adminModeration`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminModeration.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – Moderation',
  heading: 'Moderation',
  subtitle:
    'Comments, disputes, blacklists (players, teams & orgs) and support tickets.',
  tabsAriaLabel: 'Moderation sections',
  tabComments: 'Comments',
  tabDisputes: 'Disputes',
  tabBlacklist: 'Blacklist',
  tabSupport: 'Support',
  blSubTabsAriaLabel: 'Blacklist types',
  blSubTabPlayers: 'Players',
  blSubTabEntities: 'Teams & orgs',
};
