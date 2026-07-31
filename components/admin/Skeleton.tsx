// components/admin/Skeleton.tsx
//
// DÉPRÉCIÉ — ré-export de `components/ui/Skeleton`.
//
// La primitive a rejoint le kit partagé (S5 de docs/PLAN-espace-unifie.md)
// pour que l'espace joueur puisse l'utiliser sans importer depuis `admin/`.
// Ce fichier évite de toucher les dizaines d'imports existants ; les nouveaux
// appels doivent viser `@/components/ui/Skeleton`.

export {
  Skeleton,
  SkeletonListRow,
  SkeletonCard,
} from '@/components/ui/Skeleton';
