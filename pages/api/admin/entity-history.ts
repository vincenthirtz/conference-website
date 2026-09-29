// pages/api/admin/entity-history.ts — historique d'une entité (module features/admin/logs).

export { default } from '@/features/admin/logs/routes/entityHistory';
export {
  HISTORY_ENTITY_TYPES,
  type HistoryEntityType,
} from '@/features/admin/logs/schemas';
