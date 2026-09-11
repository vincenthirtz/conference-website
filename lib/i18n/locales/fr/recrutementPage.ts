// lib/i18n/locales/fr/recrutementPage.ts
//
// Traductions FRANCAISES du namespace `recrutementPage` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.
//
// Page /recrutement — le MIROIR de /rejoindre. Ici on s'adresse a une capitaine
// a qui il manque une joueuse, pas a une joueuse sans equipe : meme parcours,
// meme absence de compte requis, ton oriente « publier une annonce ».

import { ns } from '../../ns';

export default ns('recrutementPage', {
  // --- Hero ---------------------------------------------------------------
  heroBadge: 'Il te manque une joueuse ?',
  heroTitle: 'Les équipes qui recrutent',
  heroSubtitle:
    'Publie ton annonce ici : les joueuses qui cherchent une équipe la voient, et tu reçois leurs candidatures. Deux minutes, sans créer de compte.',
  heroNoAccount: 'Aucun compte requis',
  heroFast: 'Deux minutes',
  heroFree: 'Gratuit',

  // --- Comment ça marche ---------------------------------------------------
  howTitle: 'Comment ça marche',
  how1Title: 'Tu décris ton besoin',
  how1Desc:
    'Le nom de ton équipe, les postes qu’il te manque, vos créneaux. Rien d’autre n’est obligatoire.',
  how2Title: 'Les joueuses te voient',
  how2Desc:
    'Ton annonce apparaît dans la liste ci-dessous, et le Discord relaie les nouvelles annonces.',
  how3Title: 'Tu recrutes',
  how3Desc:
    'Une joueuse intéressée te contacte, ou tu pioches en sens inverse dans la liste des joueuses libres.',

  // --- Formulaire ----------------------------------------------------------
  formTitle: 'Publier une annonce',
  formSubtitle: 'Ton annonce reste visible 60 jours, puis expire toute seule.',
  teamNameLabel: 'Nom de ton équipe',
  teamNamePlaceholder: 'Le nom sous lequel on vous connaît',
  rolesLabel: 'Tu cherches quels postes ?',
  rolesHint: 'Plusieurs choix possibles.',
  roleTank: 'Tank',
  roleDps: 'DPS',
  roleSupport: 'Support',
  roleFlex: 'Flex',
  levelLabel: 'Le niveau de ton équipe, approximativement',
  levelUnknown: 'Peu importe / équipe mixte',
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
    'Ça sert seulement à orienter les joueuses : rien ne t’empêche de recruter en dehors de cette fourchette.',
  availabilityLabel: 'Vos créneaux',
  availabilityPlaceholder: 'Ex : entraînement mardi et jeudi 20 h 30',
  noteLabel: 'Un mot sur l’équipe',
  notePlaceholder:
    'Votre ambiance, vos objectifs, ce que vous attendez d’une nouvelle joueuse… (facultatif)',
  emailLabel: 'Ton email',
  emailHint:
    'Il sert uniquement à recevoir les candidatures. Il n’apparaît jamais publiquement.',
  emailPlaceholder: 'ton@email.com',
  discordLabel: 'Ton pseudo Discord',
  discordPlaceholder: 'pseudo (facultatif)',
  discordHint:
    'Facultatif, mais utile : avec ton pseudo, une joueuse t’écrit directement en message privé au lieu d’attendre que tu ouvres tes emails.',
  captchaLabel: 'Anti-bot — combien font {question} ?',
  captchaPlaceholder: 'Réponds par un nombre',
  honeypotLabel: 'Ne pas remplir',
  submit: 'Publier mon annonce',
  submitting: 'Envoi…',
  successTitle: 'C’est publié !',
  successBody:
    'Ton annonce est en ligne. Les joueuses intéressées t’écrivent par email — ou en message privé sur Discord si tu as renseigné ton pseudo.',
  successDiscordBody:
    'La suite se passe sur le serveur : ton annonce y est relayée, et c’est là que les joueuses libres se signalent au quotidien.',
  successDiscordCta: 'Rejoindre le Discord',
  successAgain: 'Publier une autre annonce',
  privacyNote:
    'Ton email et ton pseudo Discord ne sont jamais publics : la liste ci-dessous n’affiche que le nom de l’équipe, les postes recherchés et vos créneaux. Ton annonce expire au bout de 60 jours.',

  // --- Erreurs -------------------------------------------------------------
  errorTeamName: 'Indique le nom de ton équipe (2 caractères minimum).',
  errorEmail: 'Merci de saisir une adresse email valide.',
  errorRoles: 'Choisis au moins un poste recherché.',
  errorGeneric: 'L’envoi a échoué. Réessaie dans un instant.',

  // --- Liste publique ------------------------------------------------------
  listTitle: 'Elles cherchent une joueuse',
  listSubtitle: 'Mise à jour en continu.',
  listEmpty:
    'Aucune annonce pour le moment — sois la première, la tienne sera en haut de la liste.',
  listError: 'La liste n’a pas pu être chargée.',
  listRetry: 'Réessayer',
  listCount: '{count} équipe(s) en recrutement',
  listSince: 'Depuis le {date}',
  listNoContact:
    'Les coordonnées des équipes ne sont pas publiques : réponds à une annonce depuis le Discord ou signale-toi sur la page « Rejoindre une équipe ».',
  filterAll: 'Tous les postes',

  // --- Renvois -------------------------------------------------------------
  altTitle: 'Tu cherches une équipe, pas une joueuse ?',
  altDesc:
    'C’est l’autre face de la même porte : signale-toi et les capitaines qui recrutent te contactent.',
  altCta: 'Je cherche une équipe',
  discordTitle: 'Le recrutement vit sur le Discord',
  discordDesc:
    'Les annonces y sont relayées, et les joueuses libres s’y signalent avec le rôle « Recherche une équipe ». Publier ici et poster là-bas ne fait pas doublon.',
  discordCta: 'Rejoindre le Discord',
});
