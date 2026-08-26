// lib/i18n/locales/fr/castViewer.ts
//
// Traductions FRANCAISES du namespace `castViewer` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('castViewer', {
  statusUpcoming: 'À VENIR',
  statusOngoing: 'EN COURS',
  statusFinished: 'TERMINÉ',
  statusWalkover: 'FORFAIT',
  docTitle: 'Cast — {team1} vs {team2}',
  errorTitle: 'Erreur',
  urlInvalidHttp: 'URL invalide (http/https requis)',
  urlInvalid: 'URL invalide',
  errorGeneric: 'Erreur',
  replaySaved: 'Replay enregistré.',
  casterConnected: 'Caster connecté',
  autoRefresh: 'Auto-refresh ({seconds}s)',
  updatedLabel: 'MAJ',
  lobbyCode: 'Code lobby',
  copyHint: 'Cliquer pour copier',
  undefinedValue: 'non défini',
  copied: 'copié ✓',
  streamLink: '↗ Stream',
  rosters: 'Rosters',
  veto: 'Veto',
  stepProgress: 'Étape {current} / {total}',
  vetoComplete: '✓ terminé',
  mapsInPlay: 'Cartes en jeu',
  decider: 'Decider',
  headToHead: 'Head-to-head',
  noPreviousMatch: 'Aucune confrontation préalable.',
  matchCount_one: '{count} match',
  matchCount_other: '{count} matchs',
  lastMeetings: 'Dernières confrontations',
  notes: 'Notes',
  replayVod: 'Replay / VOD',
  openCurrentReplay: 'Ouvrir le replay actuel ↗',
  saving: 'Enregistrement…',
  save: 'Enregistrer',
  replayHint:
    'Colle ici le lien YouTube ou Twitch du VOD post-match. Il sera affiché publiquement sur la page du match.',
  noRoster: 'Pas de roster',
  sub: 'sub',
  captain: 'Capitaine',
  manager: 'Manager',
  auto: 'Auto',
});
