// pages/api/admin/tournament/[id]/pool.ts — répartition de la liste d'attente regroupée.
// La logique vit dans le module `features/admin/tournaments`
// (docs/PLAN-industrialisation-admin.md, L3/L7).

export { default } from '@/features/admin/tournaments/routes/pool';
export type {
  AdminPoolEntry,
  AdminPoolView,
} from '@/features/admin/tournaments/service/pool';
