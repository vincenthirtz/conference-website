// lib/i18n/locales/fr/playerTwitchLink.ts
//
// Traductions FRANCAISES du namespace `playerTwitchLink` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/playerTwitchLink.ts`. Toute cle ajoutee ici
// doit l'etre aussi cote anglais : le garde-fou de compilation `../parity.ts`
// casse le typecheck sinon.
//
// TON DE CETTE SECTION. Rattacher son compte Twitch donne acces a une
// recompense : il faut donc dire pourquoi c'est demande, ce qui est lu (le
// pseudo, rien d'autre), et que ca se defait en un clic. Une joueuse qui ne
// veut pas lier son compte ne perd rien d'autre que les drops en direct, et le
// texte le dit plutot que de la laisser croire a une obligation.

import { ns } from '../../ns';

export default ns('playerTwitchLink', {
  title: 'Mon compte Twitch',
  intro:
    'Rattache ton compte Twitch pour recevoir les cartes distribuées pendant les directs. C’est le seul moyen de savoir à qui donner une carte réclamée en live.',

  // Dit AVANT le bouton : ce qui est lu, et ce qui ne l'est pas.
  scopeNote:
    'On ne demande aucune permission sur ton compte : juste ton nom d’utilisateur. Aucun accès à ton chat, à tes abonnements ou à tes messages.',
  optionalNote:
    'C’est facultatif. Sans lien, tu gagnes des cartes normalement en jouant — seuls les drops en direct te passeront à côté.',

  linkedLabel: 'Compte lié',
  linkedAs: 'Lié à {login}',
  linkedSince: 'Depuis le {date}',
  notLinked: 'Aucun compte Twitch lié',

  linkCta: 'Rattacher mon compte Twitch',
  relinkCta: 'Changer de compte',
  unlinkCta: 'Délier',
  unlinking: 'Suppression…',

  toastLinked: 'Ton compte Twitch est rattaché ✅',
  toastUnlinked: 'Ton compte Twitch a été délié',
  toastAlreadyLinked:
    'Ce compte Twitch est déjà rattaché à un autre compte du site.',
  toastError: 'La liaison a échoué, réessaie.',
  loadError: 'Impossible de lire l’état de ton compte Twitch.',
});
