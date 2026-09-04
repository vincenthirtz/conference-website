// lib/i18n/locales/fr/organisateursPage.ts
//
// Traductions FRANCAISES du namespace `organisateursPage` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts`.
//
// Les VALEURS chiffrées (prix, nombre de ligues) n'ont pas leur place ici :
// elles viennent de `utils/billing/planFeatures.ts`, que le code applique
// vraiment. On n'écrit que les phrases autour.

import { ns } from '../../ns';

export default ns('organisateursPage', {
  heroBadge: 'Plateforme de tournois',
  heroTitle: 'Organisez vos tournois, on tient la mécanique',
  heroSubtitle:
    "Inscriptions, brackets, check-in, arbitrage, régie et bot Discord : la plateforme qui fait tourner l'OW Women's Cup s'ouvre aux organisateurs. Votre espace, vos équipes, vos règles.",
  heroCta: 'Créer mon espace',
  heroSecondaryCta: 'Voir les offres',
  heroFinePrint:
    'Gratuit pour commencer, sans carte bancaire. Le bot Discord arrive avec les offres payantes.',

  whatTitle: 'Ce que vous n’aurez plus à faire à la main',
  whatIntro:
    "Chaque brique existe parce qu'une édition de la Coupe s'est cassé les dents dessus.",
  what1Title: 'Inscriptions et rosters',
  what1Body:
    "Les équipes s'inscrivent, les capitaines gèrent leur composition, et le roster se verrouille à la date que vous fixez — avec des dérogations quand la vie s'en mêle.",
  what2Title: 'Brackets et calendrier',
  what2Body:
    'Élimination simple ou double, poules, round robin, ligues sur plusieurs journées. Les matchs se génèrent, se replacent et se rejouent sans casser la suite.',
  what3Title: 'Check-in et forfaits',
  what3Body:
    "Rappels automatiques avant le match, check-in par équipe, forfait prononcé tout seul quand personne ne se présente. Vous n'attendez plus devant un salon vide.",
  what4Title: 'Litiges arbitrés',
  what4Body:
    'Un score contesté ouvre un fil dédié, avec preuves, délai et décision tracée. Les réconciliations évidentes se règlent seules.',
  what5Title: 'Régie et diffusion',
  what5Body:
    'Assignation des castrices, conducteur de direct, overlay OBS et bascule de scène au match suivant en un clic.',
  what6Title: 'Bot Discord',
  what6Body:
    "Salons d'équipe, rôles, annonces de matchs, tickets : le bot fait sur votre serveur ce que la plateforme décide, sans que vous ayez à l'héberger.",

  offersTitle: 'Les offres',
  offersIntro:
    'Un palier gratuit pour essayer sans engagement, puis des offres annuelles. Ce que vous lisez ici est exactement ce que le code applique.',
  offerHighlighted: 'Le plus courant',
  offerDiscoveryPitch:
    'Pour découvrir la plateforme et monter un premier tournoi.',
  offerRegiePitch: "Pour l'association ou le circuit qui tourne à l'année.",
  offerCircuitPitch: 'Pour plusieurs compétitions en parallèle.',
  offerEditorPitch: 'Pour un éditeur ou une structure aux besoins propres.',
  offerCtaStart: 'Commencer',
  offerCtaContact: 'Nous écrire',
  offersFootnote:
    "Les limites affichées sont appliquées par la plateforme, pas seulement annoncées : une offre « une ligue » en autorise une. Le passage à l'offre supérieure se fait depuis votre espace, sans nous écrire.",

  priceFree: 'Gratuit',
  pricePerYear: '{amount} € / an',
  priceOnRequest: 'Sur devis',

  featBotYes: 'Bot Discord inclus',
  featBotNo: 'Sans bot Discord',
  featLeaguesNone: 'Tournois à l’unité',
  featLeaguesCount: '{n} ligue ou saison',
  featLeaguesUnlimited: 'Ligues et saisons illimitées',
  featArbitrationYes: 'Arbitrage des litiges',
  featArbitrationNo: 'Sans arbitrage outillé',
  featRatingsYes: 'Classement et niveau des joueuses',
  featRatingsNo: 'Sans classement de niveau',
  featBrandYes: 'Votre marque et votre domaine',
  featBrandNo: 'Marque de la plateforme',
  featApiNo: 'Sans accès API',
  featApiRead: 'API en lecture',
  featApiWrite: 'API en lecture et écriture',

  stepsTitle: 'Comment on démarre',
  step1Title: 'Vous demandez votre espace',
  step1Body:
    'Un nom, une adresse email, votre compte Discord. La demande est traitée tout de suite : pas de file d’attente, pas de commercial à rappeler.',
  step2Title: 'Vous invitez le bot sur votre serveur',
  step2Body:
    'Un lien qui porte déjà votre espace : à la fin de l’installation, le serveur est rattaché tout seul.',
  step3Title: 'Vous réglez vos salons',
  step3Body:
    'Annonces, matchs en direct, litiges, arrivées : vous désignez les salons, le bot s’occupe du reste.',
  step4Title: 'Vous ouvrez les inscriptions',
  step4Body:
    'Le premier tournoi peut commencer. Vous changerez d’offre le jour où vous en aurez besoin, pas avant.',
  stepsCta: 'Créer mon espace',

  devTitle: 'Vous cherchiez l’API ?',
  devBody:
    "Elle n'a pas bougé : REST en lecture, écriture authentifiée par jeton, GraphQL, webhooks. La référence est générée depuis la spécification, donc jamais en retard sur le code.",
  devReferenceLink: 'Référence de l’API',
  devSignupLink: 'Obtenir des clés',
  formTitle: 'Souscrire',
  formIntro:
    "Dites-nous le nom de votre organisation et l'offre qui vous parle : on vous emmène au formulaire de création, déjà pré-rempli.",
  formOrgLabel: 'Nom de votre organisation',
  formOrgPlaceholder: 'Ligue Ardente, Tournoi des Cimes…',
  formPlanLabel: 'Offre visée',
  formSubmit: 'Continuer',
  formFinePrint:
    "L'étape suivante demande une connexion Discord — c'est par là que le bot rejoindra votre serveur. Aucune carte bancaire n'est demandée : l'espace se crée gratuitement, le paiement vient après, depuis votre espace.",
});
