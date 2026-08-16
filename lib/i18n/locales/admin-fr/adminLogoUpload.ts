// lib/i18n/locales/admin-fr/adminLogoUpload.ts
//
// Traductions FRANCAISES du namespace `adminLogoUpload` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminLogoUpload', {
  defaultLabel: 'Logo',
  defaultHint: 'PNG, JPEG ou WebP, max 2 Mo, idéalement 512×512.',
  errorFormat: 'Format non supporté. Utilise PNG, JPEG ou WebP.',
  errorTooBig: 'Image trop lourde (max 2 Mo).',
  errorUpload: "Erreur lors de l'upload",
  uploadTab: 'Upload',
  uploading: 'Upload en cours...',
  dropPrefix: 'Glisse une image ici ou ',
  browse: 'parcourir',
  previewAlt: 'Preview logo',
  remove: 'Supprimer',
});
