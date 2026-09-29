// pages/api/admin/search.ts — recherche transverse (module features/admin/dashboard).

export { default } from '@/features/admin/dashboard/routes/search';
export type {
  AdminSearchPayload,
  SearchHit,
} from '@/features/admin/dashboard/service/hub';
