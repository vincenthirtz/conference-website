// lib/i18n/locales/admin-fr/adminDashboardSupportTicketsDonut.ts
//
// Traductions FRANCAISES du namespace `adminDashboardSupportTicketsDonut` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminDashboardSupportTicketsDonut', {
  catDispute: 'Litiges',
  catBehavior: 'Comportement',
  catTechnical: 'Technique',
  catOther: 'Autre',
  noTickets: 'Aucun ticket ouvert.',
  open: 'ouverts',
  severityLabel: 'Sévérité :',
  sevHigh: 'Haute {pct}%',
  sevMedium: 'Moyenne {pct}%',
  sevLow: 'Basse {pct}%',
});
