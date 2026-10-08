// lib/i18n/locales/admin-fr/adminRegieLayout.ts
//
// Traductions FRANCAISES du namespace admin `adminRegieLayout`.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` ; le garde-fou
// `../admin-parity.ts` casse le typecheck si une cle manque d'un cote.

import { adminNs } from '../../ns';

export default adminNs('adminRegieLayout', {
  title: 'Mise en page de la source Régie',
  subtitle:
    'La source /overlay/regie est plein écran (1920×1080) : placez chaque élément ici. Faites glisser un bloc dans l’aperçu, ou réglez-le au pixel. La source applique la mise en page à son rafraîchissement (~10 s).',
  previewLabel: 'Aperçu de la scène 1920×1080',
  el_alerts: 'Alertes',
  el_tcg: 'Drops TCG',
  el_mvp: 'Sondage MVP',
  el_partners: 'Partenaires',
  el_don: 'QR de don',
  visible: 'Affiché',
  hidden: 'masqué',
  anchorLabel: 'Ancrage',
  anchor_tl: 'En haut à gauche',
  anchor_tc: 'En haut au centre',
  anchor_tr: 'En haut à droite',
  anchor_ml: 'Au milieu à gauche',
  anchor_mc: 'Au centre',
  anchor_mr: 'Au milieu à droite',
  anchor_bl: 'En bas à gauche',
  anchor_bc: 'En bas au centre',
  anchor_br: 'En bas à droite',
  offsetX: 'Décalage X (px)',
  offsetY: 'Décalage Y (px)',
  scaleLabel: 'Taille : {pct} %',
  resetElement: 'Remettre cet élément par défaut',
  resetAll: 'Tout remettre par défaut',
  cancel: 'Annuler les modifications',
  save: 'Enregistrer la mise en page',
  saved: 'Mise en page enregistrée — la source l’applique sous ~10 s',
  errorLoad: 'Impossible de charger la mise en page.',
  errorSave: 'Enregistrement impossible.',
  testObs: 'Tout afficher dans OBS pour caler',
  testObsHint:
    'Lance une alerte de test et le sondage MVP de test dans la source : de quoi ajuster la scène sur le vrai rendu.',
  testObsDone: 'Alerte et sondage de test envoyés à la source',
  testObsError: 'Test impossible.',
  readOnly:
    'Lecture seule : la mise en page est réservée à la gestion de la diffusion.',
  unsaved: 'Modifications non enregistrées',
});
