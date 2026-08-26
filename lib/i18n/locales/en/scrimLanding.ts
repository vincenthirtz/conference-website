// lib/i18n/locales/en/scrimLanding.ts
//
// Traductions ANGLAISES du namespace `scrimLanding`.
//
// La SOURCE DE VERITE est le francais (`../fr/scrimLanding.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  badge: 'Open scrims',
  heading: "Take on an OW Women's Cup team",
  subtitle:
    'Looking for a friendly match to prep for a tournament or test your line-up? Propose a scrim to one of our teams — no account needed on the site.',
  step1Title: 'Pick a team',
  step1Body:
    'Browse our active teams below and click the one you want to face.',
  step2Title: 'Fill in the request',
  step2Body:
    'Enter your team, a contact (email or Discord), a preferred date and a format. No account required.',
  step3Title: 'The captain replies',
  step3Body:
    'The captain receives your request and gets back to you directly via the contact you provided.',
  teamsHeading: 'Our teams ({count})',
  viewTournaments: 'See the tournaments →',
  noTeams: 'No active team at the moment.',
  propose: 'Propose →',
  openTeamsHeading: 'Teams open for scrims',
  openTeamsEmpty: 'No team is open for scrims at the moment.',
  openTeamsCta: 'Propose a scrim',
};
