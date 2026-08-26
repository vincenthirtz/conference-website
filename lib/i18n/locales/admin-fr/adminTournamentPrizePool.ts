// lib/i18n/locales/admin-fr/adminTournamentPrizePool.ts
//
// Traductions FRANCAISES du namespace `adminTournamentPrizePool` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTournamentPrizePool', {
  headTitle: 'Admin · Cagnotte',
  eyebrow: 'Admin · Monétisation',
  pageTitle: 'Cagnotte du tournoi',
  intro:
    "Configurez la cagnotte crowdfundée : montant de départ (seed), objectif optionnel et ouverture des contributions. Les contributions payées via HelloAsso s'ajoutent automatiquement au total.",
  loading: 'Chargement…',
  refresh: 'Rafraîchir',
  errorLoad: 'Impossible de charger la cagnotte.',
  errorSave: "Impossible d'enregistrer la cagnotte.",
  noPoolTitle: 'Aucune cagnotte pour ce tournoi',
  noPoolText:
    'Créez une cagnotte pour permettre au public de contribuer au cash-prize.',
  createCta: 'Créer la cagnotte',
  configTitle: 'Configuration',
  fieldTitleLabel: 'Titre de la cagnotte',
  fieldTitlePlaceholder: 'Cash-prize du tournoi',
  fieldTitleHint:
    'Affiché publiquement. Laissez vide pour un intitulé par défaut.',
  fieldBaseLabel: 'Montant de départ (seed)',
  fieldBaseHint: "Somme initiale mise par l'organisation, en euros.",
  fieldGoalLabel: 'Objectif (optionnel)',
  fieldGoalHint:
    "Objectif de collecte en euros. Laissez vide pour ne pas afficher d'objectif.",
  fieldGoalPlaceholder: 'Aucun objectif',
  fieldIsOpenLabel: 'Contributions ouvertes',
  fieldIsOpenHint: "Quand c'est désactivé, le public ne peut plus contribuer.",
  raisedLabel: 'Collecté via contributions',
  raisedHint: 'Alimenté automatiquement par les paiements. Non modifiable ici.',
  baseSummaryLabel: 'Montant de départ',
  totalLabel: 'Total de la cagnotte',
  goalProgress: "{percent} % de l'objectif ({goal})",
  save: 'Enregistrer',
  saving: 'Enregistrement…',
  toastSaved: 'Cagnotte enregistrée.',
  toastCreated: 'Cagnotte créée.',
  errBaseNegative: 'Le montant de départ ne peut pas être négatif.',
  errBaseInvalid: 'Montant de départ invalide.',
  errGoalInvalid: 'Objectif invalide.',
  errGoalPositive: "L'objectif doit être supérieur à 0.",
  contributionsTitle: 'Contributions',
  contributionsCount_one: '{count} contribution',
  contributionsCount_other: '{count} contributions',
  contributionsEmpty: "Aucune contribution pour l'instant.",
  colDate: 'Date',
  colContributor: 'Contributeur',
  colAmount: 'Montant',
  colMessage: 'Message',
  anonymous: 'Anonyme',
  noValue: '—',
});
