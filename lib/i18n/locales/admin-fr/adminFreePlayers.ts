// lib/i18n/locales/admin-fr/adminFreePlayers.ts
//
// Traductions FRANCAISES du namespace `adminFreePlayers` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminFreePlayers', {
  headTitle: 'Admin · Joueuses libres',
  eyebrow: 'Admin · Recrutement',
  heading: 'Joueuses libres',
  intro:
    'Les joueuses qui se sont signalées « sans équipe ». Deux provenances : le formulaire public /rejoindre et le rôle Discord « Recherche une équipe ».',
  loading: 'Chargement…',
  loadError: 'La liste n’a pas pu être chargée.',
  retry: 'Réessayer',
  empty: 'Aucune joueuse libre pour le moment.',
  count: '{count} fiche(s)',

  colName: 'Joueuse',
  colRoles: 'Postes',
  colLevel: 'Niveau',
  colAvailability: 'Disponibilités',
  colContact: 'Contact',
  colSource: 'Provenance',
  colSince: 'Depuis',
  colActions: '',

  sourceWeb: 'Site',
  sourceDiscord: 'Discord',
  noContact: '—',
  noName: 'Sans nom',

  remove: 'Retirer',
  removing: 'Retrait…',
  confirmTitle: 'Retirer cette fiche ?',
  confirmBody:
    'La fiche disparaîtra de la liste publique et de l’espace des capitaines.',
  confirmBodyDiscord:
    'Attention : cette fiche vient du rôle Discord. Le bot la repoussera à la prochaine synchronisation tant que la joueuse porte le rôle — pour un retrait durable, enlève-lui le rôle sur le serveur.',
  confirmCta: 'Retirer',
  cancel: 'Annuler',
  removed: 'Fiche retirée.',
  removedWillReturn:
    'Fiche retirée — elle reviendra à la prochaine synchro Discord tant que le rôle est porté.',
  removeError: 'Le retrait a échoué.',

  selfServiceNote:
    'Une joueuse inscrite depuis le site peut se retirer elle-même : le lien est dans l’email de confirmation qu’elle a reçu. Ce tableau sert aux demandes qui arrivent par un autre canal.',
});
