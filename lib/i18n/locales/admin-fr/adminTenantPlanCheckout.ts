// lib/i18n/locales/admin-fr/adminTenantPlanCheckout.ts
//
// Traductions FRANCAISES du namespace `adminTenantPlanCheckout` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTenantPlanCheckout', {
  title: 'Générer un lien de paiement',
  intro:
    'Choisissez le plan à facturer. Un lien de paiement HelloAsso sera généré : copiez-le et envoyez-le au partenaire.',
  planLabel: 'Plan',
  perYear: '/an',
  generate: 'Générer le lien',
  generating: 'Génération…',
  cancel: 'Annuler',
  close: 'Fermer',
  errorGenerate: 'Impossible de générer le lien de paiement.',
  errorOwnerOnly: 'Réservé au rôle Owner.',
  toastGenerated: 'Lien de paiement généré.',
  resultHint:
    'Copiez ce lien et envoyez-le au partenaire. Le plan sera activé automatiquement après paiement.',
  amountLabel: 'Montant',
  linkLabel: 'Lien de paiement',
  copy: 'Copier',
  copied: 'Copié',
  copiedToast: 'Lien copié.',
  copyError: 'Copie impossible.',
});
