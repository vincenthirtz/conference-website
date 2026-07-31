// components/admin/Modal.tsx
//
// DÉPRÉCIÉ — ré-export de `components/ui/Modal`.
//
// La primitive a rejoint le kit partagé (S5 de docs/PLAN-espace-unifie.md)
// pour que l'espace joueur puisse l'utiliser sans importer depuis `admin/`.
// Ce fichier évite de toucher les dizaines d'imports existants ; les nouveaux
// appels doivent viser `@/components/ui/Modal`.

export { default } from '@/components/ui/Modal';
export type { ModalSize } from '@/components/ui/Modal';
