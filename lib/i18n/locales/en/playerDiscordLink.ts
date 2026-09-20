// lib/i18n/locales/en/playerDiscordLink.ts
//
// Traductions ANGLAISES du namespace `playerDiscordLink`.
//
// La SOURCE DE VERITE est le francais (`../fr/playerDiscordLink.ts`) : toute
// cle ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans
// quoi le garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  title: 'My Discord account',

  linkedAs: 'Linked to **{username}** on Discord.',
  linkedNote:
    'This link is what lets the bot grant your team role and send you direct messages. If you have several accounts on the site, it must sit on the one listed in your team roster.',
  unlink: 'Unlink this Discord account',
  unlinkConfirmTitle: 'Unlink your Discord account?',
  unlinkConfirmBody:
    'The bot will no longer be able to grant your team role or message you until a Discord account is linked again. You can redo this at any time.',

  notLinked: 'No Discord account is linked to this account.',
  whyNote:
    'Without this link the bot cannot grant your team role — it even removes it automatically every 30 minutes. If you signed up twice, once by email and once through Discord, this is where you fix it.',
  linkCta: 'Link my Discord',
  attachIdentityCta: 'Go through Discord',

  heldByOther:
    'Your Discord account is already linked to another account on the site ({email}).',
  heldByOtherNote:
    'This is most likely your second account: many players signed up once by email and once through Discord. Taking the link over moves it here, onto the account listed in the roster. The other account stays untouched.',
  anotherAccount: 'another account',
  transferCta: 'Move the link to this account',

  toastLinked: 'Discord account linked.',
  toastTransferred: 'Discord link moved to this account.',
  toastUnlinked: 'Discord account unlinked.',
  toastError: 'That action is not possible right now.',
  errorIdentityLinking:
    'Could not open the Discord sign-in. If it keeps failing, tell the staff: the link can be fixed for you.',
};
