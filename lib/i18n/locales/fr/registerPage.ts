// lib/i18n/locales/fr/registerPage.ts
//
// Traductions FRANCAISES du namespace `registerPage` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('registerPage', {
  badgeRole: 'Staff / Joueur',
  badgeAction: 'Inscription',
  title: 'Créer un compte',
  subtitle:
    'Inscris-toi avec ton email. Tu recevras un lien pour confirmer ton compte avant de te connecter.',
  accountTypeLegend: 'Je crée ce compte en tant que',
  accountTypePlayer: 'Joueuse',
  accountTypePlayerHint: 'Je joue en équipe ou je cherche une équipe.',
  accountTypeManager: 'Manager',
  accountTypeManagerHint: "J'encadre une équipe sans y jouer.",
  managerNoBattleTagNote:
    "Pas de BattleTag demandé : en tant que manager tu n'as pas besoin de compte Overwatch. Après confirmation de ton email, tu pourras créer ton équipe — et en encadrer plusieurs.",
  displayNameLabel: 'Nom affiché (optionnel)',
  displayNamePlaceholder: 'Ex: LaKiiroi',
  battleTagLabel: 'BattleTag (format Pseudo#0000)',
  battleTagPlaceholder: 'Ex: Gamerette#1234',
  emailLabel: 'Email',
  emailPlaceholder: 'prenom.nom@email.tld',
  passwordLabel: 'Mot de passe',
  confirmLabel: 'Confirmation',
  submit: 'Créer le compte',
  submitLoading: 'Création...',
  continueWithDiscord: 'Continuer avec Discord',
  linkLogin: 'Connexion',
  linkBackToSite: 'Retour au site',
  castBlurb:
    'Tu veux caster nos matchs ? Crée ton compte, puis fais ta demande depuis ton espace joueuse.',
  castLink: 'Rejoindre le cast',
  neutralSignupMsg:
    "Si cette adresse n'est pas déjà utilisée, un email de confirmation vient d'être envoyé. Vérifie ta boîte mail, puis connecte-toi.",
  passwordTooShort: 'Le mot de passe doit contenir au moins 8 caractères.',
  passwordMismatch: 'Les mots de passe ne correspondent pas.',
  battleTagInvalid: 'Le BattleTag doit être au format Pseudo#0000.',
  rateLimited:
    'Trop de tentatives. Patiente quelques instants avant de réessayer.',
  createAccountError:
    'Impossible de créer le compte pour le moment. Réessaie dans un instant.',
  submitGenericError:
    'Une erreur est survenue pendant la création du compte. Réessaie dans un instant.',
  discordStartError:
    "Impossible de démarrer l'inscription via Discord pour le moment.",
  discordGenericError:
    'Une erreur est survenue avec Discord. Réessaie dans un instant.',
});
