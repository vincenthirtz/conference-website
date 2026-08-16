// lib/i18n/locales/fr/discordLinkCard.ts
//
// Traductions FRANCAISES du namespace `discordLinkCard` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('discordLinkCard', {
  statusError: 'Impossible de charger le statut.',
  unlinkConfirm:
    'Délier ton compte Discord ? Tu ne recevras plus de DM de rappel.',
  linkError: 'Échec du lien Discord',
  unlinkError: 'Échec',
  title: 'Discord',
  linkedBadge: 'Lié',
  intro:
    'Lie ton compte Discord pour recevoir en DM les rappels de check-in et les notifications du tournoi.',
  loading: 'Chargement…',
  account: 'Compte',
  unknown: 'inconnu',
  unlink: 'Délier',
  link: 'Lier mon compte Discord',
  busy: '…',
  confirmUnlink: 'Confirmer',
  cancel: 'Annuler',
});
