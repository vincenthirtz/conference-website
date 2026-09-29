// pages/api/admin/matches/[matchId]/drafts/[gameIndex]/index.ts — draft d'une partie (lecture / suppression).
// La logique vit dans le module `features/admin/matches`
// (docs/PLAN-industrialisation-admin.md, L3/L7).

export { default } from '@/features/admin/matches/routes/draftById';
