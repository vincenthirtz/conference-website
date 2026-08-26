// lib/i18n/locales/fr/scrimLanding.ts
//
// Traductions FRANCAISES du namespace `scrimLanding` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('scrimLanding', {
  badge: 'Scrims ouverts',
  heading: "Affronte une équipe de l'OW Women's Cup",
  subtitle:
    "Tu cherches un match amical pour préparer un tournoi ou tester ta composition ? Propose un scrim à l'une de nos équipes — pas besoin de compte sur le site.",
  step1Title: 'Choisis une équipe',
  step1Body:
    'Parcours nos équipes actives ci-dessous et clique sur celle que tu veux affronter.',
  step2Title: 'Remplis la demande',
  step2Body:
    'Indique ton équipe, un contact (email ou Discord), une date souhaitée et un format. Pas besoin de compte.',
  step3Title: 'Le capitaine répond',
  step3Body:
    'Le capitaine reçoit ta demande et te recontacte directement via le contact que tu as fourni.',
  teamsHeading: 'Nos équipes ({count})',
  viewTournaments: 'Voir les tournois →',
  noTeams: 'Aucune équipe active pour le moment.',
  propose: 'Proposer →',
  openTeamsHeading: 'Équipes ouvertes aux scrims',
  openTeamsEmpty: 'Aucune équipe ouverte aux scrims pour le moment.',
  openTeamsCta: 'Proposer un scrim',
});
