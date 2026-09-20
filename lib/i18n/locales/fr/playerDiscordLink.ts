// lib/i18n/locales/fr/playerDiscordLink.ts
//
// Traductions FRANCAISES du namespace `playerDiscordLink` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/playerDiscordLink.ts`. Toute cle ajoutee
// ici doit l'etre aussi cote anglais : le garde-fou de compilation
// `../parity.ts` casse le typecheck sinon.
//
// TON DE CETTE SECTION. Le probleme qu'elle resout est vecu comme « je perds
// mon role sans arret » : les textes partent donc du SYMPTOME, pas du modele
// de donnees. On ne parle ni de `user_discord_links`, ni de contrainte
// d'unicite — on dit « ton Discord est rattache a ton autre compte », ce qui
// est la meme chose et se comprend.

import { ns } from '../../ns';

export default ns('playerDiscordLink', {
  title: 'Mon compte Discord',

  linkedAs: 'Rattaché à **{username}** sur Discord.',
  linkedNote:
    'C’est ce lien qui permet au bot de te donner ton rôle d’équipe et de t’écrire en message privé. Si tu as plusieurs comptes sur le site, il doit être posé sur celui qui figure au roster de ton équipe.',
  unlink: 'Délier ce compte Discord',
  unlinkConfirmTitle: 'Délier ton compte Discord ?',
  unlinkConfirmBody:
    'Le bot ne pourra plus te donner ton rôle d’équipe ni t’écrire tant que tu n’auras pas rattaché un compte Discord. Tu peux le refaire à tout moment.',

  notLinked: 'Aucun compte Discord n’est rattaché à ce compte.',
  whyNote:
    'Sans ce lien, le bot ne peut pas te donner ton rôle d’équipe : il le retire même automatiquement toutes les 30 minutes. Si tu t’es inscrite deux fois — une fois par e-mail, une fois par Discord — c’est ici que ça se répare.',
  linkCta: 'Rattacher mon Discord',
  attachIdentityCta: 'Passer par Discord',

  heldByOther:
    'Ton compte Discord est déjà rattaché à un autre compte du site ({email}).',
  heldByOtherNote:
    'C’est très probablement ton second compte : beaucoup de joueuses se sont inscrites une fois par e-mail et une fois par Discord. Reprendre le lien le déplacera ici, sur le compte qui figure au roster. L’autre compte restera intact.',
  anotherAccount: 'un autre compte',
  transferCta: 'Reprendre le lien sur ce compte',

  toastLinked: 'Compte Discord rattaché.',
  toastTransferred: 'Lien Discord repris sur ce compte.',
  toastUnlinked: 'Compte Discord délié.',
  toastError: 'Action impossible pour le moment.',
  errorIdentityLinking:
    'Impossible d’ouvrir la connexion Discord. Si le problème persiste, préviens le staff : le lien peut être corrigé pour toi.',
});
