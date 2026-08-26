// lib/i18n/locales/admin-en/adminAdvancementRulesEditor.ts
//
// Traductions ANGLAISES du namespace admin `adminAdvancementRulesEditor`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminAdvancementRulesEditor.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  seedByStandings: 'Standings (automatic)',
  seedByManual: 'Manual',
  seedByNone: 'No seed',
  enableLabel: 'Configure automatic advancement',
  targetStageLabel: 'Target stage',
  noOtherStage:
    'No other stage available. Create the next stage in the tournament first.',
  selectPlaceholder: '— Select —',
  modeLabel: 'Advancement mode',
  modeTopGlobal: 'Top N global (across all groups)',
  modePerGroup: 'Top N per group (recommended for group stage)',
  perGroupCountLabel: 'Number of teams advancing per group',
  perGroupHintPre: 'The top N teams from ',
  perGroupHintStrong: 'each',
  perGroupHintPost: ' group will advance.',
  topCountLabel: 'Number of teams advancing',
  topHint: 'The top N teams in the standings will advance to the target stage.',
  seedModeLabel: 'Seeding mode',
};
