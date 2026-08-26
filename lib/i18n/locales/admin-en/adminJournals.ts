// lib/i18n/locales/admin-en/adminJournals.ts
//
// Traductions ANGLAISES du namespace admin `adminJournals`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminJournals.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – Journaux',
  heading: 'Journaux',
  subtitle: 'Staff activity, sent emails and Discord bot logs.',
  tabsAriaLabel: 'Types de journaux',
  tabStaff: 'Staff',
  tabEmails: 'Emails',
  tabDiscord: 'Discord',
};
