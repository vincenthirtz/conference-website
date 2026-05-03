// components/admin/EmptyState.tsx
// Empty-state cohérent pour les pages admin (listes vides, recherches sans
// résultat). Standardise le look pour éviter que chaque page roule sa propre
// version.

import type { ReactNode } from 'react';

type EmptyStateProps = {
  /** Titre principal (gras, taille moyenne). */
  title: string;
  /** Description courte sous le titre. */
  description?: string;
  /** Icône SVG optionnelle (par défaut : pictogramme générique). */
  icon?: ReactNode;
  /** Action CTA optionnelle (bouton, lien…). */
  action?: ReactNode;
  className?: string;
};

const DEFAULT_ICON = (
  <svg
    className="w-12 h-12"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
    />
  </svg>
);

export default function EmptyState({
  title,
  description,
  icon,
  action,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center px-6 py-12 ${className}`}
    >
      <div className="text-neutral-500 mb-4">{icon ?? DEFAULT_ICON}</div>
      <h3 className="text-base font-semibold text-neutral-200 mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-neutral-400 max-w-md">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
