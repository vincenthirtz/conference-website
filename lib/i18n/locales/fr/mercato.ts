// lib/i18n/locales/fr/mercato.ts
//
// Traductions FRANCAISES du namespace `mercato` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/mercato.ts`. Toute cle ajoutee ici doit
// l'etre aussi cote anglais : le garde-fou `../parity.ts` casse le typecheck.
//
// Hub mercato (/mercato) : la page unique qui reunit les joueuses qui
// cherchent une equipe et les equipes qui recrutent, leurs filtres, les deux
// formulaires (/mercato/joueuse, /mercato/equipe) et les champs partages avec
// l'espace capitaine. Le vocabulaire (postes, genres, plateformes, rangs) suit
// les codes stables de `utils/mercato.ts` : les libelles vivent ici.

import { ns } from '../../ns';

export default ns('mercato', {
  // --- Hub ------------------------------------------------------------------
  heroBadge: 'Mercato',
  heroTitle: 'Le mercato des équipes',
  heroSubtitle:
    'Les joueuses qui cherchent une équipe et les équipes qui recrutent, au même endroit. Filtre par poste, rang, plateforme ou contrôle — et publie ta propre annonce, sans créer de compte.',
  heroNoAccount: 'Aucun compte requis',
  heroNoRank: 'Aucun rang minimum',
  heroFree: 'Gratuit',
  tabsLabel: 'Côté du mercato',
  tabPlayers: 'Joueuses libres',
  tabTeams: 'Équipes qui recrutent',
  ctaPlayerTitle: 'Tu cherches une équipe ?',
  ctaPlayerDesc:
    'Publie ta recherche : les capitaines la voient et te contactent. Visible 60 jours.',
  ctaPlayer: 'Publier ma recherche',
  ctaTeamTitle: 'Ton équipe recrute ?',
  ctaTeamDesc:
    'Publie ton annonce : les joueuses libres la voient et te contactent. Visible 60 jours.',
  ctaTeam: 'Publier une annonce d’équipe',
  botTitle: 'Aussi depuis Discord',
  botDesc:
    'Sur le serveur, la commande /mercato joueuse publie ou met à jour ta recherche, et /mercato equipe l’annonce de ton équipe — mêmes champs qu’ici.',
  discordCta: 'Rejoindre le Discord',

  // --- Filtres --------------------------------------------------------------
  filtersTitle: 'Filtres',
  filterPosition: 'Poste',
  filterGender: 'Genre affiché',
  filterGenderHint:
    'Seules les joueuses qui ont choisi d’afficher leur genre répondent à ce filtre.',
  filterSoughtGender: 'Équipes qui recherchent',
  filterSoughtGenderHint: 'Les équipes mixtes répondent toujours.',
  filterPlatform: 'Plateforme',
  filterInput: 'Contrôle',
  filterRankMin: 'Rang minimum',
  filterRankMax: 'Rang maximum',
  filterMyRank: 'Ton rang',
  filterMyRankHint:
    'Les équipes dont la fourchette (ou le rang moyen, à un palier près) te correspond.',
  filterAny: 'Tous',
  filterReset: 'Réinitialiser les filtres',
  resultCount: '{shown} affichée(s) sur {total}',
  noMatch:
    'Aucune annonce ne correspond à ces filtres. Élargis-les, ou publie la tienne.',

  // --- Vocabulaire ----------------------------------------------------------
  posTank: 'Tank',
  posHitscan: 'Hitscan',
  posFlexDps: 'Flex DPS',
  posMainHeal: 'Main heal',
  posFlexSupport: 'Flex support',
  genderFemale: 'Femme',
  genderMale: 'Homme',
  genderNonBinary: 'Non-binaire',
  genderUndisclosed: 'Je préfère ne pas dire',
  soughtFemale: 'Femmes',
  soughtMale: 'Hommes',
  soughtNonBinary: 'Personnes non-binaires',
  soughtMixed: 'Mixte',
  platformPc: 'PC',
  platformConsole: 'Console',
  inputController: 'Manette',
  inputMkb: 'Clavier-souris',
  tierBronze: 'Bronze',
  tierSilver: 'Argent',
  tierGold: 'Or',
  tierPlatinum: 'Platine',
  tierEmerald: 'Émeraude',
  tierDiamond: 'Diamant',
  tierMaster: 'Maître',
  tierGrandmaster: 'Grand maître',
  tierChampion: 'Champion',
  rankWithDivision: '{tier} {division}',
  rankAny: 'Peu importe',
  rankRange: 'De {min} à {max}',
  rankFrom: '{min} et plus',
  rankUpTo: 'Jusqu’à {max}',
  rankAverage: 'Rang moyen : {rank}',

  // --- Formulaire joueuse ---------------------------------------------------
  playerPageTitle: 'Je cherche une équipe',
  playerPageSubtitle:
    'Ta fiche apparaît dans le mercato pendant 60 jours, puis expire toute seule. Aucun compte requis.',
  genderLabel: 'Genre (facultatif)',
  genderHint:
    'Si tu le renseignes, il est affiché sur ta fiche publique. Par défaut : « je préfère ne pas dire », et rien n’est affiché.',
  rankLabel: 'Ton rang en compétitif',
  rankTierLabel: 'Palier',
  rankDivisionLabel: 'Division',
  rankTierUnknown: 'Je ne sais pas / je débute',
  rankDivisionNone: '—',
  rankHint:
    'Aucun rang minimum pour jouer : ça sert juste à te proposer des équipes de ton niveau.',
  platformLabel: 'Plateforme',
  multiHint: 'Plusieurs choix possibles.',
  inputLabel: 'Contrôle',
  mainRoleLabel: 'Poste principal',
  mainRoleNone: 'Choisir…',
  positionsLabel: 'Postes auxquels tu postules',
  pastTeamsLabel: 'Anciennes équipes, structures, essais',
  pastTeamsPlaceholder:
    'Ex : Team Alpha (2025), essai chez Les Lionnes… (facultatif)',
  goalsLabel: 'Si tu rejoins une équipe, que recherches-tu ?',
  goalsPlaceholder:
    'Du fun, progresser, essayer d’intégrer une grosse structure… (facultatif)',
  wordCount: '{count} / {max} mots',
  wordCountOver: '{count} / {max} mots — c’est un peu long, raccourcis',
  errorGoals: 'Ce que tu recherches : 50 mots maximum.',
  errorPositions: 'Choisis au moins un poste.',

  // --- Formulaire équipe ----------------------------------------------------
  teamPageTitle: 'Mon équipe recrute',
  teamPageSubtitle:
    'Ton annonce apparaît dans le mercato pendant 60 jours, puis expire toute seule. Aucun compte requis.',
  soughtGendersLabel: 'Profils recherchés',
  soughtGendersHint:
    'Plusieurs choix possibles. « Mixte » : tout le monde est bienvenu.',
  teamRankLabel: 'Rang moyen recherché',
  teamRankUnknown: 'Peu importe',
  teamRankRangeLabel: 'Fourchette acceptée (facultatif)',
  teamRankRangeHint:
    'Laisse vide si le rang moyen suffit. Une joueuse dans la fourchette voit ton annonce dans ses filtres.',
  teamRankMin: 'De',
  teamRankMax: 'À',
  teamPlatformLabel: 'Plateforme(s)',
  teamInputLabel: 'Contrôle(s)',
  anyHint: 'Ne coche rien si peu importe.',
  teamPositionsLabel: 'Postes recherchés',
  teamNoteLabel: 'Description de l’équipe et but du recrutement',
  teamNotePlaceholder:
    'Tournoi(s) prévu(s) ? Création d’équipe ? Remplaçante ? Votre ambiance, vos objectifs…',
  errorRankRange:
    'La fourchette de rang est inversée : le minimum dépasse le maximum.',

  // --- Cartes ---------------------------------------------------------------
  cardMainRole: 'Poste principal : {role}',
  cardPastTeams: 'Parcours',
  cardGoals: 'Ce qu’elle recherche',
  cardSought: 'Recherche : {list}',
  backToHub: 'Retour au mercato',
});
