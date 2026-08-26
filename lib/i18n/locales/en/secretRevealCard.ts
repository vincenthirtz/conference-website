// lib/i18n/locales/en/secretRevealCard.ts
//
// Traductions ANGLAISES du namespace `secretRevealCard`.
//
// La SOURCE DE VERITE est le francais (`../fr/secretRevealCard.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  copiedToast: '{label} copied to the clipboard.',
  copyError: 'Copy failed: copy it manually.',
  title: 'Note these secrets now',
  subtitle:
    "They will never be shown again. Keep them in a secret manager or directly in your bot's config.",
  envSnippetLabel: '.env snippet',
  copy: 'Copy',
  copied: 'Copied!',
  copyBlock: 'Copy the block',
};
