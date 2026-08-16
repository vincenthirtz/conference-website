// lib/i18n/locales/fr/onboardSecrets.ts
//
// Traductions FRANCAISES du namespace `onboardSecrets` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('onboardSecrets', {
  errorTitle: 'Secrets indisponibles',
  recoveryTitle: 'Récupération possible ?',
  recoveryBody:
    "Si vous n'avez jamais ouvert la page (ou si l'email est très récent), réessayez le lien d'origine. Sinon, demandez une rotation des secrets au staff via",
  ourDiscord: 'notre Discord',
  backHome: "← Retour à l'accueil",
  successBadge: 'Réussi',
  secretsBadgeSub: 'Secrets de votre bot',
  welcome: 'Bienvenue, {name}',
  secretsReady: 'Vos secrets sont prêts',
  onceBefore: "Cette page n'est",
  onceHighlight: "affichée qu'une fois",
  onceAfter: '. Sauvegardez les valeurs ci-dessous avant de quitter.',
  slugLabel: 'Slug :',
  nextTitle: 'Et maintenant ?',
  step1a: 'Collez les variables ci-dessus dans le fichier',
  step1b: 'du bot (par ex.',
  step1c: 'côté',
  step1d: '), puis redémarrez le bot.',
  step2a: 'Lancez une commande de test sur votre serveur Discord (ex.',
  step2b: ') — si le bot répond, la liaison est complète.',
  step3a: "Finalisez la configuration depuis l'",
  adminSpace: 'espace admin',
  step3b:
    "(rôles staff, salons, branding…). TODO : le portail staff multi-tenant n'est pas encore fait.",
  savedButton: "J'ai sauvegardé les secrets",
  backHomePlain: "Retour à l'accueil",
});
