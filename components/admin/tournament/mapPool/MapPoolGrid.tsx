/* biome-ignore-all lint/performance/noImgElement: image hors next/image (exclusion reprise d’ESLint) */
// components/admin/tournament/mapPool/MapPoolGrid.tsx
//
// Grille des cartes du pool édité, avec édition et suppression par carte.
// Extrait de `pages/admin/tournament/[id]/maps.tsx` (règle A7 : tout lot qui
// touche un écran trop gros en sort un panneau).

import { useState } from 'react';
import type { TournamentMapRow } from './types';
import { typeLabel } from './types';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';

type Labels = {
  editTitle: string;
  deleteTitle: string;
  enabled: string;
  disabled: string;
  /** Contient `{order}`. */
  orderLabel: string;
};

type Props = {
  maps: TournamentMapRow[];
  typeLabels: Record<string, string>;
  labels: Labels;
  deletingId: string | null;
  onEdit: (map: TournamentMapRow) => void;
  onDelete: (mapId: string) => void;
};

export default function MapPoolGrid({
  maps,
  typeLabels,
  labels,
  deletingId,
  onEdit,
  onDelete,
}: Props) {
  // Repli d'image géré par état React, jamais par mutation impérative du DOM.
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());

  function markImageBroken(id: string) {
    setBrokenImages((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  const sorted = maps
    .slice()
    .sort(
      (a, b) =>
        (a.order_index ?? 0) - (b.order_index ?? 0) ||
        a.map_name.localeCompare(b.map_name)
    );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {sorted.map((m, idx) => (
        <div
          key={m.id || `${m.map_name}-${idx}`}
          className="group relative overflow-hidden rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)]"
        >
          {m.image_url && !brokenImages.has(m.id) && (
            <div className="relative h-40 w-full bg-[var(--s2,#1d1520)]">
              <img
                src={m.image_url}
                alt={m.map_name}
                width={640}
                height={160}
                loading="lazy"
                className="w-full h-full object-cover"
                onError={() => markImageBroken(m.id)}
              />
            </div>
          )}

          <div className="p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex-1">
                <p className="text-sm font-semibold text-[var(--t1,#f4edf7)]">
                  {m.map_name}
                </p>
                <p className="text-xs text-[var(--t3,#a39ba6)]">
                  {typeLabel(typeLabels, m.map_type)}
                  {m.map_slug ? ` • ${m.map_slug}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <AdminButton
                  size="xs"
                  className="!px-2"
                  onClick={() => onEdit(m)}
                  title={labels.editTitle}
                >
                  ✎
                </AdminButton>
                <AdminButton
                  variant="danger"
                  size="xs"
                  className="!px-2"
                  onClick={() => onDelete(m.id)}
                  disabled={deletingId === m.id}
                  title={labels.deleteTitle}
                >
                  {deletingId === m.id ? '...' : '✕'}
                </AdminButton>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <Chip tone={m.enabled ? 'ok' : 'neutral'}>
                {m.enabled ? labels.enabled : labels.disabled}
              </Chip>
              <span className="font-mono text-xs text-[var(--t3,#a39ba6)]">
                {labels.orderLabel.replace(
                  '{order}',
                  String(m.order_index ?? '—')
                )}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
