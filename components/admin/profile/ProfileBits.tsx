// components/admin/profile/ProfileBits.tsx
//
// Petites briques de la modale profil admin (bannière d'erreur, tuile
// clé/valeur), sorties de ProfileModal.tsx — fichier gelé en taille par
// tests/unit/adminFileSizeGuard.test.ts (règle A7) — pour faire de la place
// à la carte de double authentification.

import type { ReactNode } from 'react';

// Bannière d'erreur réutilisable (mutualise l'icône + le style rouge).
export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-4 flex items-center gap-2 rounded-[var(--r-ctrl,4px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] px-4 py-3 text-sm text-[#ffc2c2]">
      <svg
        className="w-5 h-5 text-red-400 flex-shrink-0"
        fill="currentColor"
        viewBox="0 0 20 20"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
          clipRule="evenodd"
        />
      </svg>
      {message}
    </div>
  );
}

export function InfoTile({
  label,
  children,
  className = '',
  mono = false,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  mono?: boolean;
}) {
  return (
    <div
      className={`rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] p-4 ${className}`}
    >
      <div className="mb-1 font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--t3,#a39ba6)] [font-stretch:75%]">
        {label}
      </div>
      <div
        className={
          mono
            ? 'font-mono text-xs text-[var(--t2,#c7bfca)] break-all'
            : 'text-sm font-medium text-[var(--t1,#f4edf7)]'
        }
      >
        {children}
      </div>
    </div>
  );
}
