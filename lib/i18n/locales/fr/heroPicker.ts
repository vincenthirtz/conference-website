// lib/i18n/locales/fr/heroPicker.ts
//
// Traductions FRANCAISES du namespace `heroPicker` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('heroPicker', {
  teamADefault: 'Equipe A',
  teamBDefault: 'Equipe B',
  title: 'Test – Hero Picker',
  cooldownBadge: 'Cooldown : {seconds}s',
  banBadge: 'Ban en cours : {seconds}s',
  intro:
    'Petit bac à sable pour tester un picker de héros (inspiré de https://github.com/geddski/overwatch-hero-picker), choisir un favori et simuler des bans pour deux équipes.',
  cooldownBeforeBan: 'Cooldown avant ban',
  waitingSquadTitle: "En attente du reste de l'équipe…",
  waitingSquadBody:
    "Ton vote est enregistré. Le phase ban est verrouillée jusqu'à la validation du squad.",
  favoriteColon: 'Favori :',
  banColon: 'Ban :',
  bannedLabel: 'Bannis :',
  currentPhaseLabel: 'Phase actuelle :',
  phaseFavorite: 'Choix du favori (clic sur une carte)',
  phaseCooldown: 'Cooldown avant ban : {seconds}s',
  phaseBan: 'Choix du ban (clic sur une carte) – {seconds}s restants',
  phaseDone: 'Vote complet',
  favoriteColonCompact: 'Favori:',
  banColonCompact: 'Ban:',
  voteSectionTitle: 'Vote favoris & bans (2 équipes)',
  teamANameLabel: 'Nom équipe A',
  teamBNameLabel: 'Nom équipe B',
  chooseTeam: 'Choisis ta team',
  clickFavorite: 'Clique une carte pour choisir un favori',
  clickBan: 'Clique une carte pour choisir un ban',
  cooldownInProgress: 'Cooldown en cours... {seconds}s',
  voteComplete: 'Vote complet enregistré.',
  votesLabel: '{name} — {count} vote(s)',
  mostVotedBan: 'Ban le plus voté :',
  banVotesInfo: '{hero} ({count} vote(s), {percent}%)',
  noVote: 'Aucun vote.',
});
