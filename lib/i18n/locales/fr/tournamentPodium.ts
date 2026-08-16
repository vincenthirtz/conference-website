// lib/i18n/locales/fr/tournamentPodium.ts
//
// Traductions FRANCAISES du namespace `tournamentPodium` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('tournamentPodium', {
  headTitle: 'Podium · {name}',
  metaDescription: 'Classement final officiel de {name}.',
  backToTournament: '← Retour au tournoi',
  eyebrow: 'Classement final',
  closedOn: 'Tournoi clôturé le {date}',
  medalFirst: '1ʳᵉ place',
  medalSecond: '2ᵉ place',
  medalThird: '3ᵉ place',
  colRank: 'Rang',
  colTeam: 'Équipe',
  colPrize: 'Prix',
  colNotes: 'Notes',
});
