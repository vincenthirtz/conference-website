// lib/i18n/locales/fr/jeuxPage.ts
//
// Traductions FRANCAISES du namespace `jeuxPage` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('jeuxPage', {
  overwatchTagline: 'Le titre fondateur de la communauté.',
  overwatchPitch:
    "Le hero shooter de Blizzard est le cœur de l'OW Women's Cup depuis 2025. Map veto complet, pool de 29 maps et formats BO1/3/5 pour les phases finales.",
  valorantTagline: 'Tactique 5v5 sur la scène FPS.',
  valorantPitch:
    'Le tactical shooter de Riot intègre notre stack tournoi avec son pool compétitif (Ascent, Bind, Lotus, Sunset…) et un veto inspiré du ruleset VCT.',
  cs2Tagline: 'Le mythe du tir 5v5.',
  cs2Pitch:
    'Counter-Strike 2 utilise les séquences de veto ESL / Major (ban-ban-pick-pick-ban-ban-decider) sur les active-duty maps officielles.',
  r6Tagline: 'Siège tactique 5v5, destruction & gadgets.',
  r6Pitch:
    'Rainbow Six Siege rejoint le programme avec son pool ranked complet (Bank, Clubhouse, Kafe, Nighthaven Labs…) et un veto calé sur les règles esport.',
  marvelTagline: '6v6 hero shooter Marvel.',
  marvelPitch:
    'Marvel Rivals propose Domination, Convoy et Convergence sur un pool de 11 cartes : tournois BO1/3/5 avec veto pour éviter les cartes « maison ».',
  rocketTagline: 'Voitures-fusées, 3v3, sport mécanique.',
  rocketPitch:
    'Rocket League se passe de veto (arène fixe) mais utilise des formats longs BO3/5/7 pour les playoffs : la stack tournoi gère directement le match sans veto.',
  lolTagline: 'MOBA Riot, Tournament Draft.',
  lolPitch:
    "League of Legends utilise le Tournament Draft officiel : 10 bans + 10 picks répartis en deux phases. Le bot lance la draft sur Discord et la pousse à l'UI live.",
  dota2Tagline: 'MOBA Valve, Captains Mode.',
  dota2Pitch:
    'Dota 2 utilise le Captains Mode (patch 7.34+) : 9 bans + 10 picks en trois phases, géré de bout en bout par notre moteur de draft multi-jeux.',
  fallbackPitch:
    'Jeu supporté par la stack tournoi multi-jeux : inscription, bracket, scoring et match thread Discord automatisés.',
  mapVeto: 'Map veto',
  draft: 'Draft',
  mapsCount: '{count} maps',
  mapFixed: 'Map fixe',
  formats: 'Formats',
  badgeMulti: 'Multi-jeux',
  heroTitle: "Les jeux supportés par le système de la Women's Cup",
  heroSubtitlePart1:
    'Notre stack tournoi (bracket, veto, draft, match threads Discord) est maintenant ',
  heroSubtitleStrong: 'multi-jeux',
  heroSubtitlePart2:
    '. {count} titres sont supportés nativement : choisis ton jeu, ton format, et lance la machine.',
  ctaRegisterTeam: 'Inscrire mon équipe',
  ctaViewTournaments: 'Voir les tournois',
  statsHeading: 'En chiffres',
  statGamesLabel: 'jeux supportés',
  statGamesSub: 'FPS, MOBA, sport mécanique',
  statMapsLabel: 'maps cumulées',
  statMapsSub: 'toutes pool confondues',
  statVetoLabel: 'jeux avec veto',
  statVetoSub: 'séquences ESL / VCT auto',
  statDraftLabel: 'jeux avec draft',
  statDraftSub: 'LoL & Dota 2',
  statFormatsLabel: 'formats',
  statFormatsSub: 'BO1 → BO7 selon le jeu',
  catalogueEyebrow: 'Catalogue',
  catalogueTitle: '{count} jeux pris en charge',
  catalogueDesc:
    "Pour chaque titre on gère les inscriptions, les vetos / drafts, les scores et la diffusion sur Discord. Pas besoin d'outil externe.",
  compareEyebrow: 'Comparatif',
  compareTitle: 'Tout sur une grille',
  compareDesc:
    'Capacités du moteur tournoi par jeu. Utile pour choisir ton format ou comparer deux titres rapidement.',
  tableGame: 'Jeu',
  tableMapVeto: 'Map veto',
  tableDraft: 'Draft',
  tableMaps: 'Maps',
  tableFormats: 'Formats',
  tableYes: '✓ Oui',
  howEyebrow: 'Pipeline',
  howTitle: 'Comment ça marche',
  howDesc:
    'La même stack pour tous les jeux : zéro friction pour les équipes, zéro copier-coller pour le staff.',
  stepLabel: 'Étape {n}',
  step1Title: 'Inscris ton équipe',
  step1Detail:
    "Crée ton équipe, choisis ton jeu et ton format. La plateforme vérifie la composition et te place dans le bracket dès l'ouverture des inscriptions.",
  step2Title: 'Veto / draft automatisé',
  step2Detail:
    "Avant chaque match, l'outil lance le veto ou la draft (selon le jeu) avec timer, alternance auto et historique. Aucun staff nécessaire.",
  step3Title: 'Match thread Discord live',
  step3Detail:
    'Le bot ouvre un thread dédié, publie le scoreboard, relève les scores et clôt le match. Les casters et les viewers suivent en direct.',
  botEyebrow: 'Discord',
  botTitle: 'Le bot Discord, ton cockpit',
  botDesc:
    'Tout passe par des commandes slash : inscription, match, veto, draft, score, dispute. Une seule interface, identique pour tous les jeux.',
  scopeUniversal: 'Universel',
  scope5Games: '5 jeux',
  scopeLolDota: 'LoL & Dota 2',
  cap1Title: 'Tournois & équipes',
  cap1Detail:
    'Création, publication, inscriptions, gestion du roster. La commande /tournoi creer propose les 8 jeux au choix.',
  cap2Title: 'Match live',
  cap2Detail:
    'Le bot ouvre un thread Discord par match, suit le check-in, collecte les scores et propage la victoire dans le bracket automatiquement.',
  cap3Title: 'Map veto',
  cap3Detail:
    'Veto automatisé en DM avec les capitaines : alternance, timer, séquences ESL/VCT spécifiques au jeu. Aucune saisie manuelle côté staff.',
  cap4Title: 'Draft MOBA',
  cap4Detail:
    'Tournament Draft (LoL) et Captains Mode (Dota 2) gérés de bout en bout : bans, picks, fearless draft, timer serveur et UI spectateur live.',
  cap5Title: 'Cast & live',
  cap5Detail:
    'Coordination des casters, attribution des matchs à caster, annonces multi-channels et relais des lives Twitch.',
  cap6Title: 'Scrims & entraînement',
  cap6Detail:
    "Création de scrims publics, recherche d'adversaire, fil dédié et rappels automatiques. Marche pour tous les jeux du registry.",
  cap7Title: 'Disputes & arbitrage',
  cap7Detail:
    'Forum disputes dédié, suivi par le staff arbitrage et notifications aux capitaines à chaque évolution.',
  cap8Title: 'Stats & classement',
  cap8Detail:
    'Classement live du tournoi, stats agrégées par équipe et joueur, historique des matchs avec replay du veto/draft.',
  cap9Title: 'Aide & support',
  cap9Detail:
    "Une aide contextuelle par commande, un canal /aide-tournoi pour le staff et l'enregistrement du bot sur d'autres serveurs.",
  multiTenantLabel: 'Multi-tenant :',
  multiTenantBody:
    ' le bot peut tourner sur plusieurs serveurs Discord avec un cloisonnement total des tournois, des équipes et des stats. Pratique si une autre asso veut bénéficier de la même stack.',
  inviteBotCta: 'Inviter le bot sur mon serveur',
  faqEyebrow: 'FAQ',
  faqTitle: "Les questions qu'on nous pose",
  faqIntroBefore: 'Une autre question ? Le canal ',
  faqIntroAfter: ' du Discord est ouvert à toutes les capitaines.',
  faq1Question:
    "Mon jeu préféré n'est pas dans la liste, vous pouvez l'ajouter ?",
  faq1Answer:
    "Oui — la stack est conçue pour ça. Ajouter un jeu se fait en déclarant son registry (pool de cartes ou flow de draft, formats supportés) et en mettant à jour la commande /tournoi creer. Compte une à deux semaines selon la complexité. Ouvre une discussion via la page Contact pour qu'on en discute.",
  faq2Question: 'Comment fonctionne le map veto exactement ?',
  faq2Answer:
    "Le bot envoie un DM aux deux capitaines dès que le match est prêt. Chaque capitaine ban ou pick à son tour selon la séquence du jeu (ESL/Major pour CS2, VCT pour Valorant, etc.), avec un timer serveur. La séquence est rejouée dans le thread Discord et stockée pour l'historique du match.",
  faq3Question: 'Pourquoi seuls LoL et Dota 2 ont un draft de héros ?',
  faq3Answer:
    "Parce que ces deux jeux ont une vraie phase de draft formalisée (Tournament Draft pour LoL, Captains Mode pour Dota 2) où les bans/picks alternent. Les hero shooters comme Overwatch ou Marvel Rivals ont du hero swap libre en partie : il n'y a rien à drafter avant le match.",
  faq4Question: "Le bot peut-il tourner sur d'autres serveurs Discord ?",
  faq4Answer:
    "Oui. Le bot est multi-tenant : on peut l'inviter sur n'importe quel serveur. Chaque serveur a ses propres tournois, équipes et stats, cloisonnés via un identifiant de tenant. Le bouton « Inviter le bot sur mon serveur » au-dessus lance la procédure self-service.",
  faq5Question: 'Quel format choisir pour mon tournoi ?',
  faq5Answer:
    'BO1 = match unique (rapide, idéal pour les phases de groupes). BO3 = standard compétitif, deux maps gagnantes sur trois. BO5 = grandes finales. BO7 = uniquement Rocket League (sport mécanique, parties courtes). Tu peux mélanger les formats : par exemple BO1 en poules et BO3 en élimination.',
  faq6Question: 'Combien ça coûte pour utiliser le système ?',
  faq6Answer:
    "Zéro. La stack est open et l'association OW Women's Cup la maintient comme outil communautaire. Tu peux participer à nos tournois, ou inviter le bot sur ton serveur si tu organises les tiens — dans tous les cas il n'y a pas de licence.",
  faq7Question:
    'Est-ce que je peux suivre les matchs en direct sans installer le bot ?',
  faq7Answer:
    "Oui : tous les matchs publics sont visibles sur ce site (bracket, scores, replay du veto et de la draft) et les casts Twitch sont relayés sur la page Live. Le bot est l'outil des joueuses et du staff, pas une obligation pour le public.",
  ctaEyebrow: 'Suggestion',
  ctaTitle: "Tu veux qu'on ajoute ton jeu ?",
  ctaDesc:
    'La stack est conçue pour accueillir de nouveaux titres. Si la scène féminine de ton jeu mérite un tournoi outillé comme le nôtre, dis-le nous, on regarde ensemble.',
  ctaContact: 'Nous contacter',
  ctaBecomePartner: 'Devenir partenaire',
});
