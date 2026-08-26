// lib/i18n/locales/en/rulesPage.ts
//
// Traductions ANGLAISES du namespace `rulesPage`.
//
// La SOURCE DE VERITE est le francais (`../fr/rulesPage.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  heroBadge: 'Official rules',
  heroTitle: 'Official Overwatch rules',
  heroSubtitle:
    "A summary of the competitive Overwatch settings used for the OW Women's Cup. The whole event is built on Blizzard's official rules, adapted to the tournament format.",
  section1Title: 'Composition & restrictions',
  section1Item1: '5v5 required: 1 Tank, 2 Damage, 2 Support (Role Queue).',
  section1Item2: 'Unique heroes: no duplicates allowed within the same team.',
  section1Item3:
    'Current patch: every game is played on the latest live version of Overwatch (no rollbacks).',
  section1Item4: 'Workshop items, mods, macros and scripts are forbidden.',
  section2Title: 'Official lobby settings',
  section2Item1: 'Preset: Competitive rules.',
  section2Item2: 'Score capped per mode (e.g. Control in BO3).',
  section2Item3: 'Setup time 45 s (start) / 35 s (halftime).',
  section2Item4:
    'Technical pause: only for a bug or disconnection, max 5 min per team.',
  section3Title: 'Fair play & conduct',
  section3Item1: 'No exploits, stream sniping or account sharing.',
  section3Item2:
    'Voice and text chat are subject to the Blizzard Code of Conduct.',
  section3Item3:
    'Dispute resolution: final decision by the tournament referees.',
  section3Item4:
    'Joining the tournament Discord is mandatory: https://discord.gg/gERSsjC3Vd',
  modesEyebrow: 'Game modes',
  modesTitle: 'Win conditions by mode',
  modesNote: 'Applies with the « Competitive rules » preset in custom games.',
  mode1Name: 'Control',
  mode1Rules:
    'BO3 across three control points. If 1-1, a decider is played. Overtime if a team contests or is about to capture.',
  mode2Name: 'Hybrid (Assault/Escort)',
  mode2Rules:
    'Att/Def: capture point A then escort the payload. Best progression wins; overtime if progression is contested.',
  mode3Name: 'Escort',
  mode3Rules:
    'Att/Def: pure payload escort to the final point. If tied after both rounds, play resumes with a time bank; the greater distance breaks the tie.',
  mode4Name: 'Flashpoint',
  mode4Rules:
    'Successive capture points, first to 2 points. Overtime if a point is contested. Ultimates reset on each capture.',
  mode5Name: 'Push',
  mode5Rules:
    "Winning team: the furthest distance pushed. Overtime if the robot is contested or close to the opponent's marker.",
  referencesEyebrow: 'Official references',
  referencesTitle: 'Blizzard sources',
  referencesNote:
    'Check the official documents for updates to rules, maps or patches.',
  ref1Label: 'Blizzard Code of Conduct',
  ref2Label: 'Overwatch patch notes (live patch)',
  ref3Label: '« Competitive rules » settings (official guide)',
};
