// lib/i18n/locales/admin-en/adminAideTournoi.ts
//
// Traductions ANGLAISES du namespace admin `adminAideTournoi`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminAideTournoi.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Tournament help (Discord) – Admin',
  metaDescription:
    'Complete walkthrough for running a tournament from the Discord bot, without touching the admin UI.',
  breadcrumbAdmin: 'Admin',
  breadcrumbCurrent: 'Tournament help (Discord)',
  docLabel: 'Staff documentation',
  heading: 'Tournament help (Discord)',
  intro:
    'Complete walkthrough for running a tournament from the bot, without touching the UI. Each command lists its role, endpoint, DB/UI impact, and a sample payload.',
  versionLabel: 'version {version}',
  sectionsCount: '{sections} sections · {commands} commands',
  tocTitle: 'Contents',
  tocAriaLabel: 'Contents',
  roleAdmin: 'Admin',
  roleCaptain: 'Captain',
  rolePlayer: 'Player',
  rolePublic: 'Public',
  prereqs: 'Prerequisites',
  endpoint: 'Endpoint',
  apiNote: '(no site API call)',
  impactDb: 'DB impact',
  noneReadOnly: 'None (read-only)',
  uiPages: 'Affected UI pages',
  noneFem: 'None',
  examplesLabel: 'Examples ({count})',
  payload: 'Payload',
  copied: 'Copied!',
  copy: 'Copy',
  expectedResult: 'Expected result',
  noPayload: '(no payload)',
};
