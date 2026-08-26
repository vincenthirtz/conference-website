// lib/i18n/locales/admin-en/adminTenantPlanCheckout.ts
//
// Traductions ANGLAISES du namespace admin `adminTenantPlanCheckout`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTenantPlanCheckout.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  title: 'Generate a payment link',
  intro:
    'Pick the plan to bill. A HelloAsso payment link will be generated: copy it and send it to the partner.',
  planLabel: 'Plan',
  perYear: '/yr',
  generate: 'Generate link',
  generating: 'Generating…',
  cancel: 'Cancel',
  close: 'Close',
  errorGenerate: 'Could not generate the payment link.',
  errorOwnerOnly: 'Owner role only.',
  toastGenerated: 'Payment link generated.',
  resultHint:
    'Copy this link and send it to the partner. The plan will be activated automatically after payment.',
  amountLabel: 'Amount',
  linkLabel: 'Payment link',
  copy: 'Copy',
  copied: 'Copied',
  copiedToast: 'Link copied.',
  copyError: 'Copy failed.',
};
