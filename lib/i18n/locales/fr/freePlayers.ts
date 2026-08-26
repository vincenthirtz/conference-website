// lib/i18n/locales/fr/freePlayers.ts
//
// Traductions FRANCAISES du namespace `freePlayers` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('freePlayers', {
  title: 'Joueurs cherchant une équipe',
  description:
    'Membres Discord du serveur sans équipe. Invite ceux qui ont lié leur compte du site.',
  loading: 'Chargement…',
  loadError: 'Erreur de chargement des joueurs.',
  empty: "Aucun joueur ne cherche d'équipe pour le moment.",
  // Lot 1 : inscriptions web (sans compte) — pas d'invitation en un clic,
  // mais un mailto pour amorcer le contact.
  contact: 'Contacter',
  invite: 'Inviter',
  inviting: 'Invitation…',
  invited: 'Invité ✓',
  inviteError: "Impossible d'envoyer l'invitation.",
  alreadyInvited: "Ce joueur est déjà invité ou membre d'une équipe.",
  notLinkedBadge: 'Compte non lié',
  notLinkedHint:
    'Ce joueur doit lier son compte du site avant de pouvoir être invité.',
  noDiscordName: 'Pseudo Discord inconnu',
  anonymous: 'Joueur',
});
