// lib/i18n/locales/en/freePlayers.ts
//
// Traductions ANGLAISES du namespace `freePlayers`.
//
// La SOURCE DE VERITE est le francais (`../fr/freePlayers.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  title: 'Players looking for a team',
  description:
    'Discord members of the server without a team. Invite those who have linked their site account.',
  loading: 'Loading…',
  loadError: 'Failed to load players.',
  empty: 'No player is looking for a team right now.',
  invite: 'Invite',
  inviting: 'Inviting…',
  invited: 'Invited ✓',
  inviteError: 'Could not send the invitation.',
  alreadyInvited: 'This player is already invited or in a team.',
  notLinkedBadge: 'Account not linked',
  notLinkedHint:
    'This player must link their site account before they can be invited.',
  noDiscordName: 'Unknown Discord name',
  anonymous: 'Player',
  contact: 'Contact',
};
