// lib/i18n/locales/en/battlenetVerify.ts
//
// Traductions ANGLAISES du namespace `battlenetVerify`.
//
// La SOURCE DE VERITE est le francais (`../fr/battlenetVerify.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  title: 'Verify my BattleTag',
  why: 'Link your Battle.net account to prove this BattleTag is really yours. Your team gets a trust badge on its roster, and it protects the competition from smurfs.',
  onboardingTitle: 'One last step: verify your BattleTag',
  onboardingWhy:
    'Your team is created 🎉 Now link your Battle.net account: it proves the BattleTag on your roster is really yours, shows a trust badge on your public page and protects the tournament from smurfs.',
  onboardingHint: "Under 2 minutes, through Blizzard's official page.",
  verifyBtn: 'Verify my Battle.net account',
  later: 'Later',
  verifiedTitle: 'Battle.net account verified',
  verifiedProof:
    'This BattleTag really belongs to you: proof against impersonation and smurfing.',
  verifiedOn: 'Verified on {date}',
  toastVerified: 'Your BattleTag is verified ✅',
  toastLinked: 'Your Battle.net account is linked ✅',
  toastNoMatch:
    "Battle.net account linked, but it doesn't match any BattleTag on your rosters. Check that the tag entered in your team matches this account.",
  toastAlreadyLinked:
    'This Battle.net account is already linked to another player.',
  toastError: 'Verification failed, please try again.',
};
