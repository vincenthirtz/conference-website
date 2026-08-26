// lib/i18n/locales/admin-fr/adminBotSecretsRevealModal.ts
//
// Traductions FRANCAISES du namespace `adminBotSecretsRevealModal` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminBotSecretsRevealModal', {
  title: 'Nouveaux secrets bot',
  warning:
    'Ces secrets ne seront plus affichés après fermeture de cette modal. Notez-les dans le secret manager du tenant.',
  copied: 'Copié !',
  copy: 'Copier',
  close: "J'ai noté les secrets, fermer",
  copiedToast: '{label} copié dans le presse-papier.',
  copyError: 'Copie impossible : copie le manuellement.',
});
