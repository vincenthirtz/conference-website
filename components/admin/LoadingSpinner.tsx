// components/admin/LoadingSpinner.tsx
// Reusable loading spinner for admin pages

import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminLoadingSpinner from '@/lib/i18n/locales/admin-fr/adminLoadingSpinner';

type LoadingSpinnerProps = {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
};

const SIZE_CLASSES = {
  sm: 'w-5 h-5 border-[1.5px]',
  md: 'w-8 h-8 border-2',
  lg: 'w-12 h-12 border-[3px]',
};

export default function LoadingSpinner({
  className = '',
  size = 'md',
  label,
}: LoadingSpinnerProps) {
  const t = useAdminT(nsAdminLoadingSpinner);
  return (
    <div
      role="status"
      aria-label={label || t.loading}
      className={`flex flex-col items-center justify-center gap-3 ${className}`}
    >
      <div
        aria-hidden="true"
        // Dans l'admin (« Le Ruban ») : piste en filet, tête orchidée. Hors
        // admin (portail développeur), les classes de base restent le rendu.
        className={`${SIZE_CLASSES[size]} border-purple-500/30 border-t-purple-400 [:root:has([data-surface=admin])_&]:border-[var(--line2)] [:root:has([data-surface=admin])_&]:border-t-[var(--or)] rounded-full animate-spin`}
      />
      {label ? (
        <span className="text-sm text-[var(--t3,var(--color-neutral-400))]">
          {label}
        </span>
      ) : (
        <span className="sr-only">{t.loading}</span>
      )}
    </div>
  );
}
