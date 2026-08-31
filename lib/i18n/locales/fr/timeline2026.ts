// lib/i18n/locales/fr/timeline2026.ts
//
// Traductions FRANCAISES du namespace `timeline2026` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('timeline2026', {
  heroEyebrow: 'Roadmap 2026',
  heroTitle: "Toutes les étapes jusqu'aux finales 2026",
  heroSubtitle:
    "Le déroulé complet de l'édition : les journées, leurs dates, leurs affiches. Mis à jour à chaque résultat.",
  item1Title: 'Journée internationale contre la transphobie',
  item1Period: 'Mai 2026',
  item1Desc:
    "Le 17 mai, on prend la parole sur la chaîne Twitch officielle : table ronde, témoignages et showmatch caritatif pour soutenir la communauté trans dans l'esport.",
  item1Badge: '17 Mai',
  item2Title: "Été — Préparation de l'événement",
  item2Period: 'Juin 2026',
  item2Desc:
    "Annonces progressives, recrutement staff, partenariats et teasers pour le grand événement féminin d'octobre.",
  followTwitch: 'Suivre sur Twitch ↗',
  registerTeam: 'Inscrire mon équipe ↗',
  calEyebrow: 'Tournoi féminin 2026',
  calTitle: 'Calendrier des matchs',
  calSubtitle:
    "Toutes les rencontres de l'édition féminine, mises à jour en temps réel. Clique sur un match pour ouvrir sa fiche détaillée.",
  viewAllTournament: 'Voir tous les matchs ↗',
  viewStandings: 'Classement ↗',

  // ── Planning : bandes, journées, chiffres ────────────────────────────
  // Le parcours est structuré comme la compétition l'est : des phases, et
  // dans chacune une carte par journée. Ces libellés nomment cette structure.
  phasePreseason: 'Avant-saison',
  phasePreseasonWhen: 'mai → août 2026',
  phaseFinals: 'Finales',
  roundUnnamed: 'Journée',
  roundNext: 'Prochaine',
  roundLive: 'En cours',
  roundDone: 'Terminée',
  roundUpcoming: 'À venir',
  roundProgress: '{played}/{total} joués',
  countdownValue: 'J-{n}',
  countdownLabel: 'avant la {round}',
  statTeams: 'équipes engagées',
  statRounds: 'rendez-vous au programme',
  phaseNoteRounds:
    '{rounds} journées, {perRound} matchs par journée, en {format}. Chaque équipe affronte toutes les autres une fois.',
  phaseNoteSingle: 'En {format}.',
  statMatches: 'matchs joués',
  statMatchesValue: '{played}/{total}',
  statWindow: 'fenêtre de la saison',
  emptyTitle:
    'Le calendrier du tournoi féminin 2026 sera publié dès la fin des inscriptions.',
  emptySub: 'Reviens bientôt ou rejoins le Discord pour être prévenue.',
  teamFallback1: 'Équipe 1',
  teamFallback2: 'Équipe 2',
  bye: '(bye)',
  vs: 'vs',
  statusUpcoming: 'À venir',
  statusOngoing: 'En cours',
  statusFinished: 'Terminé',
  dateTbd: 'Date à définir',
  timeTbd: 'Horaire à confirmer',
  match_one: '{count} match',
  match_other: '{count} matchs',
});
