// lib/i18n/locales/admin-fr/adminDirectorCueFeed.ts
//
// Traductions FRANCAISES du namespace `adminDirectorCueFeed` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminDirectorCueFeed', {
  relativeNow: "a l'instant",
  relativeSeconds: 'il y a {n}s',
  relativeMinutes: 'il y a {n}min',
  relativeHours: 'il y a {n}h',
  relativeDays: 'il y a {n}j',
  errLoading: 'Erreur de chargement des cues.',
  refreshTitle: 'Rafraichir',
  refreshAria: 'Rafraichir les cues',
  listAria: 'Liste des cues envoyes',
  noCues: 'Aucun cue envoye pour ce run.',
  ackLabel: 'Ack',
  noCasterAssigned: 'Pas de caster assigne au run.',
  retractAction: 'Retracter',
  retractConfirm: 'Retracter ce cue ? Les casters le verront annule.',
  retractedBadge: 'Annule',
  retractSuccess: 'Cue retracte.',
  retractFailed: 'Impossible de retracter le cue.',
  audioBlocked: 'Activer le son',
  audioBlockedHint:
    'Son bloqué : les cues urgents ne joueront aucune alerte sonore.',
});
