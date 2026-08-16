// lib/i18n/locales/fr/scouting.ts
//
// Traductions FRANCAISES du namespace `scouting` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('scouting', {
  title: "Dossier d'adversaire",
  pageTitle: 'Dossier : {team}',
  subtitle:
    'Tout est dérivé de résultats déjà joués. Rien de privé côté adversaire — seules vos propres notes le sont.',
  backToDirectory: "← Retour à l'annuaire",
  loading: 'Chargement du dossier…',
  errorLoad: 'Dossier indisponible.',
  retry: 'Réessayer',
  viewProfile: 'Voir la fiche publique',
  rating: 'Niveau {rating}',
  responseRate: '{rate} % de réponse',
  headToHead: 'Confrontations directes',
  headToHeadSummary:
    '{played} affrontement(s) : {wins} victoire(s), {losses} défaite(s).',
  neverPlayed: 'Vous ne vous êtes jamais affrontées.',
  typeMatch: 'Match',
  typeScrim: 'Scrim',
  win: 'Victoire',
  loss: 'Défaite',
  draw: 'Nul',
  form: 'Forme récente',
  recordSummary:
    '{played} affrontement(s) joué(s) : {wins} victoire(s), {losses} défaite(s).',
  notEnoughData:
    "Pas encore assez d'affrontements pour en tirer quoi que ce soit.",
  commonOpponents: 'Adversaires communs',
  commonOpponentsHint: "Un résultat croisé situe mieux qu'un classement.",
  commonOpponentLine:
    'vous {myWins}-{myLosses} · elles {theirWins}-{theirLosses}',
  usualSlots: 'Créneaux habituels',
  usualSlotsHint:
    "Déduit des heures réellement jouées, pas d'une disponibilité déclarée. Heures en {timezone}.",
  myNotes: 'Vos notes sur cette équipe',
  myNotesHint:
    "Vos revues de match et de scrim contre elles. Privées : personne d'autre ne les voit.",
  watchVod: 'Voir la VOD',
});
