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
  source_scrims_name: 'Scrims à venir',
  source_scrims_desc:
    'Les prochains scrims publics de l’espace (pas seulement ce tournoi). Une ligne par scrim (horaire, logos, équipes) sur fond transparent. Ajoutez &days=N pour l’horizon, &limit=N pour le nombre de lignes, &position=top ou bottom pour les caler en haut ou en bas.',
  source_scrimResult_name: 'Résultat de scrim',
  source_scrimResult_desc:
    'Les deux équipes, le score et le vainqueur, sur fond transparent — pour l’écran de fin de scrim. Suit le scrim en cours, sinon le dernier terminé (moins de 24 h) ; &scrim=<slug> pour en fixer un. Le score apparaît dès qu’il est validé sur le site.',
  source_don_name: 'Faire un don (QR HelloAsso)',
  source_don_desc:
    'Le QR code de don de l’association, le même que la page /don. Ajoutez &layout=corner pour un encart en bas à droite à garder pendant le jeu.',
  source_day_name: 'Matchs du jour',
  source_day_desc:
    'Le programme de la journée (heure de Paris) : horaires, affiches, scores en direct, match du moment mis en avant. Ajoutez &date=AAAA-MM-JJ pour un autre jour, &limit=N pour le nombre de lignes.',
});
