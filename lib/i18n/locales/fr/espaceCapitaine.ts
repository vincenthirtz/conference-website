// lib/i18n/locales/fr/espaceCapitaine.ts
//
// Traductions FRANCAISES du namespace `espaceCapitaine` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('espaceCapitaine', {
  heroBadge: 'Espace capitaine',
  heroKicker: "Gestion d'équipe",
  heroTitle: 'Pilote ton équipe depuis un seul tableau de bord',
  heroDescription:
    "Roster, recrutement, scrims, messagerie, transferts : tout ce qu'il te faut pour mener ton équipe sans courir entre Discord, Excel et les DM.",
  heroCtaSpace: 'Accéder à mon espace ↗',
  heroCtaGuide: 'Suivre le guide pas-à-pas ↗',
  heroCtaRegister: 'Inscrire mon équipe',
  heroCtaFeatures: 'Voir les fonctionnalités',
  heroCtaFaq: 'FAQ',
  forWhoKicker: 'Pour qui ?',
  forWhoTitle: "Pensé pour les capitaines d'équipe",
  forWhoDescription:
    "L'espace capitaine est ouvert dès que tu deviens capitaine d'une équipe inscrite à un tournoi. Si tu n'as pas encore d'équipe, commence par en créer une — la capitaine, c'est celle qui inscrit le roster.",
  forWhoItems: [
    'Tu as créé ton compte sur le site (email ou Discord).',
    'Tu as inscrit une équipe au tournoi en cours.',
    'Tu es désignée capitaine du roster (par défaut, la créatrice).',
    'Tu es présente sur le Discord officiel pour recevoir les pings.',
  ],
  featuresKicker: 'Fonctionnalités',
  featuresTitle: 'Tout ce que tu peux faire',
  featuresDescription:
    'Chaque outil est accessible en un clic depuis le dashboard capitaine, sans quitter la plateforme.',
  features: [
    {
      icon: 'roster',
      title: 'Gérer le roster',
      description:
        'Ajoute ou retire des joueuses, change leur rôle (Tank, DPS, Support, remplaçante, coach) et passe le brassard de capitaine en un clic.',
    },
    {
      icon: 'door',
      title: 'Ouvrir ou fermer le recrutement',
      description:
        'Active le mode "ouvert" pour recevoir des candidatures, ou ferme l’équipe le temps des matchs pour stabiliser le roster.',
    },
    {
      icon: 'inbox',
      title: 'Valider les demandes',
      description:
        'Reçois les demandes de joueuses qui veulent rejoindre, lis leur message, accepte ou refuse — tout depuis le même écran.',
    },
    {
      icon: 'swords',
      title: 'Proposer des scrims',
      description:
        'Lance ou accepte des matchs amicaux entre équipes pour t’entraîner avant les rencontres officielles.',
    },
    {
      icon: 'chat',
      title: 'Messagerie capitaines',
      description:
        'Discute en direct avec les autres capitaines pour caler horaires, lobbies ou règles maison sans quitter le site.',
    },
    {
      icon: 'transfer',
      title: 'Gérer les transferts',
      description:
        'Propose un transfert vers une autre équipe ou réceptionne ceux qui te sont adressés, avec validation côté staff.',
    },
    {
      icon: 'eye',
      title: 'Page publique de l’équipe',
      description:
        'Profite d’une page vitrine pour ton équipe (logo, roster, palmarès) à partager sur les réseaux et avec les sponsors.',
    },
  ],
  guideKicker: 'Comment faire ?',
  guideTitle: 'Le guide pas-à-pas, écran par écran',
  guideDescription:
    'Envie de voir concrètement comment ça marche ? Le guide déroule chaque étape (inscription, candidatures, roster, messagerie, scrims, check-in) avec des aperçus réels du dashboard capitaine.',
  guideCta: 'Suivre le guide pas-à-pas',
  ctaKicker: 'Prête à prendre les commandes ?',
  ctaTitle: 'Ouvre ton dashboard capitaine',
  ctaDescription:
    "Si tu as déjà une équipe, l'espace est accessible immédiatement après connexion.",
  ctaButton: 'Accéder à mon espace ↗',
  faqKicker: 'Questions fréquentes',
  faqTitle: 'FAQ capitaine',
  faqs: [
    {
      question: 'Qui peut devenir capitaine ?',
      answer:
        'Toute joueuse qui crée une équipe via le formulaire d’inscription en devient capitaine. Si tu as rejoint une équipe sans en être la capitaine, tu peux ensuite faire une demande depuis ton espace joueur — la capitaine actuelle ou le staff valide le passage de relais.',
    },
    {
      question: 'Combien de capitaines par équipe ?',
      answer:
        'Une seule capitaine officielle à la fois. C’est elle qui reçoit les check-ins de match, les notifications staff et les messages des autres équipes. La passation se fait à n’importe quel moment via le dashboard.',
    },
    {
      question:
        'Que se passe-t-il si je ne réponds pas à temps à un scrim ou à un check-in ?',
      answer:
        'Les check-ins de match ont une fenêtre stricte (~1h avant le coup d’envoi) — sans validation, l’équipe est déclarée forfait. Les scrims n’ont pas de pénalité, mais un refus rapide aide la communauté à s’organiser.',
    },
    {
      question: 'Puis-je gérer plusieurs équipes ?',
      answer:
        'Non, une joueuse ne peut être capitaine que d’une seule équipe à la fois. C’est un garde-fou pour éviter les conflits d’horaires et garantir la disponibilité de la capitaine pendant les phases de tournoi.',
    },
    {
      question: 'Si je quitte mon équipe, qu’est-ce qui se passe ?',
      answer:
        'Si tu n’es pas capitaine, tu peux partir librement (la capitaine et le staff sont notifiés). Si tu es capitaine, transfère d’abord le brassard à une autre membre, sinon le staff te demandera de le faire avant de valider ta sortie.',
    },
  ],
  helpKicker: "Besoin d'aide ?",
  helpTitle: 'Le staff répond sur Discord',
  helpDescription:
    "Question sur la passation de capitanat, BattleTag à corriger, transfert bloqué ? Le staff t'accompagne sur Discord et par email.",
  helpDiscord: 'Discord ↗',
  helpContact: 'Formulaire de contact',
  helpGuide: "Guide d'inscription",
  seoTitle: 'Espace capitaine — gérer ton équipe',
  seoDescription:
    "Présentation de l'espace capitaine OW Women's Cup : roster, recrutement, scrims, messagerie et transferts pour gérer ton équipe en tournoi.",
});
