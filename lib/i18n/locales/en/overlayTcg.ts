// lib/i18n/locales/en/overlayTcg.ts
//
// Traductions ANGLAISES du namespace `overlayTcg`.
//
// La SOURCE DE VERITE est le francais (`../fr/overlayTcg.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont les
// valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  docTitle: 'TCG overlay',
  invalidToken: 'Invalid overlay token.',
  rejected: 'Overlay not found or revoked.',

  dropEyebrow: 'Drop',
  winEyebrow: 'Win',

  dropLine: '{name} claims a card',
  winLine: '{name} earns a pack',

  anonymous: 'A player',
};
