// lib/i18n/locales/admin-fr/adminAdvancementRulesEditor.ts
//
// Traductions FRANCAISES du namespace `adminAdvancementRulesEditor` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminAdvancementRulesEditor', {
  seedByStandings: 'Classement (automatique)',
  seedByManual: 'Manuel',
  seedByNone: 'Sans seed',
  enableLabel: "Configurer l'avancement automatique",
  targetStageLabel: 'Phase cible',
  noOtherStage:
    "Aucune autre phase disponible. Créez d'abord la phase suivante dans le tournoi.",
  selectPlaceholder: '— Sélectionner —',
  modeLabel: "Mode d'avancement",
  modeTopGlobal: 'Top N global (toutes poules confondues)',
  modePerGroup: 'Top N par poule (recommandé pour group stage)',
  perGroupCountLabel: "Nombre d'équipes qui avancent par poule",
  perGroupHintPre: 'Les N premières équipes de ',
  perGroupHintStrong: 'chaque',
  perGroupHintPost: ' poule seront avancées.',
  topCountLabel: "Nombre d'équipes qui avancent",
  topHint:
    'Les N premières équipes du classement seront avancées vers la phase cible.',
  seedModeLabel: 'Mode de seeding',
});
