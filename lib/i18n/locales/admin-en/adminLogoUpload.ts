// lib/i18n/locales/admin-en/adminLogoUpload.ts
//
// Traductions ANGLAISES du namespace admin `adminLogoUpload`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminLogoUpload.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  defaultLabel: 'Logo',
  defaultHint:
    'PNG, JPEG, WebP or SVG — max 2 MB (512 KB for SVG), ideally 512×512.',
  errorFormat: 'Unsupported format. Use PNG, JPEG, WebP or SVG.',
  errorTooBig: 'Image too large (max 2 MB).',
  errorSvgTooBig: 'SVG too large (max 512 KB).',
  errorUpload: 'Upload error',
  uploadTab: 'Upload',
  uploading: 'Uploading...',
  dropPrefix: 'Drop an image here or ',
  browse: 'browse',
  previewAlt: 'Logo preview',
  remove: 'Remove',
};
