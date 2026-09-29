// components/admin/caster/CasterCollabBanner.tsx
//
// Avertissement d'édition simultanée (lot 5) — port de renderCollabBanner du
// desktop (womenscup-caster/src/renderer/tabs/chat.js).
//
// Affiché DANS le panneau d'édition, là où le caster tape : un collègue avec la
// même scène ouverte signifie que les sauvegardes peuvent s'écraser. Purement
// CONSULTATIF — aucun verrou dur : en direct, on doit toujours pouvoir corriger
// une faute immédiatement.

import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { CasterPresenceUser } from '@/types/caster';
import nsAdminCasterScenes from '@/lib/i18n/locales/admin-fr/adminCasterScenes';

type Props = {
  /** Autres casters (self exclu) ayant la scène courante ouverte. */
  others: CasterPresenceUser[];
};

export default function CasterCollabBanner({ others }: Props) {
  const t = useAdminT(nsAdminCasterScenes);
  if (others.length === 0) return null;

  // Un champ focalisé (activeField, trackné par le desktop) = édition imminente.
  const editing = others.some((u) => u.activeField);
  const names = others.map((u) => u.displayName).join(', ');

  return (
    <div
      role="status"
      className={`mb-3 rounded-[var(--r-ctrl,4px)] px-3 py-2 text-xs border ${
        editing
          ? 'border-[rgba(245,165,36,.38)] bg-[rgba(245,165,36,.08)] text-[#ffd9a3]'
          : 'border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] text-[var(--t2,#c7bfca)]'
      }`}
      data-testid="caster-collab-banner"
    >
      {editing
        ? format(t.collabEditing, { names })
        : format(t.collabShared, { names })}
    </div>
  );
}
