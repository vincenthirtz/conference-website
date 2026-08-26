// lib/i18n/locales/fr/briefingPanel.ts
//
// Traductions FRANCAISES du namespace `briefingPanel` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en/<ns>.ts` (recompose en un chunk unique,
// charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('briefingPanel', {
  matchNotFound: 'Match introuvable pour ton tenant.',
  errorWithStatus: 'Erreur {status}',
  loadError: 'Erreur de chargement.',
  briefingLabel: 'Briefing',
  loadingBriefing: 'Chargement du briefing...',
  briefingTitle: 'Briefing match',
  noRoster: 'Pas de roster importé',
  teamUnavailable: 'Équipe indisponible',
  h2hLabel: 'H2H',
  noPreviousMeeting: 'Pas de rencontre précédente entre ces équipes.',
  meetings_one: '{count} rencontre',
  meetings_other: '{count} rencontres',
  drawsSuffix: ' • {count} nuls',
  recentNews: 'News récentes',
});
