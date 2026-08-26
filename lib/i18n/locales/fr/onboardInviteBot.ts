// lib/i18n/locales/fr/onboardInviteBot.ts
//
// Traductions FRANCAISES du namespace `onboardInviteBot` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('onboardInviteBot', {
  stepBadge: 'Étape 3/3',
  stepSub: 'Invitez le bot',
  titleCompleted: 'Bot installé avec succès',
  title: 'Invitez le bot sur votre serveur',
  orgLabel: 'Organisation :',
  slugLabel: '• slug :',
  blockedTitle: 'Demande non prête',
  blockedStatusLabel: 'Statut actuel :',
  blockedBody:
    ". Cette demande n'est pas dans un état permettant d'inviter le bot. Vous pouvez",
  restart: 'recommencer la demande',
  completedHeading: 'Le bot est en place sur votre serveur Discord.',
  completedBody:
    "Votre espace est provisionné. Récupérez vos clés (BOT_API_KEY, BOT_WEBHOOK_SECRET) ci-dessous — elles ne s'affichent qu'une seule fois. Un email de secours contenant le même lien vous a aussi été envoyé.",
  revealButton: 'Récupérer mes clés',
  revealedAlready:
    'Vos clés ont déjà été consultées. En cas de perte, demandez une rotation des secrets au staff.',
  completedContact: 'Une question ? Contactez le staff via',
  ourDiscord: 'notre Discord',
  inviteIntroBefore:
    'Cliquez sur le bouton ci-dessous pour ouvrir Discord et inviter le bot sur votre serveur. Vous devez disposer du rôle',
  manageServerRole: 'Gérer le serveur',
  inviteIntroAfter: 'sur la guilde concernée.',
  noUrlBefore: "Variable d'environnement",
  noUrlAfter:
    "non configurée — impossible de générer l'URL d'invitation. Contactez le staff.",
  inviteButton: 'Inviter le bot sur mon serveur',
  step1Before: 'Cliquez sur',
  step1Highlight: 'Inviter',
  step1After: "— une nouvelle fenêtre Discord s'ouvre.",
  step2:
    'Sélectionnez votre serveur dans la liste et autorisez les permissions demandées.',
  step3:
    "Revenez sur cette page — nous détectons automatiquement l'arrivée du bot, puis vos clés s'affichent ici dans la foulée.",
  waiting:
    "En attente de l'arrivée du bot — vérification toutes les 5 secondes.",
  backToIntro: '← Retour à la présentation',
});
