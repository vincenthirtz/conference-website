// lib/i18n/locales/admin-en/adminTournamentPrizePool.ts
//
// Traductions ANGLAISES du namespace admin `adminTournamentPrizePool`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTournamentPrizePool.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  headTitle: 'Admin · Prize pool',
  eyebrow: 'Admin · Monetization',
  pageTitle: 'Tournament prize pool',
  intro:
    'Configure the crowdfunded prize pool: seed amount, optional goal and whether contributions are open. Contributions paid via HelloAsso are automatically added to the total.',
  loading: 'Loading…',
  refresh: 'Refresh',
  errorLoad: 'Unable to load the prize pool.',
  errorSave: 'Unable to save the prize pool.',
  noPoolTitle: 'No prize pool for this tournament',
  noPoolText:
    'Create a prize pool to let the public contribute to the cash prize.',
  createCta: 'Create the prize pool',
  configTitle: 'Configuration',
  fieldTitleLabel: 'Prize pool title',
  fieldTitlePlaceholder: 'Tournament cash prize',
  fieldTitleHint: 'Shown publicly. Leave empty for a default title.',
  fieldBaseLabel: 'Seed amount',
  fieldBaseHint: 'Initial amount put up by the organization, in euros.',
  fieldGoalLabel: 'Goal (optional)',
  fieldGoalHint: 'Fundraising goal in euros. Leave empty to hide the goal.',
  fieldGoalPlaceholder: 'No goal',
  fieldIsOpenLabel: 'Contributions open',
  fieldIsOpenHint: 'When disabled, the public can no longer contribute.',
  raisedLabel: 'Raised via contributions',
  raisedHint: 'Automatically fed by payments. Not editable here.',
  baseSummaryLabel: 'Seed amount',
  totalLabel: 'Prize pool total',
  goalProgress: '{percent}% of goal ({goal})',
  save: 'Save',
  saving: 'Saving…',
  toastSaved: 'Prize pool saved.',
  toastCreated: 'Prize pool created.',
  errBaseNegative: 'The seed amount cannot be negative.',
  errBaseInvalid: 'Invalid seed amount.',
  errGoalInvalid: 'Invalid goal.',
  errGoalPositive: 'The goal must be greater than 0.',
  contributionsTitle: 'Contributions',
  contributionsCount_one: '{count} contribution',
  contributionsCount_other: '{count} contributions',
  contributionsEmpty: 'No contributions yet.',
  colDate: 'Date',
  colContributor: 'Contributor',
  colAmount: 'Amount',
  colMessage: 'Message',
  anonymous: 'Anonymous',
  noValue: '—',
};
