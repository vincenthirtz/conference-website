// lib/i18n/locales/en/networkOnboarding.ts
//
// Traductions ANGLAISES du namespace `networkOnboarding`.
//
// La SOURCE DE VERITE est le francais (`../fr/networkOnboarding.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  title: 'Exist in the network',
  subtitle:
    'Three links drive almost everything: notifications, team channels, rankings and matchmaking.',
  dismiss: 'Hide this reminder',
  stepDiscordTitle: 'Link your Discord account',
  stepDiscordWhy:
    'Without it the bot cannot grant your roles, open your team channels, or notify you.',
  stepDiscordCta: 'Link',
  stepBattleTagTitle: 'Verify your BattleTag',
  stepBattleTagWhy:
    'A verified roster is credible to other teams, and it is what lets you count in the rankings.',
  stepBattleTagCta: 'Verify',
  stepDiscoveryTitle: 'Make yourself discoverable',
  stepDiscoveryWhy:
    'Visible behind login only, never indexed: recruiting teams can find you. Reversible at any time.',
  stepDiscoveryCta: 'Enable',
};
