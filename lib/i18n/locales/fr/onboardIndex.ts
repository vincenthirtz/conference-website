// lib/i18n/locales/fr/onboardIndex.ts
//
// Traductions FRANCAISES du namespace `onboardIndex` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('onboardIndex', {
  badge: 'Self-service',
  badgeSub: 'Onboarding bot Discord',
  title: 'Ajoutez le bot Conférence sur votre serveur Discord',
  subtitle:
    'En quelques minutes, déployez la même stack que la Conférence des équipes féminines Overwatch : gestion de tournois, scrims, casts, role-sync — le tout piloté depuis votre serveur Discord.',
  feature1Title: 'Gestion complète des tournois',
  feature1Desc:
    'Brackets, groupes, seeding, vetos, draft de cartes — directement orchestrés depuis Discord et synchronisés avec le site.',
  feature2Title: 'Scrims & matchs amicaux',
  feature2Desc:
    'Vos équipes proposent et acceptent des scrims via le bot. Les casters récupèrent automatiquement leurs assignations.',
  feature3Title: 'Casts et streams suivis',
  feature3Desc:
    'Synchronisation des casters, statuts en direct et notifications discord pour ne rater aucun match.',
  feature4Title: 'Rôles & permissions auto',
  feature4Desc:
    'Les rôles staff et joueuses sont synchronisés avec les équipes inscrites, sans gestion manuelle.',
  feature5Title: 'Espace public dédié',
  feature5Desc:
    'Vous récupérez votre propre espace public sur le site (URL `/<votre-slug>/...`) pour annoncer vos tournois.',
  feature6Title: 'Self-hébergé, sans dépendance',
  feature6Desc:
    'Vous gardez la main : les secrets vous sont remis une seule fois, vous tournez le bot sur votre infra.',
  ctaTitle: 'Prêt·e à démarrer ?',
  ctaDesc:
    "La demande est gratuite et prend moins de deux minutes. Vous recevez ensuite un email de confirmation, puis un bouton d'invitation du bot sur votre serveur.",
  requestBot: 'Demander le bot',
  signedInAs: 'Vous êtes connecté·e en tant que {name}.',
  discordUserFallback: 'utilisateur Discord',
  signInPrompt:
    'Connectez-vous via Discord pour démarrer — nous avons besoin de votre identifiant Discord pour associer le bot à votre serveur.',
  noPassword: 'Pas de mot de passe à créer. Votre compte Discord suffit.',
  questionPrefix: 'Une question ? Rejoignez le',
  communityDiscord: 'Discord communautaire',
  questionMiddle: 'ou écrivez-nous à',
});
