// pages/api/admin/ratings/coverage.ts — couverture du rating joueur.
// La logique vit dans le module `features/admin/ratings`
// (docs/PLAN-industrialisation-admin.md, L3/L7).

export { default } from '@/features/admin/ratings/routes/coverage';
export type { RatingCoverageResponse } from '@/features/admin/ratings/schemas';
