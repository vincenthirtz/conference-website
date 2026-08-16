// lib/i18n/locales/fr/discordSignInCta.ts
//
// Traductions FRANCAISES du namespace `discordSignInCta` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('discordSignInCta', {
  defaultLabel: 'Se connecter avec Discord',
  redirecting: 'Redirection…',
  errorLink: 'Impossible de lier votre compte Discord.',
  errorStart: 'Impossible de démarrer la connexion Discord.',
  errorGeneric:
    'Une erreur est survenue avec Discord. Réessayez dans un instant.',
});
