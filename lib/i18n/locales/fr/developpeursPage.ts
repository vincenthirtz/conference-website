// lib/i18n/locales/fr/developpeursPage.ts
//
// Traductions FRANCAISES du namespace `developpeursPage` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('developpeursPage', {
  heroBadge: 'Portail développeur',
  heroTitle: 'API publique v1',
  heroSubtitle:
    'Une API REST publique, en lecture seule, pour consommer les données de tournois, matchs, équipes, classements et ligues. Sans clé, versionnée, prête à intégrer dans vos overlays, bots et sites.',
  hubCtaTitle: 'Ton tableau de bord développeur',
  hubCtaBody:
    'Connecté en tant que staff : retrouve ton accès API, ta consommation, tes clés et webhooks au même endroit.',
  hubCtaLink: 'Mon tableau de bord développeur',
  anonCtaTitle: "Prêt·e à intégrer l'API ?",
  anonCtaBody:
    "Crée un compte développeur en libre-service : génère tes clés d'API, abonne-toi aux webhooks et suis ta consommation.",
  anonCtaLink: 'Créer un compte développeur',
  overviewTitle: "Vue d'ensemble",
  card1Title: 'Lecture seule',
  card1Body:
    "Les routes de lecture sont en GET, sans clé. L'écriture, elle, requiert un token scopé (voir plus bas).",
  card2Title: 'Sans authentification',
  card2Body:
    "Aucune clé d'API ni jeton requis. Appelez directement les endpoints.",
  card3Title: 'CORS ouvert',
  card3Body:
    'En-tête Access-Control-Allow-Origin: * — utilisable depuis un navigateur.',
  card4Title: 'Versionnée',
  card4Body:
    'Préfixe /api/public/v1. La v1 reste stable ; toute rupture passera par une v2.',
  card5Title: 'Rate-limit',
  card5Body:
    'Environ 120 requêtes par minute et par adresse IP. Au-delà : erreur RATE_LIMITED.',
  card6Title: 'Réponses JSON en enveloppe',
  card6Body:
    'Le contenu est toujours sous { data: ... }. Les listes ajoutent un objet pagination.',
  baseUrlTitle: 'Base URL',
  baseUrlDescBefore:
    "L'API est servie depuis l'origine du site. Toutes les routes sont préfixées par ",
  errorsTitle: 'Format des erreurs',
  errorsDescBefore:
    'Une erreur renvoie un statut HTTP adapté et un corps JSON ',
  thCode: 'code',
  thMeaning: 'Signification',
  errNotFound: 'Ressource introuvable.',
  errBadRequest: 'Paramètres invalides ou manquants.',
  errMethodNotAllowed: 'Méthode HTTP non autorisée (seul GET est supporté).',
  errRateLimited: 'Limite de requêtes dépassée. Réessayez plus tard.',
  errInternal: 'Erreur interne du serveur.',
  quickstartTitle: 'Exemple rapide',
  quickstartDescPart1:
    'Récupérer les tournois en cours. La réponse expose la liste sous ',
  quickstartDescPart2: ' et les métadonnées de pagination sous ',
  referenceTitle: 'Référence des endpoints',
  referenceGeneratedCta: 'Voir la référence complète générée →',
  tocLabel: "Sommaire des groupes d'endpoints",
  groupTournamentsTitle: 'Tournois',
  groupTournamentsIntro:
    "Liste, détail et déroulé compétitif d'un tournoi. L'identifiant accepte l'UUID ou le slug.",
  groupMatchesTitle: 'Matchs',
  groupMatchesIntro: "Détail d'un match, avec le score par carte (games).",
  groupTeamsTitle: 'Équipes',
  groupTeamsIntro:
    "Fiche publique d'une équipe et son roster. L'identifiant accepte l'UUID ou le slug.",
  groupLeaderboardTitle: 'Classement & profils',
  groupLeaderboardIntro:
    'Classement des joueuses (rating Glicko-2) et profil individuel : historique, matchs récents, confrontations et distinctions.',
  groupLeaguesTitle: 'Ligues',
  groupLeaguesIntro:
    "Liste des ligues publiques et détail d'une ligue (classement + tournois rattachés).",
  sumTournamentsList: 'Liste des tournois publics.',
  sumTournamentDetail: "Détail d'un tournoi et ses phases (stages).",
  sumTournamentMatches: "Matchs d'un tournoi.",
  sumTournamentStandings:
    "Classement final d'un tournoi (vide tant qu'il n'est pas finalisé).",
  sumMatchDetail: "Détail d'un match et ses cartes.",
  sumTeamDetail: "Détail d'une équipe et sa composition.",
  sumLeaderboard: 'Classement des joueuses.',
  sumPlayerDetail: "Profil détaillé d'une joueuse.",
  sumLeaguesList: 'Liste des ligues publiques.',
  sumLeagueDetail: "Détail d'une ligue.",
  paramStatusTournament: 'Filtre par statut (ex. running, completed).',
  paramGame: 'Filtre par jeu (ex. overwatch).',
  paramLimit: 'Taille de page (pagination).',
  paramOffset: 'Décalage de départ (pagination).',
  paramIdRequired: 'Identifiant du tournoi : UUID ou slug.',
  paramTournamentIdSlug: 'UUID ou slug du tournoi.',
  paramStageId: 'Filtre par phase (id de stage).',
  paramMatchStatus: 'Filtre par statut de match.',
  paramMatchId: 'UUID du match.',
  paramTeamId: "UUID ou slug de l'équipe.",
  paramUserId: 'Identifiant de la joueuse.',
  paramLeagueSlug: 'Slug de la ligue.',
  paramsTh: 'Paramètre',
  locationTh: 'Emplacement',
  descriptionTh: 'Description',
  requiredTag: 'requis',
  pathLocation: 'chemin',
  queryLocation: 'requête',
  responseLabel: 'Réponse',
  paramsCaption: 'Paramètres de {path}',
  notesTitle: 'À noter',
  note1: 'API en lecture seule.',
  note2Before: 'Le contrat de référence est décrit dans ',
  note3Before: "Les endpoints sont susceptibles d'évoluer ; la version ",
  note3After: ' reste stable.',
  contactPrompt: "Une question ou un cas d'usage ? ",
  contactLink: 'Contactez-nous',
  card7Title: 'Écriture authentifiée',
  card7Body:
    "Un token Bearer pk_live_… scopé autorise l'écriture : report de score, et bientôt plus.",
  card8Title: 'GraphQL',
  card8Body:
    'Un endpoint GraphQL unique : requêtes anonymes, mutations sur token scopé.',
  writeNavLabel: 'Écriture (REST)',
  writeSectionTitle: 'Écriture authentifiée (REST)',
  writeSectionIntro:
    "En complément de la lecture anonyme, une surface d'écriture permet aux orgas tierces d'automatiser leurs opérations (report de résultats, overlays, intégrations). Chaque requête est authentifiée par un token scopé.",
  writeAccessTitle: 'Créez votre clé API',
  writeAccessBody:
    "Les clés API sont en libre-service : un administrateur de votre organisation les crée depuis l'espace admin (Réglages → Clés API). Chaque clé porte ses scopes et n'est affichée qu'une seule fois à la création. La lecture publique, elle, reste ouverte à tous, sans clé.",
  writeAccessCta: 'Créer une clé API',
  writeAuthTitle: 'Authentification',
  writeAuthBody:
    "Chaque écriture porte un en-tête Authorization: Bearer pk_live_…. Les tokens sont émis par un administrateur de l'organisation depuis l'espace admin et ne sont affichés qu'une seule fois à la création. Le tenant visé est déterminé par le token — aucun en-tête supplémentaire n'est requis.",
  writeScopesTitle: 'Scopes',
  writeScopesIntro:
    "Un token porte une liste de scopes au format resource:action. Chaque endpoint déclare le scope qu'il exige ; un scope absent renvoie 403 INSUFFICIENT_SCOPE. Aucune implication : matches:write n'implique pas matches:read.",
  writeThResource: 'Ressource',
  writeThActions: 'Actions',
  writeErrorsTitle: "Codes d'erreur (écriture)",
  writeErrorsIntro:
    "Les écritures partagent l'enveloppe { error, code } et ajoutent les codes suivants aux codes de lecture ci-dessus.",
  writeThHttp: 'HTTP',
  errUnauthorized: 'Token absent, invalide ou révoqué.',
  errInsufficientScope: 'Token valide, mais le scope requis est absent.',
  errMaintenanceMode: 'Écritures gelées : le site est en mode maintenance.',
  errConflict: "Conflit d'état (par ex. un match déjà clôturé).",
  writeErrorsNote:
    "Les codes de lecture (NOT_FOUND, BAD_REQUEST, RATE_LIMITED, INTERNAL…) s'appliquent également.",
  writeIdempotencyTitle: 'Idempotence',
  writeIdempotencyBody:
    "Envoyez un en-tête Idempotency-Key (≤ 200 caractères) pour sécuriser les rejeux. Une réponse 2xx est mise en cache 5 minutes et rejouée à l'identique (en-tête Idempotency-Replay: true) pour la même clé et le même corps.",
  writeEndpointSummary:
    "Pose le score final d'un match (autorité directe, sans consensus capitaine). Le match passe au statut finished, le bracket est propagé et les notifications sont émises. Idempotent.",
  writeScopeRequiredLabel: 'Scope requis',
  writeBodyLabel: 'Corps de la requête',
  graphqlNavLabel: 'GraphQL',
  graphqlSectionTitle: 'GraphQL',
  graphqlSectionIntro:
    "Un unique endpoint POST /api/graphql sert l'API GraphQL. Les requêtes (queries) sont anonymes, comme l'API REST de lecture ; les mutations exigent un token scopé.",
  graphqlDepthNote:
    "GraphiQL et l'introspection sont disponibles en développement uniquement. La profondeur des requêtes est plafonnée à 8 niveaux.",
  graphqlSchemaHeading: 'Schéma (extrait)',
  graphqlSchemaLabel: 'SDL',
  graphqlExamplesHeading: 'Exemples',
  graphqlQueryLabel: 'Requête (curl)',
  graphqlMutationLabel: 'Mutation (curl)',
  graphqlGraphiqlPrompt: 'Explorez le schéma de façon interactive avec ',
  graphqlGraphiqlLink: 'GraphiQL',
  graphqlGraphiqlNote: ' (disponible en développement uniquement).',
});
