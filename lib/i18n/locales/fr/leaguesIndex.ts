// lib/i18n/locales/fr/leaguesIndex.ts
//
// Traductions FRANCAISES du namespace `leaguesIndex` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('leaguesIndex', {
  statusDraft: 'Brouillon',
  statusActive: 'En cours',
  statusFinished: 'Terminée',
  statusArchived: 'Archivée',
  eyebrow: 'Ligues',
  heading: 'Ligues & saisons',
  subtitle:
    'Suivez les classements cumulés sur plusieurs tournois. Les points sont attribués selon le classement final de chaque tournoi de la saison.',
  emptyHeading: 'Aucune ligue publiée',
  emptyBody: "Aucune saison n'est disponible pour le moment. Revenez bientôt !",
  errorHeading: 'Impossible de charger les ligues',
  errorBody: 'Une erreur est survenue. Réessayez dans quelques instants.',
  retry: 'Réessayer',
});
