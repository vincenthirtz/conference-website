// lib/i18n/locales/admin-en/adminTwitchChannelsNew.ts
//
// Traductions ANGLAISES du namespace admin `adminTwitchChannelsNew`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTwitchChannelsNew.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – New Twitch channel',
  back: 'Back to list',
  heading: 'Add a Twitch channel',
  subtitle: 'Set up a new partner channel for the homepage',
  channelLabel: 'Twitch channel name',
  channelHint: 'The handle in the twitch.tv/ URL',
  labelLabel: 'Display label',
  badgeLabel: 'Badge',
  badgePlaceholder: 'e.g. Cast, Player, Coach...',
  sortOrderLabel: 'Display order',
  sortOrderPlaceholder: 'Auto (last)',
  avatarLabel: 'Avatar URL',
  avatarHint: 'Twitch profile image URL (150x150 recommended)',
  descriptionLabel: 'Description',
  descriptionPlaceholder: 'Describe the channel in a few words...',
  activeLabel: 'Active channel (visible on the homepage)',
  cancel: 'Cancel',
  creating: 'Creating...',
  submit: 'Create channel',
  errorRequired: 'The channel name and label are required.',
  errorGeneric: 'Unexpected error.',
};
