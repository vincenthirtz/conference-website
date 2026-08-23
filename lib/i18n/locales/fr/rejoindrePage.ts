// lib/i18n/locales/fr/rejoindrePage.ts
//
// Traductions FRANCAISES du namespace `rejoindrePage` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.
//
// Page /rejoindre — le parcours « je joue seule » (lot 1 du backlog
// d'acquisition). Ton volontairement rassurant : la joueuse visée est celle qui
// hesite, pas celle qui a deja une equipe.

import { ns } from '../../ns';

export default ns('rejoindrePage', {
  // --- Hero ---------------------------------------------------------------
  heroBadge: 'Sans équipe ?',
  heroTitle: 'On te trouve un roster',
  heroSubtitle:
    "Pas besoin d'arriver avec cinq copines. Signale-toi ici : les capitaines qui recrutent voient ta fiche et te contactent.",
  heroNoAccount: 'Aucun compte requis',
  heroNoRank: 'Aucun rang minimum',
  heroFree: 'Gratuit',

  // --- Comment ça marche ---------------------------------------------------
  howTitle: 'Comment ça marche',
  how1Title: 'Tu remplis ta fiche',
  how1Desc:
    'Pseudo, postes que tu joues, tes disponibilités. Deux minutes, sans créer de compte.',
  how2Title: 'Les capitaines te voient',
  how2Desc:
    'Ta fiche apparaît dans la liste ci-dessous et dans l’espace des équipes qui recrutent.',
  how3Title: 'On te contacte',
  how3Desc:
    'Une capitaine intéressée t’écrit. Tu crées ton compte à ce moment-là, pas avant.',

  // --- Formulaire ----------------------------------------------------------
  formTitle: 'Signale-toi',
  formSubtitle: 'Ta fiche reste visible 60 jours, puis expire toute seule.',
  nameLabel: 'Pseudo',
  namePlaceholder: 'Le nom sous lequel on te connaît',
  rolesLabel: 'Tu joues quoi ?',
  rolesHint: 'Plusieurs choix possibles.',
  roleTank: 'Tank',
  roleDps: 'DPS',
  roleSupport: 'Support',
  roleFlex: 'Flex',
  levelLabel: 'Ton niveau, approximativement',
  levelUnknown: 'Je ne sais pas / je débute',
  levelBronze: 'Bronze',
  levelSilver: 'Argent',
  levelGold: 'Or',
  levelPlatinum: 'Platine',
  levelDiamond: 'Diamant',
  levelMaster: 'Maître',
  levelGrandmaster: 'Grand maître',
  levelChampion: 'Champion',
  levelHint:
    "Il n'y a aucun rang minimum pour jouer. Ça sert juste à te proposer des équipes de ton niveau.",
  availabilityLabel: 'Tes disponibilités',
  availabilityPlaceholder: 'Ex : en semaine après 20 h, et le dimanche après-midi',
  noteLabel: 'Un mot sur toi',
  notePlaceholder:
    'Ce que tu cherches, tes héros préférés, si tu débutes… (facultatif)',
  emailLabel: 'Ton email',
  emailHint:
    "Il sert uniquement à te mettre en relation. Il n'apparaît jamais publiquement.",
  emailPlaceholder: 'ton@email.com',
  discordLabel: 'Ton pseudo Discord',
  discordPlaceholder: 'pseudo (facultatif)',
  captchaLabel: 'Anti-bot — combien font {question} ?',
  captchaPlaceholder: 'Réponds par un nombre',
  honeypotLabel: 'Ne pas remplir',
  submit: 'Publier ma fiche',
  submitting: 'Envoi…',
  successTitle: 'C’est publié !',
  successBody:
    'Ta fiche est en ligne. Les capitaines qui recrutent peuvent te contacter à partir de maintenant.',
  successAgain: 'Modifier ma fiche',
  privacyNote:
    'Ton email et ton pseudo Discord ne sont visibles que par les capitaines connectées. Ta fiche expire au bout de 60 jours.',

  // --- Erreurs -------------------------------------------------------------
  errorName: 'Indique un pseudo (2 caractères minimum).',
  errorEmail: 'Merci de saisir une adresse email valide.',
  errorRoles: 'Choisis au moins un poste.',
  errorGeneric: "L'envoi a échoué. Réessaie dans un instant.",

  // --- Liste publique ------------------------------------------------------
  listTitle: 'Elles cherchent une équipe',
  listSubtitle: 'Mise à jour en continu.',
  listEmpty:
    'Personne pour le moment — sois la première, ta fiche sera en haut de la liste.',
  listError: 'La liste n’a pas pu être chargée.',
  listRetry: 'Réessayer',
  listCount: '{count} joueuse(s) en recherche',
  listSince: 'Depuis le {date}',
  listNoContact:
    'Les coordonnées ne sont pas publiques : seules les capitaines connectées peuvent contacter une joueuse.',
  filterAll: 'Tous les postes',

  // --- Renvois -------------------------------------------------------------
  altTitle: 'Tu as déjà une équipe ?',
  altDesc: 'Inscris-la directement au tournoi.',
  altCta: 'Créer mon équipe',
  discordTitle: 'Tu préfères Discord ?',
  discordDesc:
    'Le serveur reste ouvert : prends le rôle « Recherche une équipe » et tu apparaîtras aussi dans cette liste.',
  discordCta: 'Rejoindre le Discord',
});
