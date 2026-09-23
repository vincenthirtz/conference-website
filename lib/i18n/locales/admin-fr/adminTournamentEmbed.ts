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
    'Les deux équipes, le score et le vainqueur, sur fond transparent — pour l’écran de fin de scrim. Suit le scrim en cours ; sinon le résultat qui vient de tomber, le prochain scrim du jour (pour régler la scène avant le match) ou le dernier terminé (moins de 24 h) ; &scrim=<slug> pour en fixer un. Le score apparaît dès qu’il est validé sur le site.',
  source_donAlert_name: 'Alerte don (HelloAsso)',
  source_donAlert_desc:
    'Une alerte « Merci pour ce don de 10 € ! » à chaque don HelloAsso reçu par l’association, sur fond transparent — à poser à côté de Streamlabs, qui ne connaît pas HelloAsso. Montant seulement : le nom du donateur n’est jamais affiché (il le saisit pour son reçu fiscal, pas pour l’antenne). Les dons déjà reçus à l’ouverture de la source ne sont pas rejoués. &goal=500 ajoute une jauge (total depuis minuit, ou depuis &from=AAAA-MM-JJ), &gauge=only n’affiche que la jauge, &duration=8 règle la durée d’une alerte (3 à 30 s), &demo=1 envoie de faux dons pour régler la scène.',
  source_regie_name: 'Régie — tout-en-un (recommandé)',
  source_regie_desc:
    'Les alertes, le coup de cœur du public, le bandeau partenaires et le QR de don dans UNE seule source. À préférer aux quatre séparées : quatre sources interrogent le site quatre fois en boucle pendant toute la soirée, celle-ci une seule. Chaque élément se coupe indépendamment — &alertes=0, &mvp=0, &partenaires=0, &don=0 — pour qu’une scène de pause montre le QR sans les alertes, et une scène de jeu l’inverse. &don=carte met le QR en grand au centre. &scale=1.2 agrandit tout, &accent=F0E63C, &tenant=<slug>. Les quatre sources séparées continuent de fonctionner : une scène déjà réglée ne casse pas.',
  source_mvpPublic_name: 'Coup de cœur du public',
  source_mvpPublic_desc:
    'Le vote MVP du public en direct : les candidates, leurs barres, le temps qui reste, puis l’élue une fois le scrutin clos. Les voix du chat Twitch (!mvp <numéro>) et des supporters Discord s’additionnent — c’est un seul public sur deux plateformes. La source suit le vote OUVERT du moment : collez-la une fois pour la soirée, elle n’affiche rien tant qu’aucun scrutin n’est en cours, et garde le résultat trois minutes après la clôture. Le vote s’ouvre et se ferme depuis le cockpit régie, pas d’ici. &position=top ou bottom, &scale=1.4, &limit=6 pour n’afficher que les six premières, &accent=BA18FF.',
  source_alerts_name: 'Boîte d’alertes (Twitch + dons)',
  source_alerts_desc:
    'Subs, réabos, abonnements offerts, bits, follows, raids et dons HelloAsso dans un seul habillage animé, sur fond transparent. Une alerte à la fois, jamais deux fois la même, et rien de ce qui s’est passé avant l’ouverture de la source. Ce qu’elle annonce se règle juste en dessous. Ajoutez &demo=1 pour faire défiler un exemple de chaque type et cadrer la scène, &position=top ou bottom, &scale=1.4.',
  source_partners_name: 'Partenaires',
  source_partners_desc:
    'Les partenaires de l’association en bandeau, sur fond transparent — à poser en bas d’écran. Source conseillée : 1920×160. Un partenaire sans logo affiche son nom. Ajoutez &categories=super,major pour n’en montrer qu’un palier, &limit=N pour le nombre, &position=top ou center pour le caler ailleurs, &heading=0 pour ne garder que les logos.',
  source_don_name: 'Faire un don (QR HelloAsso)',
  source_don_desc:
    'Le QR code de don de l’association, le même que la page /don. Ajoutez &layout=corner pour un encart en bas à droite à garder pendant le jeu.',
  source_day_name: 'Matchs du jour',
  source_day_desc:
    'Le programme de la journée (heure de Paris) : horaires, affiches, scores en direct, match du moment mis en avant. Ajoutez &date=AAAA-MM-JJ pour un autre jour, &limit=N pour le nombre de lignes.',
});
