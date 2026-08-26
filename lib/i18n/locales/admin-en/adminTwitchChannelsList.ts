// lib/i18n/locales/admin-en/adminTwitchChannelsList.ts
//
// Traductions ANGLAISES du namespace admin `adminTwitchChannelsList`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTwitchChannelsList.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – Twitch channels',
  heading: 'Partner Twitch channels',
  count_one: '{count} channel configured',
  count_other: '{count} channels configured',
  addButton: 'Add a channel',
  searchLabel: 'Search',
  searchPlaceholder: 'Name, channel or badge...',
  emptyFiltered: 'No channels found',
  emptyState: 'No channels configured',
  savingOrder: 'Saving order…',
  statusActive: 'Active',
  statusInactive: 'Inactive',
  order: 'Order',
  deactivate: 'Deactivate',
  activate: 'Activate',
  edit: 'Edit',
  delete: 'Delete',
  deleteConfirmTitle: 'Delete this channel?',
  errorReorder: 'Error while saving the order.',
  errorDelete: 'Delete error.',
  errorUpdate: 'Update error.',
};
