// components/admin/profile/ProfileSectionCard.tsx
//
// Carte de section de la modale profil admin, sortie de ProfileModal.tsx
// (god-component gelé par tests/unit/adminFileSizeGuard.test.ts) pour que
// d'autres blocs du profil puissent la réutiliser.

import type { ReactNode } from 'react';

export type Accent = 'purple' | 'blue' | 'amber' | 'emerald' | 'red' | 'gray';

// Accents alignés sur StatCard / le dashboard admin (anneau + dégradé).
const ACCENT_RING: Record<Accent, string> = {
  purple: 'ring-purple-500/30 from-purple-500/10',
  blue: 'ring-blue-500/30 from-blue-500/10',
  amber: 'ring-amber-500/30 from-amber-500/10',
  emerald: 'ring-emerald-500/30 from-emerald-500/10',
  red: 'ring-red-500/30 from-red-500/10',
  gray: 'ring-white/10 from-white/[0.06]',
};
const ACCENT_TEXT: Record<Accent, string> = {
  purple: 'text-purple-300',
  blue: 'text-blue-300',
  amber: 'text-amber-300',
  emerald: 'text-emerald-300',
  red: 'text-red-300',
  gray: 'text-neutral-300',
};

// Carte de section — reprend le motif dashboard (anneau + dégradé d'accent).
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
      className={`rounded-2xl bg-neutral-900/40 bg-gradient-to-br to-transparent ring-1 p-6 ${ACCENT_RING[accent]}`}
    >
      <h3 className="mb-4 flex items-center gap-2.5 text-base font-semibold text-white">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06] ring-1 ring-white/10 ${ACCENT_TEXT[accent]}`}
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
