// pages/api/admin/tournament/[id]/export-results.ts — export des résultats (CSV / JSON).
// La logique vit dans le module `features/admin/tournaments`
// (docs/PLAN-industrialisation-admin.md, L3/L7).

export { default } from '@/features/admin/tournaments/routes/exportResults';
