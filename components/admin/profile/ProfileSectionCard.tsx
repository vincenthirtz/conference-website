// components/admin/profile/ProfileSectionCard.tsx
//
// Carte de section de la modale profil admin, sortie de ProfileModal.tsx
// (god-component gelé par tests/unit/adminFileSizeGuard.test.ts) pour que
// d'autres blocs du profil puissent la réutiliser.

import type { ReactNode } from 'react';

export type Accent = 'purple' | 'blue' | 'amber' | 'emerald' | 'red' | 'gray';

// Couleur = signal (« Le Ruban ») : seul l'accent rouge, zone sensible,
// teinte encore la carte ; les autres partagent la surface d'encre.
const FRAME: Record<Accent, string> = {
  purple: 'border-[var(--line2,rgba(194,196,201,.2))]',
  blue: 'border-[var(--line2,rgba(194,196,201,.2))]',
  amber: 'border-[var(--line2,rgba(194,196,201,.2))]',
  emerald: 'border-[var(--line2,rgba(194,196,201,.2))]',
  red: 'border-[rgba(255,107,107,.45)]',
  gray: 'border-[var(--line2,rgba(194,196,201,.2))]',
};

// Carte de section.
export default function SectionCard({
  title,
  icon,
  accent = 'gray',
  children,
}: {
  title: string;
  icon: ReactNode;
  accent?: Accent;
  children: ReactNode;
}) {
  return (
    <section
      className={`rounded-[var(--r-card,14px)] border bg-[var(--s1,#100812)] p-6 ${FRAME[accent]}`}
    >
      <h3 className="mb-4 flex items-center gap-2.5 text-base font-semibold text-[var(--t1,#f4edf7)]">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-[var(--r-ctrl,4px)] bg-[var(--s3,#2f2732)] ${
            accent === 'red'
              ? 'text-[var(--err,#ff6b6b)]'
              : 'text-[var(--or-300,#dea3f6)]'
          }`}
        >
          {icon}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

// Tuile clé/valeur façon StatCard.
