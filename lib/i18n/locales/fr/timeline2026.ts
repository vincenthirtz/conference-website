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
    "Le déroulé complet de l'édition : les soirées de match, leurs horaires, leurs affiches. Mis à jour à chaque résultat.",
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
  viewAllTournament: 'Voir tous les matchs ↗',
  viewStandings: 'Classement ↗',

  // ── Planning : bandes, semaines, soirées, chiffres ───────────────────
  // Le parcours se lit comme un calendrier : des phases, des semaines, et une
  // carte par SOIRÉE de match. La journée (J1…J7) reste en pastille sur chaque
  // match : c'est une ronde d'appariements, pas une date.
  phasePreseason: 'Avant-saison',
  phasePreseasonWhen: 'mai → août 2026',
  phaseFinals: 'Finales',
  weekLabel: 'Semaine {n}',
  eveningNext: 'Prochaine',
  eveningLive: 'En cours',
  eveningDone: 'Terminée',
  eveningUpcoming: 'À venir',
  eveningProgress: '{played}/{total} joués',
  countdownValue: 'J-{n}',
  countdownLabel: 'avant la soirée du {date}',
  countdownTonight: 'Ce soir',
  countdownTonightLabel: 'premier match à {time}',
  statTeams: 'équipes engagées',
  statEvenings: 'soirées de match',
  phaseNoteRounds:
    "{rounds} journées de {perRound} matchs, en {format} : chaque équipe affronte toutes les autres une fois. Une journée est une ronde d'appariements, pas une date — ses matchs se répartissent sur plusieurs soirées.",
  phaseNoteSingle: 'En {format}.',
  statMatches: 'matchs joués',
  statMatchesValue: '{played}/{total}',
  statWindow: 'fenêtre de la saison',
  tzNote: "Tous les horaires sont à l'heure de Paris.",
  tzNoteOther: 'Tous les horaires sont dans le fuseau {tz}.',
  emptyTitle:
    'Le calendrier du tournoi féminin 2026 sera publié dès la fin des inscriptions.',
  emptySub: 'Reviens bientôt ou rejoins le Discord pour être prévenue.',
  teamFallback1: 'Équipe 1',
  teamFallback2: 'Équipe 2',
  bye: '(bye)',
  vs: 'vs',
  dateTbd: 'Date à définir',
  timeTbd: 'Horaire à confirmer',
});
