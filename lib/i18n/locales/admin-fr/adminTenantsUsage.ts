// lib/i18n/locales/admin-fr/adminTenantsUsage.ts
//
// Traductions FRANCAISES du namespace `adminTenantsUsage` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts`.

import { adminNs } from '../../ns';

export default adminNs('adminTenantsUsage', {
  pageTitle: "Admin – Consommation d'API",
  breadcrumbAdmin: 'Admin',
  breadcrumbTenants: 'Espaces',
  breadcrumbCurrent: 'Consommation',
  heading: "Consommation d'API",
  subtitle: 'Vue plateforme · mois en cours',
  windowLabel: 'Fenêtre {key}',
  atRisk: '{n} espace(s) au-delà de 80 %',
  loading: 'Chargement des compteurs…',
  emptyTitle: 'Aucun espace',
  emptyDesc: "Rien à mesurer pour le moment.",
  colTenant: 'Espace',
  colPlan: 'Plan',
  colUsage: 'Ce mois-ci',
  colLastCall: 'Dernier appel',
  downgraded: '→ appliqué : {plan}',
  unlimited: '{used} appels — illimité',
  never: 'jamais',
});
