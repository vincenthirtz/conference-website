/* eslint-disable @next/next/no-img-element */
// components/admin/tournament/mapPool/MapPoolGrid.tsx
//
// Grille des cartes du pool édité, avec édition et suppression par carte.
// Extrait de `pages/admin/tournament/[id]/maps.tsx` (règle A7 : tout lot qui
// touche un écran trop gros en sort un panneau).

import { useState } from 'react';
import type { TournamentMapRow } from './types';
import { typeLabel } from './types';

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
          className="rounded-xl bg-white/5 border border-white/10 overflow-hidden relative group"
        >
          {m.image_url && !brokenImages.has(m.id) && (
            <div className="relative w-full h-40 bg-gradient-to-b from-purple-900/20 to-transparent">
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
                <p className="text-sm font-semibold">{m.map_name}</p>
                <p className="text-xs text-gray-400">
                  {typeLabel(typeLabels, m.map_type)}
                  {m.map_slug ? ` • ${m.map_slug}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onEdit(m)}
                  className="px-2 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 text-blue-200 text-xs transition-colors flex-shrink-0"
                  title={labels.editTitle}
                >
                  ✎
                </button>
                <button
                  onClick={() => onDelete(m.id)}
                  disabled={deletingId === m.id}
                  className="px-2 py-1 rounded-lg bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 text-red-200 text-xs transition-colors disabled:opacity-50 flex-shrink-0"
                  title={labels.deleteTitle}
                >
                  {deletingId === m.id ? '...' : '✕'}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span
                className={`px-2 py-0.5 rounded-full text-xs border ${
                  m.enabled
                    ? 'border-emerald-400/50 text-emerald-200'
                    : 'border-gray-500/50 text-gray-300'
                }`}
              >
                {m.enabled ? labels.enabled : labels.disabled}
              </span>
              <span className="text-xs text-gray-400">
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
