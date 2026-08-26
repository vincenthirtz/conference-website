// lib/i18n/locales/en/teamHealth.ts
//
// Traductions ANGLAISES du namespace `teamHealth`.
//
// La SOURCE DE VERITE est le francais (`../fr/teamHealth.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  title: 'Team health',
  subtitle:
    'What stops you from playing, from being found, or from improving. Nothing declarative: all of it derives from your own data.',
  blockingCount: '{count} blocking',
  fixCta: 'Fix',
  noCaptain: 'No captain assigned',
  whyNoCaptain:
    'Without a captain, nobody can accept a scrim, register the team or report a score.',
  rosterShortfall: '{count} starter(s) missing out of {required}',
  whyRosterShortfallTournament:
    'Below the line-up the tournament requires, the team cannot be seeded.',
  whyRosterShortfallLineup:
    "Below the game's line-up size, the team can field neither a match nor a scrim.",
  missingBattleTag: '{count} member(s) without a BattleTag',
  whyMissingBattleTag:
    'Without a BattleTag they cannot be identified in game, nor counted in the rating.',
  unverifiedBattleTag: '{count} unverified BattleTag(s)',
  whyUnverifiedBattleTag:
    'A verified roster is credible to other teams and settles identity disputes upfront.',
  discordUnlinked: '{count} member(s) without a linked Discord account',
  whyDiscordUnlinked:
    'They will get no role, no team channels, and no call-up before a match.',
  neverLoggedIn: '{count} account(s) never used',
  whyNeverLoggedIn:
    'These people were added but never signed in: nothing will reach them.',
  noRhythm: '{count} member(s) have not declared their slots',
  whyNoRhythm:
    'While people are missing, the core slots are wrong — and so is any listing built from them.',
  invisibleForScrims: 'Unfindable for a scrim',
  whyInvisibleForScrims:
    'With no live listing and no recurring slots, no team can offer you a game.',
  unreviewedEncounters: '{count} encounter(s) never reviewed',
  whyUnreviewedEncounters:
    'What you learned is lost unless someone writes it down while it is still fresh.',
};
