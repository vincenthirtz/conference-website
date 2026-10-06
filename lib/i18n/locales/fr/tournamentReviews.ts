// lib/i18n/locales/fr/tournamentReviews.ts
//
// Traductions FRANCAISES du namespace `tournamentReviews` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts`. Toute cle ajoutee ici doit
// l'etre aussi cote anglais : le garde-fou `../parity.ts` casse le typecheck.

import { ns } from '../../ns';

export default ns('tournamentReviews', {
  eyebrow: 'Analyses vidéo',
  heading: 'Reviews',
  intro:
    'Les reviews des matchs du tournoi : analyses, retours et points clés, en vidéo.',
  openPlaylist: 'Voir toute la playlist sur YouTube',
  feedLimitNote:
    'Seules les 15 premières vidéos de la playlist sont affichées ici.',
  empty: 'Aucune vidéo pour le moment. Revenez après les prochains matchs !',
  notFound:
    'La playlist de reviews est introuvable (privée ou supprimée). Les vidéos ne peuvent pas être affichées.',
  error:
    'Les vidéos n’ont pas pu être chargées pour le moment. Réessayez plus tard, ou ouvrez la playlist sur YouTube.',
  play: 'Lire la vidéo « {title} »',
  privacyNote:
    'La lecture charge le lecteur YouTube (youtube-nocookie.com) : rien n’est chargé depuis YouTube avant votre clic.',
  playerTitle: 'Lecteur YouTube : {title}',
  publishedOn: 'Publiée le {date}',
  watchOnYoutube: 'Ouvrir sur YouTube',
  untitled: 'Vidéo sans titre',
});
