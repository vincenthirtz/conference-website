// components/ui/Skeleton.tsx
// Primitives de skeleton loaders du kit partagé (look admin). À utiliser pendant
// le chargement initial des listes/cards plutôt qu'un spinner plein écran
// (perception de performance améliorée + layout shift réduit).

type SkeletonProps = {
  className?: string;
  /** Coins arrondis (défaut : 'rounded-md'). */
  rounded?: string;
};

/**
 * Bloc gris animé. À combiner via `className` (largeur, hauteur, marges).
 *
 * Exemple :
 *   <Skeleton className="h-6 w-48 mb-2" />
 *   <Skeleton className="h-4 w-full" />
 */
export function Skeleton({
  className = '',
  rounded = 'rounded-md',
}: SkeletonProps) {
  return (
    <div
      className={`bg-neutral-700/40 animate-pulse ${rounded} ${className}`}
      aria-hidden="true"
    />
  );
}

/**
 * Skeleton "ligne de liste" : utilisé pour pré-afficher la structure d'une
 * row d'admin (avatar/icône + 2 lignes texte).
 */
export function SkeletonListRow({ className = '' }: { className?: string }) {
  return (
    <div
      className={`flex items-center gap-3 p-3 bg-neutral-900/50 border border-neutral-700/40 rounded-xl ${className}`}
      aria-hidden="true"
    >
      <Skeleton className="w-10 h-10 shrink-0" rounded="rounded-xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-1/4" />
      </div>
    </div>
  );
}

/**
 * Skeleton "carte" : titre + 3 lignes.
 */
export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div
      className={`p-4 bg-neutral-900/50 border border-neutral-700/40 rounded-xl space-y-3 ${className}`}
      aria-hidden="true"
    >
      <Skeleton className="h-5 w-2/5" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
    </div>
  );
}
