// lib/i18n/locales/en/mentionsLegales.ts
//
// Traductions ANGLAISES du namespace `mentionsLegales`.
//
// La SOURCE DE VERITE est le francais (`../fr/mentionsLegales.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  heroBadge: 'Legal notice',
  heroTitle: 'Legal notice & privacy',
  heroSubtitle:
    "Legal information about the Women's Cup association, the site's terms of use and a reminder of the rights of users and partners.",
  writeUs: 'Write to us',
  yourData: 'Your data',
  cookies: 'Cookies',
  editorEyebrow: 'Site publisher',
  editorTitle: "Women's Cup association",
  editorDesc:
    "Site published by the Women's Cup association, a non-profit organisation (French 1901 law) run by a volunteer team to promote women's esports.",
  identityTitle: 'Association identification',
  rnaLabel: 'RNA number',
  rnaValue: 'W691112531',
  rnaCreatedLabel: 'Date of creation',
  rnaCreatedValue: '28/01/2026',
  rnaJoLabel: 'Publication in the Journal officiel',
  rnaJoValue: '17/03/2026',
  rnaDeclarationLabel: 'Latest declaration (RNA)',
  rnaDeclarationValue: '28/01/2026',
  sirenLabel: 'SIREN number',
  sirenValue: '109 139 444',
  siretLabel: 'SIRET number (head office)',
  siretValue: '10913944400011',
  sireneCreatedLabel: 'Registration in the Sirene register',
  sireneCreatedValue: '28/01/2026',
  sireneUpdatedLabel: 'Latest update (Sirene)',
  sireneUpdatedValue: '25/08/2026',
  pubResponsible: "Publication director: Women's Cup communications team.",
  contactPrincipalLabel: 'Main contact:',
  postalLabel:
    'Postal correspondence: provided on request to avoid publishing personal addresses.',
  hostingEyebrow: 'Hosting',
  hostingTitle: 'Netlify',
  hostingDesc:
    'The site is hosted by Netlify, Inc. – www.netlify.com (static hosting and CDN).',
  hostingServices:
    'Technical services used: Supabase (authentication and database), Formspree (contact form) and in-house tools for tournament management.',
  respEyebrow: 'Liability',
  respTitle: 'Using the site',
  respIntro:
    'Information provided for guidance only. The published tournament rules are what count for participants.',
  resp1:
    'The association does everything it can to publish accurate information but cannot guarantee the complete absence of errors or omissions.',
  resp2:
    'External links on the site are provided to make resources easier to reach. The association is not responsible for their content.',
  resp3Before:
    'Any report of problematic content or a malfunction can be sent to ',
  dataEyebrow: 'Personal data',
  dataTitle: 'Data protection',
  dataDesc:
    "The data we collect is limited to what's strictly needed to run the tournament and the community.",
  finalitesTitle: 'Purposes',
  droitsTitle: 'Your rights',
  use1: 'Managing registrations and accounts (players, staff, volunteers).',
  use2: 'Responding to requests sent via the contact form or by email.',
  use3: 'Organising tournaments (scheduling, refereeing, operational communications).',
  use4: "Occasional updates about Women's Cup events (no commercial solicitation).",
  right1: 'The right to access, correct and delete your personal data.',
  right2: 'The right to object to and restrict processing where applicable.',
  right3: 'The right to portability of the data you provide, on request.',
  right4: 'The right to lodge a complaint with the CNIL if needed.',
  rightsHelpBefore: 'Exercise your rights by writing to ',
  rightsHelpAfter:
    '. Data is kept only for as long as strictly necessary to organise the events.',
  cookiesTitle: 'Cookies & trackers',
  cookiesIntro:
    'In line with the GDPR and the ePrivacy directive, we tell you which cookies are used on this site and let you manage your preferences.',
  essentialTitle: 'Essential cookies',
  requiredBadge: 'Required',
  essentialDesc:
    'Required for the site to work: Supabase authentication, session management for the admin area, security. These cookies cannot be disabled.',
  functionalTitle: 'Functional cookies',
  functionalDesc:
    'Improve your experience by remembering your preferences (theme, language, etc.). Subject to your consent.',
  analyticsTitle: 'Analytics cookies',
  analyticsDesc:
    'Help us understand how you use the site so we can improve it: pages visited, where your visit came from, and the steps of the sign-up journey. Subject to your consent — no measurement happens until you accept it. The analytics we use is anonymous, with no advertising cookie and no profiling.',
  marketingTitle: 'Marketing cookies',
  marketingDescBefore: 'Used to display relevant ads. Subject to your consent.',
  marketingDescStrong: 'No marketing cookie is used',
  marketingDescAfter: ' on this site.',
  cookiesPrefsNote:
    'Your preferences are stored locally in your browser and can be changed at any time.',
  ipEyebrow: 'Intellectual property',
  ipTitle: 'Content & credits',
  ipDesc:
    "Text, visuals, graphic identity and the Women's Cup logo belong to the association or are used with the permission of their owners.",
  ip1: 'Any reproduction or distribution of the content is allowed only for non-commercial use with a credit to the source.',
  ip2: 'Overwatch and Blizzard trademarks and assets remain the exclusive property of their respective owners.',
  ip3Before:
    'For any request to use content (partnership, press, media), write to ',
};
