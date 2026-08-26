// lib/i18n/locales/en/jeuxPage.ts
//
// Traductions ANGLAISES du namespace `jeuxPage`.
//
// La SOURCE DE VERITE est le francais (`../fr/jeuxPage.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  overwatchTagline: 'The title that founded the community.',
  overwatchPitch:
    "Blizzard's hero shooter has been the heart of the OW Women's Cup since 2025. Full map veto, a 29-map pool and BO1/3/5 formats for the playoffs.",
  valorantTagline: 'Tactical 5v5 on the FPS scene.',
  valorantPitch:
    "Riot's tactical shooter plugs into our tournament stack with its competitive pool (Ascent, Bind, Lotus, Sunset…) and a veto based on the VCT ruleset.",
  cs2Tagline: 'The 5v5 shooting legend.',
  cs2Pitch:
    'Counter-Strike 2 uses the ESL / Major veto sequences (ban-ban-pick-pick-ban-ban-decider) on the official active-duty maps.',
  r6Tagline: 'Tactical 5v5 siege, destruction & gadgets.',
  r6Pitch:
    'Rainbow Six Siege joins the lineup with its full ranked pool (Bank, Clubhouse, Kafe, Nighthaven Labs…) and a veto tuned to esports rules.',
  marvelTagline: '6v6 Marvel hero shooter.',
  marvelPitch:
    'Marvel Rivals features Domination, Convoy and Convergence across an 11-map pool: BO1/3/5 tournaments with a veto to rule out home-turf maps.',
  rocketTagline: 'Rocket cars, 3v3, motorsport chaos.',
  rocketPitch:
    'Rocket League skips the veto (fixed arena) but runs long BO3/5/7 formats for the playoffs: the tournament stack handles the match directly, no veto needed.',
  lolTagline: 'Riot MOBA, Tournament Draft.',
  lolPitch:
    'League of Legends uses the official Tournament Draft: 10 bans + 10 picks split across two phases. The bot runs the draft on Discord and pushes it to the live UI.',
  dota2Tagline: 'Valve MOBA, Captains Mode.',
  dota2Pitch:
    'Dota 2 uses Captains Mode (patch 7.34+): 9 bans + 10 picks across three phases, handled end to end by our multi-game draft engine.',
  fallbackPitch:
    'Game supported by the multi-game tournament stack: automated registration, bracket, scoring and Discord match threads.',
  mapVeto: 'Map veto',
  draft: 'Draft',
  mapsCount: '{count} maps',
  mapFixed: 'Fixed map',
  formats: 'Formats',
  badgeMulti: 'Multi-game',
  heroTitle: "The games powered by the Women's Cup system",
  heroSubtitlePart1:
    'Our tournament stack (bracket, veto, draft, Discord match threads) is now ',
  heroSubtitleStrong: 'multi-game',
  heroSubtitlePart2:
    '. {count} titles are supported natively: pick your game, your format, and fire it up.',
  ctaRegisterTeam: 'Register my team',
  ctaViewTournaments: 'Browse tournaments',
  statsHeading: 'By the numbers',
  statGamesLabel: 'supported games',
  statGamesSub: 'FPS, MOBA, motorsport',
  statMapsLabel: 'total maps',
  statMapsSub: 'across every pool',
  statVetoLabel: 'games with veto',
  statVetoSub: 'auto ESL / VCT sequences',
  statDraftLabel: 'games with draft',
  statDraftSub: 'LoL & Dota 2',
  statFormatsLabel: 'formats',
  statFormatsSub: 'BO1 → BO7 depending on the game',
  catalogueEyebrow: 'Catalogue',
  catalogueTitle: '{count} games supported',
  catalogueDesc:
    'For every title we handle registrations, vetos / drafts, scores and broadcasting on Discord. No external tool required.',
  compareEyebrow: 'Comparison',
  compareTitle: 'Everything on one grid',
  compareDesc:
    'Tournament-engine capabilities per game. Handy to pick your format or compare two titles at a glance.',
  tableGame: 'Game',
  tableMapVeto: 'Map veto',
  tableDraft: 'Draft',
  tableMaps: 'Maps',
  tableFormats: 'Formats',
  tableYes: '✓ Yes',
  howEyebrow: 'Pipeline',
  howTitle: 'How it works',
  howDesc:
    'The same stack for every game: zero friction for teams, zero copy-paste for staff.',
  stepLabel: 'Step {n}',
  step1Title: 'Register your team',
  step1Detail:
    'Create your team, pick your game and your format. The platform checks the roster and slots you into the bracket as soon as registration opens.',
  step2Title: 'Automated veto / draft',
  step2Detail:
    'Before every match, the tool runs the veto or draft (depending on the game) with a timer, automatic turn order and full history. No staff needed.',
  step3Title: 'Live Discord match thread',
  step3Detail:
    'The bot opens a dedicated thread, posts the scoreboard, records the scores and closes the match. Casters and viewers follow along live.',
  botEyebrow: 'Discord',
  botTitle: 'The Discord bot, your cockpit',
  botDesc:
    'Everything runs through slash commands: registration, match, veto, draft, score, dispute. One interface, identical across every game.',
  scopeUniversal: 'Universal',
  scope5Games: '5 games',
  scopeLolDota: 'LoL & Dota 2',
  cap1Title: 'Tournaments & teams',
  cap1Detail:
    'Creation, publishing, registrations, roster management. The /tournoi creer command lets you pick from all 8 games.',
  cap2Title: 'Live match',
  cap2Detail:
    'The bot opens a Discord thread per match, tracks check-in, collects the scores and automatically pushes the win through the bracket.',
  cap3Title: 'Map veto',
  cap3Detail:
    'Automated veto in DMs with the captains: turn order, timer, game-specific ESL/VCT sequences. No manual input from staff.',
  cap4Title: 'MOBA draft',
  cap4Detail:
    'Tournament Draft (LoL) and Captains Mode (Dota 2) handled end to end: bans, picks, fearless draft, server timer and a live spectator UI.',
  cap5Title: 'Cast & live',
  cap5Detail:
    'Caster coordination, match-to-cast assignments, multi-channel announcements and Twitch stream relays.',
  cap6Title: 'Scrims & practice',
  cap6Detail:
    'Public scrim creation, opponent finding, dedicated thread and automatic reminders. Works for every game in the registry.',
  cap7Title: 'Disputes & refereeing',
  cap7Detail:
    'Dedicated dispute forum, tracked by the refereeing staff with notifications to captains at every update.',
  cap8Title: 'Stats & standings',
  cap8Detail:
    'Live tournament standings, stats aggregated per team and player, match history with veto/draft replays.',
  cap9Title: 'Help & support',
  cap9Detail:
    'Context-aware help per command, an /aide-tournoi channel for staff and bot registration on other servers.',
  multiTenantLabel: 'Multi-tenant:',
  multiTenantBody:
    ' the bot can run on several Discord servers with full isolation of tournaments, teams and stats. Handy if another org wants the same stack.',
  inviteBotCta: 'Invite the bot to my server',
  faqEyebrow: 'FAQ',
  faqTitle: 'The questions we get asked',
  faqIntroBefore: 'Another question? The ',
  faqIntroAfter: ' channel on Discord is open to every captain.',
  faq1Question: "My favourite game isn't on the list — can you add it?",
  faq1Answer:
    "Yes — the stack is built for it. Adding a game means declaring its registry (map pool or draft flow, supported formats) and updating the /tournoi creer command. Expect one to two weeks depending on complexity. Start a conversation via the Contact page and we'll talk it through.",
  faq2Question: 'How exactly does the map veto work?',
  faq2Answer:
    "The bot DMs both captains as soon as the match is ready. Each captain bans or picks in turn following the game's sequence (ESL/Major for CS2, VCT for Valorant, etc.), on a server-side timer. The sequence is replayed in the Discord thread and stored in the match history.",
  faq3Question: 'Why do only LoL and Dota 2 have a hero draft?',
  faq3Answer:
    "Because those two games have a real, formalised draft phase (Tournament Draft for LoL, Captains Mode for Dota 2) where bans and picks alternate. Hero shooters like Overwatch or Marvel Rivals allow free hero swapping mid-game: there's nothing to draft before the match.",
  faq4Question: 'Can the bot run on other Discord servers?',
  faq4Answer:
    'Yes. The bot is multi-tenant: you can invite it to any server. Each server has its own tournaments, teams and stats, isolated by a tenant identifier. The “Invite the bot to my server” button above kicks off the self-service flow.',
  faq5Question: 'Which format should I pick for my tournament?',
  faq5Answer:
    'BO1 = single game (fast, ideal for group stages). BO3 = competitive standard, first to two maps out of three. BO5 = grand finals. BO7 = Rocket League only (motorsport, short games). You can mix formats: for example BO1 in groups and BO3 in the bracket.',
  faq6Question: 'How much does it cost to use the system?',
  faq6Answer:
    "Nothing. The stack is open and the OW Women's Cup association maintains it as a community tool. You can join our tournaments, or invite the bot to your own server if you run your own — either way there's no licence fee.",
  faq7Question: 'Can I follow matches live without installing the bot?',
  faq7Answer:
    'Yes: every public match is viewable on this site (bracket, scores, veto and draft replays) and Twitch casts are relayed on the Live page. The bot is a tool for players and staff, not a requirement for the audience.',
  ctaEyebrow: 'Suggestion',
  ctaTitle: 'Want us to add your game?',
  ctaDesc:
    "The stack is built to welcome new titles. If your game's women's scene deserves a tournament as well-equipped as ours, tell us — we'll look into it together.",
  ctaContact: 'Contact us',
  ctaBecomePartner: 'Become a partner',
};
