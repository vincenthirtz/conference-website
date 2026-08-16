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
      className={`mb-3 rounded-xl px-3 py-2 text-xs border ${
        editing
          ? 'border-amber-500/50 bg-amber-900/25 text-amber-100'
          : 'border-neutral-700 bg-neutral-900/60 text-neutral-300'
      }`}
      data-testid="caster-collab-banner"
    >
      {editing
        ? format(t.collabEditing, { names })
        : format(t.collabShared, { names })}
    </div>
  );
}
