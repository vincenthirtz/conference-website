// lib/i18n/locales/fr/loginPage.ts
//
// Traductions FRANCAISES du namespace `loginPage` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('loginPage', {
  headTitle: "Connexion | OW Women's Cup",
  title: 'Connexion',
  subtitle:
    "Connecte-toi pour accéder à ton espace joueur ou au panel d'administration.",
  checkingSession: 'Vérification de la session...',
  emailLabel: 'Email',
  emailPlaceholder: 'prenom.nom@organisation.tld',
  passwordLabel: 'Mot de passe',
  rememberMe: 'Se souvenir de moi',
  forgotPassword: 'Mot de passe oublié ?',
  submit: 'Se connecter',
  submitting: 'Connexion en cours…',
  continueWithDiscord: 'Continuer avec Discord',
  noAccount: 'Pas encore de compte ?',
  createAccount: 'Créer mon compte',
  backToPublic: '← Retour au site public',
  errorInvalidCredentials: 'Email ou mot de passe incorrect.',
  errorNoSession: 'Impossible de récupérer la session.',
  errorUserNotFound: 'Utilisateur non trouvé après la connexion.',
  errorGeneric:
    'Une erreur est survenue pendant la connexion. Réessaie dans un instant.',
  errorDiscordUnavailable: 'Connexion Discord impossible pour le moment.',
  errorDiscordGeneric:
    'Une erreur est survenue avec Discord. Réessaie dans un instant.',
  continueWithBattlenet: 'Continuer avec Battle.net',
  battlenetLinkedOnly:
    'Battle.net fonctionne uniquement si tu as déjà relié ton compte Blizzard depuis ton profil.',
  battlenetNotLinked:
    "Ce compte Battle.net n'est relié à aucun compte OW Women's Cup. Connecte-toi par email ou Discord, puis relie ton compte Blizzard depuis ton profil — tu pourras ensuite utiliser ce bouton.",
  battlenetError:
    'La connexion Battle.net a échoué, réessaie ou utilise ton email.',
});
