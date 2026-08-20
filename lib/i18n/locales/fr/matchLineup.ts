// lib/i18n/locales/fr/matchLineup.ts
//
// Traductions FRANCAISES du namespace `matchLineup` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('matchLineup', {
  title: 'Feuille de match',
  intro:
    "Coche les joueuses alignées sur ce match. C'est cette liste qui fera foi pour le classement et en cas de litige — pas le roster du jour où le score est saisi.",
  introValidated: 'Composition déclarée pour ce match.',
  badgeTeam: 'Validée par l’équipe',
  badgeAdmin: 'Validée par le staff',
  validatedAt: 'Validée le {date}.',
  substituteBadge: 'Remplaçante',
  unknownMember: 'Membre',
  goCheckin: 'Faire le check-in',
  save: 'Enregistrer',
  validate: 'Valider la feuille',
  validateHint:
    'Une fois validée, la feuille est figée : seul le staff du tournoi peut la rouvrir.',
});
