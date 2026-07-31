// components/admin/Tabs.tsx
//
// DÉPRÉCIÉ — ré-export de `components/ui/Tabs`.
//
// La primitive a rejoint le kit partagé (S5 de docs/PLAN-espace-unifie.md)
// pour que l'espace joueur puisse l'utiliser sans importer depuis `admin/`.
// Ce fichier évite de toucher les dizaines d'imports existants ; les nouveaux
// appels doivent viser `@/components/ui/Tabs`.

export {
  default,
  tabButtonId,
  tabPanelId,
  useQueryTab,
} from '@/components/ui/Tabs';
export type { TabItem } from '@/components/ui/Tabs';
