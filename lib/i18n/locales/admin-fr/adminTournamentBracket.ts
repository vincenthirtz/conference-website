// lib/i18n/locales/admin-fr/adminTournamentBracket.ts
//
// Traductions FRANCAISES du namespace `adminTournamentBracket` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTournamentBracket', {
  pageTitle: 'Admin · Bracket',
  breadcrumbTournaments: 'Tournois',
  breadcrumbTournament: 'Tournoi {id}',
  breadcrumbBracket: 'Bracket',
  back: '← Retour au tournoi',
  eyebrow: 'Admin · Bracket',
  title: 'Tournoi {id}',
  openBuilder: 'Ouvrir le bracket builder',
  viewMatches: 'Voir les matchs',
  loading: 'Chargement...',
  createHeading: 'Créer un nouveau bracket',
  createDesc:
    'Génère la structure du bracket sans équipes. Les slots pourront être remplis ensuite.',
  bracketTypeLabel: 'Type de bracket',
  singleElim: 'Single Elimination',
  doubleElim: 'Double Elimination',
  slotsLabel: 'Nombre de slots (équipes)',
  roundsSummary: '{rounds} rounds, {matches} matchs au total',
  defaultFormatLabel: 'Format par défaut',
  firstMatchLabel: 'Date et heure du premier match',
  firstMatchHelp:
    'Optionnel. Les horaires pourront aussi être modifiés dans le bracket builder.',
  intervalLabel: 'Intervalle entre les matchs (minutes)',
  grandFinalReset: 'Grand Final Reset',
  grandFinalResetHelp:
    'Si le joueur venant du Loser Bracket gagne la Grande Finale, un match supplémentaire est joué pour départager.',
  structurePreview: 'Aperçu de la structure',
  winnersBracket: 'Winners Bracket',
  losersBracket: 'Losers Bracket',
  roundFinal: 'Finale',
  roundSemi: 'Demi',
  roundQuarter: 'Quarts',
  generating: 'Génération en cours...',
  generateBtn: 'Générer le bracket ({matches} matchs)',
  existsNotice:
    'Un bracket existe déjà pour ce tournoi. Utilisez le bracket builder pour modifier les slots, les dates et les résultats.',
  confirmTitleDouble: 'Générer un bracket Double Elimination de {size} slots ?',
  confirmTitleSingle: 'Générer un bracket Single Elimination de {size} slots ?',
  confirmSubtitle: '{count} matchs au format {format}{reset}.',
  confirmResetSuffix: ', avec grand-final reset',
  confirmLabel: 'Générer',
  errorGenerate: 'Erreur lors de la génération',
  toastCreated: 'Bracket créé avec {count} matchs. Redirection...',
  errorUnknown: 'Erreur inconnue',
});
