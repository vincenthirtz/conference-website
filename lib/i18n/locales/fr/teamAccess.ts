// lib/i18n/locales/fr/teamAccess.ts
//
// Traductions FRANCAISES du namespace `teamAccess` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('teamAccess', {
  pageTitle: 'Accès espace équipe',
  badgeTeam: 'Équipe',
  badgeAction: 'Connexion',
  heading: 'Connexion à ton espace équipe',
  intro:
    "On valide ton lien de connexion, puis on t'emmène directement dans ton espace équipe.",
  loadingSession: 'Validation du lien de connexion…',
  redirecting: 'Connexion réussie, redirection…',
  errorInvalidLink: 'Ce lien de connexion est invalide ou a expiré.',
  errorNoSession:
    "Impossible d'établir la session. Le lien a peut-être déjà été utilisé.",
  errorCodeInvalid: 'Lien de connexion invalide.',
  errorRestoreSession: 'Impossible de restaurer la session.',
  singleUseNote:
    'Les liens de connexion sont à usage unique et expirent rapidement.',
  backToLogin: 'Se connecter avec un mot de passe',
});
