// lib/i18n/locales/fr/rejoindrePage.ts
//
// Traductions FRANCAISES du namespace `rejoindrePage` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
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
  levelEmerald: 'Émeraude',
  levelDiamond: 'Diamant',
  levelMaster: 'Maître',
  levelGrandmaster: 'Grand maître',
  levelChampion: 'Champion',
  levelHint:
    "Il n'y a aucun rang minimum pour jouer. Ça sert juste à te proposer des équipes de ton niveau.",
  availabilityLabel: 'Tes disponibilités',
  availabilityPlaceholder:
    'Ex : en semaine après 20 h, et le dimanche après-midi',
  noteLabel: 'Un mot sur toi',
  notePlaceholder:
    'Ce que tu cherches, tes héros préférés, si tu débutes… (facultatif)',
  emailLabel: 'Ton email',
  emailHint:
    "Il sert uniquement à te mettre en relation. Il n'apparaît jamais publiquement.",
  emailPlaceholder: 'ton@email.com',
  discordLabel: 'Ton pseudo Discord',
  discordPlaceholder: 'pseudo (facultatif)',
  discordHint:
    'Facultatif, mais utile : avec ton pseudo, une capitaine t’écrit directement en message privé au lieu d’attendre que tu ouvres tes emails.',
  captchaLabel: 'Anti-bot — combien font {question} ?',
  captchaPlaceholder: 'Réponds par un nombre',
  honeypotLabel: 'Ne pas remplir',
  submit: 'Publier ma fiche',
  submitting: 'Envoi…',
  successTitle: 'C’est publié !',
  successBody:
    "Ta fiche est en ligne, et l'email de confirmation qu'on vient de t'envoyer contient le lien pour la retirer quand tu veux. Une capitaine intéressée t'écrit par email — ou en message privé sur Discord si tu as renseigné ton pseudo.",
  successDiscordBody:
    'La suite se passe sur le serveur : prends le rôle « Recherche une équipe », regarde qui recrute, pose tes questions.',
  successDiscordCta: 'Rejoindre le Discord',
  successAgain: 'Modifier ma fiche',
  successCardBody:
    'Ta fiche expire dans 60 jours. Ta carte joueuse, elle, reste : elle te rend trouvable toute l’année par les autres joueuses, et tu peux la désactiver d’un clic.',
  successCardCta: 'Créer ma carte joueuse',
  listCardHint:
    'Ces fiches expirent au bout de 60 jours. Pour rester trouvable toute l’année, il y a la carte joueuse.',
  listCardCta: 'Voir le réseau des joueuses',
  mirrorCountOne: '{count} équipe recrute en ce moment.',
  mirrorCountMany: '{count} équipes recrutent en ce moment.',
  privacyNote:
    'Ton email et ton pseudo Discord ne sont visibles que par les capitaines connectées. Ta fiche expire au bout de 60 jours, et tu peux la retirer à tout moment depuis le lien envoyé par email.',

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

  // --- Retrait de fiche (/rejoindre/retrait) ------------------------------
  removeTitle: 'Retirer ma fiche',
  removeIntro:
    'Tu es sur le point de retirer ta fiche de la liste publique. Les capitaines ne pourront plus te voir ni te contacter.',
  removeFor: 'Fiche de {name}',
  removeConfirm: 'Oui, retirer ma fiche',
  removeWorking: 'Retrait en cours…',
  removeDoneTitle: 'C’est fait',
  removeDoneBody:
    'Ta fiche a été retirée. Tu peux te réinscrire quand tu veux, ça ne prend que deux minutes.',
  removeBackCta: 'Retour à la page',
  removeInvalidTitle: 'Ce lien n’est plus valide',
  removeInvalidBody:
    'Ta fiche a peut-être déjà été retirée, ou elle a expiré d’elle-même au bout de 60 jours. Si tu penses qu’il s’agit d’une erreur, écris au staff.',
  removeContactStaff: 'Contacter le staff',
  removeLoading: 'Vérification du lien…',
  removeError: 'Le retrait a échoué. Réessaie dans un instant.',

  // --- Renvois -------------------------------------------------------------
  altTitle: 'Tu as déjà une équipe ?',
  altDesc: 'Inscris-la directement au tournoi.',
  altCta: 'Créer mon équipe',
  mirrorTitle: 'Tu as une équipe et il te manque une joueuse ?',
  mirrorDesc:
    'C’est l’autre face de cette page : publie l’annonce de ton équipe, elle apparaît devant les joueuses qui cherchent un roster.',
  mirrorCta: 'Voir les équipes qui recrutent',
  discordTitle: 'Le Discord mène à la même liste',
  discordDesc:
    'Le rôle « Recherche une équipe » sur le serveur est le pendant de cette fiche : les deux alimentent la même liste. Prendre le rôle en plus de ta fiche ne fait pas doublon — et c’est là que les capitaines recrutent au quotidien.',
  discordCta: 'Rejoindre le Discord',
});
