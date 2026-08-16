// lib/i18n/locales/admin-fr/adminDirectorAddSegmentModal.ts
//
// Traductions FRANCAISES du namespace `adminDirectorAddSegmentModal` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminDirectorAddSegmentModal', {
  titleRequired: 'Le titre est obligatoire.',
  matchIdRequired:
    'Pour un segment de type "match", un match_id (UUID) valide est obligatoire.',
  durationPositive: 'La duree doit etre un entier positif (en minutes).',
  createFailed: 'Creation echouee.',
  heading: 'Ajouter un segment',
  subtitle: 'Le segment sera ajoute en fin de timeline.',
  typeLabel: 'Type',
  titleLabel: 'Titre',
  matchLabel: 'Match',
  matchHint:
    "Recherche par nom d'equipe ou de tournoi. Seuls les matches a venir ou non planifies apparaissent.",
  matchPlaceholder: 'Quart 1 : Team A vs Team B',
  durationLabel: 'Duree prevue (minutes)',
  durationPlaceholder: 'ex: 30',
  cancel: 'Annuler',
  submitting: 'Ajout…',
  submit: 'Ajouter',
});
