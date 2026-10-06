// lib/i18n/locales/admin-fr/adminTournamentReviews.ts
//
// Traductions FRANCAISES du namespace `adminTournamentReviews` — SOURCE DE
// VERITE. Pendant anglais : `../admin-en/adminTournamentReviews.ts` (parite
// verifiee par `../admin-parity.ts`).

import { adminNs } from '../../ns';

export default adminNs('adminTournamentReviews', {
  title: 'Reviews (YouTube)',
  label: 'Playlist YouTube des reviews',
  placeholder: 'https://www.youtube.com/playlist?list=PL…',
  help: 'Collez l’URL de la playlist ou son identifiant. L’onglet « Reviews » de la page publique n’apparaît que si une playlist est renseignée. Laissez vide pour le masquer.',
  invalid:
    'Ce n’est pas une playlist YouTube valide : il faut une URL contenant « list=… » ou un identifiant de playlist complet.',
  save: 'Enregistrer la playlist',
  saving: 'Enregistrement…',
  saved: 'Playlist des reviews enregistrée.',
  cleared: 'Playlist retirée : l’onglet Reviews est masqué.',
  errorSave: 'Impossible d’enregistrer la playlist.',
  errorLoad: 'Impossible de lire la playlist actuelle.',
  migrationMissing:
    'Réglage indisponible : la migration « tournaments_reviews_playlist » n’a pas encore été appliquée.',
  current: 'Playlist actuelle :',
  openOnYoutube: 'Ouvrir sur YouTube',
  publicDelay:
    'La page publique se met à jour en une minute environ (vidéos : jusqu’à une heure).',
});
