// lib/i18n/locales/admin-fr/adminTournamentEmbed.ts
//
// Traductions FRANCAISES du namespace `adminTournamentEmbed` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTournamentEmbed', {
  panelTitle: 'Embed / Widgets',
  panelDescription:
    'Copiez-collez ces extraits iframe pour intégrer les widgets du tournoi sur un site externe.',
  show: 'Afficher',
  hide: 'Masquer',
  themeLabel: 'Thème',
  themeLight: 'Clair',
  themeDark: 'Sombre',
  snippetLabel: 'Extrait iframe',
  copyBtn: 'Copier',
  copiedBtn: 'Copié',
  copiedToast: 'Snippet copié',
  openWidget: 'Ouvrir le widget',
  bracketName: 'Arbre',
  bracketDesc: "L'arbre du tournoi (bracket) avec les scores et l'avancement.",
  standingsName: 'Classement',
  standingsDesc: 'Le classement des équipes (victoires, défaites, points).',
  scheduleName: 'Planning',
  scheduleDesc: 'Le planning des matchs à venir et terminés.',

  // Sources de stream (OBS) — cf. components/admin/tournament/StreamSourcesPanel.
  sourcesTitle: 'Sources de stream (OBS)',
  sourcesDescription:
    'Dans OBS, ajoutez une source « Navigateur » et collez l’URL. Elle suit le match du moment : inutile d’y revenir entre deux rencontres.',
  sourcesHint:
    'Remplacez « next » par l’identifiant d’un match pour figer une source sur cette rencontre. Ajoutez &scale=1.25 pour agrandir, &accent=RRGGBB pour changer la couleur, &theme=light pour l’écran d’attente en clair.',
  sourcesLockedBody:
    'Les sources de stream par match font partie de l’offre Régie. Votre espace est en {plan}.',
  sourcesLockedCta: 'Voir les offres',
  source_scoreboard_name: 'Tableau de score',
  source_scoreboard_desc:
    'Bandeau haut : équipes, score, format et état du match.',
  source_teams_name: 'Présentation des équipes',
  source_teams_desc:
    'Carte plein cadre avant le coup d’envoi : logos et affiche.',
  source_maps_name: 'Maps et veto',
  source_maps_desc:
    'Les manches jouées avec leur score, ou le veto tant qu’aucune manche n’existe.',
  source_countdown_name: 'Compte à rebours',
  source_countdown_desc:
    'Décompte jusqu’au coup d’envoi, sur l’heure du serveur.',
  source_waiting_name: 'Écran d’attente',
  source_waiting_desc: 'Fond opaque avec votre marque, entre deux rencontres.',
});
