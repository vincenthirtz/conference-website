// lib/i18n/locales/admin-fr/adminMatchTimeline.ts
//
// Traductions FRANCAISES du namespace `adminMatchTimeline` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminMatchTimeline', {
  scoreWithPrev: 'Score : {prev} → {next}',
  scoreOnly: 'Score : {next}',
  forfeit: 'Forfait',
  cancel: 'Annulation',
  delete: 'Suppression',
  meta: 'Métadonnées',
  loading: "Chargement de l'historique…",
  errorLoad: "Impossible de charger l'historique",
  errorNetwork: 'Erreur réseau',
  empty: 'Aucune action enregistrée.',
  more: '+{count} action(s) antérieure(s)',
});
