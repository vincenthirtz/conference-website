// lib/i18n/locales/admin-fr/adminQuickBracket.ts
//
// Traductions FRANCAISES du namespace `adminQuickBracket` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminQuickBracket', {
  pageTitle: 'Admin – Quick bracket',
  heading: 'Quick bracket',
  description:
    'Créez un bracket jouable en 30 secondes : un nom, un format, la liste des participants.',
  breadcrumbTournaments: 'Tournois',
  nameLabel: 'Nom du tournoi',
  namePlaceholder: 'Ex. : Coupe du vendredi soir',
  formatLabel: 'Format',
  formatSingleElim: 'Élimination simple',
  formatDoubleElim: 'Élimination double',
  participantsLabel: 'Participants',
  participantsPlaceholder: 'un nom par ligne\nÉquipe Alpha\nÉquipe Bravo\n…',
  participantsHint: 'Un nom par ligne (ou séparés par des virgules).',
  participantCount_one: '{n} participant',
  participantCount_other: '{n} participants',
  bracketSizeHint: 'Bracket à {size}',
  bracketByes_one: '{count} exempt (bye)',
  bracketByes_other: '{count} exempts (byes)',
  boLabel: 'Format des matchs',
  boBo1: 'BO1 (1 map)',
  boBo3: 'BO3 (3 maps)',
  boBo5: 'BO5 (5 maps)',
  submit: 'Générer le bracket',
  submitting: 'Génération…',
  successToast: 'Bracket créé',
  errorMinParticipants: 'Ajoutez au moins 2 participants.',
  errorMaxParticipants: '32 participants maximum.',
  errorDuplicates: 'Participants en double : {names}.',
  errorGeneric: 'Échec de la création du bracket.',
  helperBlurb:
    "Bracket rapide et informel : chaque participant devient une équipe « coquille » (sans roster ni Discord). Vous pourrez l'enrichir plus tard (rosters, Discord, cast) depuis l'administration du tournoi.",
  navCta: 'Quick bracket ⚡',
});
