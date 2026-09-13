// lib/i18n/locales/en/playerTwitchLink.ts
//
// Traductions ANGLAISES du namespace `playerTwitchLink`.
//
// La SOURCE DE VERITE est le francais (`../fr/playerTwitchLink.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont les
// valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  title: 'My Twitch account',
  intro:
    'Link your Twitch account to receive cards handed out during live streams. It is the only way to know who a card claimed on stream belongs to.',

  scopeNote:
    'We ask for no permissions on your account — only your username. No access to your chat, your subscriptions or your messages.',
  optionalNote:
    'This is optional. Without a link you still earn cards by playing; only live drops would pass you by.',

  linkedLabel: 'Account linked',
  linkedAs: 'Linked to {login}',
  linkedSince: 'Since {date}',
  notLinked: 'No Twitch account linked',

  linkCta: 'Link my Twitch account',
  relinkCta: 'Switch account',
  unlinkCta: 'Unlink',
  unlinking: 'Removing…',

  toastLinked: 'Your Twitch account is linked ✅',
  toastUnlinked: 'Your Twitch account has been unlinked',
  toastAlreadyLinked:
    'This Twitch account is already linked to another site account.',
  toastError: 'Linking failed, please try again.',
  loadError: 'Could not read your Twitch account status.',
};
