// lib/i18n/locales/en/espaceCapitaine.ts
//
// Traductions ANGLAISES du namespace `espaceCapitaine`.
//
// La SOURCE DE VERITE est le francais (`../fr/espaceCapitaine.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  heroBadge: 'Captain hub',
  heroKicker: 'Team management',
  heroTitle: 'Run your team from a single dashboard',
  heroDescription:
    'Roster, recruitment, scrims, messaging, transfers: everything you need to lead your team without juggling Discord, spreadsheets and DMs.',
  heroCtaSpace: 'Go to my hub ↗',
  heroCtaGuide: 'Follow the step-by-step guide ↗',
  heroCtaRegister: 'Register my team',
  heroCtaFeatures: 'See the features',
  heroCtaFaq: 'FAQ',
  forWhoKicker: 'Who is it for?',
  forWhoTitle: 'Built for team captains',
  forWhoDescription:
    'The captain hub unlocks as soon as you become captain of a team registered for a tournament. If you don’t have a team yet, start by creating one — the captain is the person who registers the roster.',
  forWhoItems: [
    'You created your account on the site (email or Discord).',
    'You registered a team for the current tournament.',
    'You are set as the roster captain (by default, the creator).',
    'You are on the official Discord to receive pings.',
  ],
  featuresKicker: 'Features',
  featuresTitle: 'Everything you can do',
  featuresDescription:
    'Every tool is one click away from the captain dashboard, without ever leaving the platform.',
  features: [
    {
      icon: 'roster',
      title: 'Manage the roster',
      description:
        'Add or remove players, change their role (Tank, DPS, Support, substitute, coach) and hand over the captain armband in one click.',
    },
    {
      icon: 'door',
      title: 'Open or close recruitment',
      description:
        'Switch to "open" mode to receive applications, or close the team during matches to keep the roster stable.',
    },
    {
      icon: 'inbox',
      title: 'Review join requests',
      description:
        'Receive requests from players who want to join, read their message, accept or decline — all from the same screen.',
    },
    {
      icon: 'swords',
      title: 'Set up scrims',
      description:
        'Launch or accept friendly matches between teams to practice before official games.',
    },
    {
      icon: 'chat',
      title: 'Captain messaging',
      description:
        'Chat in real time with other captains to settle schedules, lobbies or house rules without leaving the site.',
    },
    {
      icon: 'transfer',
      title: 'Manage transfers',
      description:
        'Offer a transfer to another team or receive the ones sent to you, with staff approval.',
    },
    {
      icon: 'eye',
      title: 'Public team page',
      description:
        'Enjoy a showcase page for your team (logo, roster, track record) to share on social media and with sponsors.',
    },
  ],
  guideKicker: 'How does it work?',
  guideTitle: 'The step-by-step guide, screen by screen',
  guideDescription:
    'Want to see exactly how it works? The guide walks through every step (registration, applications, roster, messaging, scrims, check-in) with real previews of the captain dashboard.',
  guideCta: 'Follow the step-by-step guide',
  ctaKicker: 'Ready to take the lead?',
  ctaTitle: 'Open your captain dashboard',
  ctaDescription:
    'If you already have a team, the hub is available right after you log in.',
  ctaButton: 'Go to my hub ↗',
  faqKicker: 'Frequently asked questions',
  faqTitle: 'Captain FAQ',
  faqs: [
    {
      question: 'Who can become a captain?',
      answer:
        'Any player who creates a team through the registration form becomes its captain. If you joined a team without being the captain, you can then request the role from your player hub — the current captain or the staff approves the handover.',
    },
    {
      question: 'How many captains per team?',
      answer:
        'Only one official captain at a time. They receive match check-ins, staff notifications and messages from other teams. The handover can be done at any time from the dashboard.',
    },
    {
      question:
        'What happens if I don’t respond in time to a scrim or a check-in?',
      answer:
        'Match check-ins have a strict window (~1h before kickoff) — without validation, the team is declared a forfeit. Scrims carry no penalty, but a quick refusal helps the community get organized.',
    },
    {
      question: 'Can I manage several teams?',
      answer:
        'No, a player can only be captain of one team at a time. It’s a safeguard to avoid schedule conflicts and guarantee the captain’s availability during tournament phases.',
    },
    {
      question: 'What happens if I leave my team?',
      answer:
        'If you’re not the captain, you can leave freely (the captain and the staff are notified). If you’re the captain, hand the armband to another member first, otherwise the staff will ask you to do so before approving your departure.',
    },
  ],
  helpKicker: 'Need help?',
  helpTitle: 'The staff answers on Discord',
  helpDescription:
    'A question about a captaincy handover, a BattleTag to fix, a blocked transfer? The staff supports you on Discord and by email.',
  helpDiscord: 'Discord ↗',
  helpContact: 'Contact form',
  helpGuide: 'Registration guide',
  seoTitle: 'Captain hub — manage your team',
  seoDescription:
    "An overview of the OW Women's Cup captain hub: roster, recruiting, scrims, messaging and transfers to run your team throughout the tournament.",
};
