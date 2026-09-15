// lib/i18n/locales/fr/matchPrediction.ts
//
// Traductions FRANCAISES du namespace `matchPrediction` — SOURCE DE VERITE.
// Toute cle ajoutee ici doit l'etre aussi dans `../en/matchPrediction.ts`
// (garde-fou de compilation : `locales/parity.ts`).
//
// Les PRONOSTICS sur les matchs de tournoi : la carte de la page match
// (`components/predictions/MatchPredictionCard.tsx`) et le panneau de la page
// TCG (`components/predictions/PredictionsPanel.tsx`). Vocabulaire du
// pronostic, JAMAIS du pari : pas de « mise », pas de « parier », pas de
// « cote ». Aucune piece n'est engagee, et le texte doit le dire.

import { ns } from '@/lib/i18n/ns';

export default ns('matchPrediction', {
  title: 'Pronostic',
  intro:
    'Qui va gagner ? Un pronostic juste rapporte {coins} pièces pour ton TCG. C’est gratuit : tu n’engages aucune pièce.',
  introAnonymous:
    'Qui va gagner ? Un pronostic juste rapporte des pièces pour ton TCG. C’est gratuit : tu n’engages aucune pièce.',
  signIn: 'Se connecter pour pronostiquer',
  pickTeam: 'Je vois {team} gagner',
  yourPick: 'Ton pronostic : {team}',
  changeHint: 'Tu peux changer d’avis jusqu’au début du match.',
  locksAt: 'Fermeture des pronostics : {date}',
  remove: 'Retirer mon pronostic',
  locked: 'Les pronostics sont fermés pour ce match.',
  noPick: 'Tu n’as pas pronostiqué ce match.',
  resultWon: 'Pronostic juste : +{coins} pièces',
  resultLost: 'Pronostic manqué',
  resultVoid: 'Pronostic sans suite : forfait ou match annulé',
  resultPending: 'En attente du résultat',
  ineligibleParticipant:
    'Tu es dans l’une des deux équipes : pas de pronostic sur tes propres matchs.',
  ineligibleStaff: 'Le staff ne pronostique pas : il saisit les scores.',
  distributionTitle: 'Répartition des pronostics',
  distributionCount_one: '{count} pronostic',
  distributionCount_other: '{count} pronostics',
  saved: 'Pronostic enregistré',
  removed: 'Pronostic retiré',
  errorLocked: 'Trop tard : les pronostics viennent de fermer.',
  errorGeneric: 'Pronostic impossible pour le moment. Réessaie.',
  loadError: 'Impossible de charger le pronostic.',
  panelTitle: 'Pronostics',
  openTitle: 'À pronostiquer',
  openEmpty: 'Aucun match à venir n’est ouvert aux pronostics.',
  recentTitle: 'Mes pronostics',
  recentEmpty: 'Tu n’as encore rien pronostiqué.',
  versus: 'contre',
  teamUnknown: 'À déterminer',
  seeMatch: 'Voir le match',
  panelLoadError: 'Impossible de charger les pronostics.',
});
