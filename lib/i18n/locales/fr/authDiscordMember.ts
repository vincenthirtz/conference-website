// lib/i18n/locales/fr/authDiscordMember.ts
//
// Traductions FRANCAISES du namespace `authDiscordMember` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('authDiscordMember', {
  statusConnecting: 'Connexion via Discord…',
  statusValidating: 'Validation de la connexion…',
  statusSessionNotFound: "Session introuvable. Redirection vers l'accueil.",
  statusCheckingPerms: 'Vérification des permissions…',
  statusNoStaffAccess: "Pas d'accès staff. Redirection vers l'accueil…",
  statusRedirecting: 'Redirection…',
  statusConnectionError: 'Erreur de connexion. Redirection vers accueil…',
  errNoStaff:
    "Ton compte n'a pas d'accès staff. Contacte un admin si c'est une erreur.",
  errConnection: 'Erreur de connexion Discord. Réessaie.',
  waitMessage: 'Merci de patienter pendant la finalisation de la connexion.',
});
