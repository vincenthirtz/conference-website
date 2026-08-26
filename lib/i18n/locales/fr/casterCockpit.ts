// lib/i18n/locales/fr/casterCockpit.ts
//
// Traductions FRANCAISES du namespace `casterCockpit` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('casterCockpit', {
  connecting: 'Connexion au cockpit...',
  accessInactiveTitle: 'Accès caster non actif',
  accessInactiveBody:
    "Ton compte est authentifié, mais aucune fiche caster active n'y est liée dans ce tenant. Contacte un admin pour activer ton accès.",
  signOut: 'Se déconnecter',
  connectionErrorTitle: 'Erreur de connexion',
  connectionErrorBody:
    'Impossible de charger ton profil caster. Vérifie ta connexion internet et réessaie.',
  retry: 'Réessayer',
  docTitle: "Cockpit caster | OW Women's Cup",
  loadingRun: 'Chargement de la run en cours...',
  loadError: 'Erreur de chargement.',
  errorWithStatus: 'Erreur {status}',
  signedOut: 'Tu es déconnecté.',
  sessionExpired: 'Session expirée — reconnexion…',
  wakeLockUnsupported:
    "Ton navigateur peut laisser l'écran s'éteindre — installe la PWA ou garde l'app active.",
});
