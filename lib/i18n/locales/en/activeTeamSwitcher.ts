// lib/i18n/locales/en/activeTeamSwitcher.ts
//
// Traductions ANGLAISES du namespace `activeTeamSwitcher`.
//
// La SOURCE DE VERITE est le francais (`../fr/activeTeamSwitcher.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  label: 'Team shown',
  hint: 'You run several teams: pick the one you want to act on.',
  captainBadge: 'Captain',
  managerBadge: 'Manager',
};
