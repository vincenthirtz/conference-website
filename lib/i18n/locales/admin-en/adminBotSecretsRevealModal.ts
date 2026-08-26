// lib/i18n/locales/admin-en/adminBotSecretsRevealModal.ts
//
// Traductions ANGLAISES du namespace admin `adminBotSecretsRevealModal`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminBotSecretsRevealModal.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  title: 'New bot secrets',
  warning:
    "These secrets won't be shown again after closing this modal. Store them in the tenant's secret manager.",
  copied: 'Copied!',
  copy: 'Copy',
  close: "I've stored the secrets, close",
  copiedToast: '{label} copied to clipboard.',
  copyError: 'Copy failed: copy it manually.',
};
