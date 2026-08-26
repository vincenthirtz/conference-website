// lib/i18n/locales/admin-fr/adminJournals.ts
//
// Traductions FRANCAISES du namespace `adminJournals` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminJournals', {
  pageTitle: 'Admin – Journaux',
  heading: 'Journaux',
  subtitle: 'Journaux d’activité du staff, des emails envoyés et du bot Discord.',
  tabsAriaLabel: 'Types de journaux',
  tabStaff: 'Staff',
  tabEmails: 'Emails',
  tabDiscord: 'Discord',
});
