// lib/i18n/locales/admin-en/adminQuickBracket.ts
//
// Traductions ANGLAISES du namespace admin `adminQuickBracket`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminQuickBracket.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – Quick bracket',
  heading: 'Quick bracket',
  description:
    'Spin up a playable bracket in 30 seconds: a name, a format, and your list of participants.',
  breadcrumbTournaments: 'Tournaments',
  nameLabel: 'Tournament name',
  namePlaceholder: 'e.g. Friday Night Cup',
  formatLabel: 'Format',
  formatSingleElim: 'Single elimination',
  formatDoubleElim: 'Double elimination',
  participantsLabel: 'Participants',
  participantsPlaceholder: 'one name per line\nTeam Alpha\nTeam Bravo\n…',
  participantsHint: 'One name per line (or comma-separated).',
  participantCount_one: '{n} participant',
  participantCount_other: '{n} participants',
  bracketSizeHint: '{size}-slot bracket',
  bracketByes_one: '{count} bye',
  bracketByes_other: '{count} byes',
  boLabel: 'Match format',
  boBo1: 'BO1 (1 map)',
  boBo3: 'BO3 (3 maps)',
  boBo5: 'BO5 (5 maps)',
  submit: 'Generate bracket',
  submitting: 'Generating…',
  successToast: 'Bracket created',
  errorMinParticipants: 'Add at least 2 participants.',
  errorMaxParticipants: '32 participants maximum.',
  errorDuplicates: 'Duplicate participants: {names}.',
  errorGeneric: 'Failed to create the bracket.',
  helperBlurb:
    'Quick, casual bracket: each participant becomes a shell team (no roster, no Discord). You can upgrade it later (rosters, Discord, cast) from the normal tournament admin.',
  navCta: 'Quick bracket ⚡',
};
