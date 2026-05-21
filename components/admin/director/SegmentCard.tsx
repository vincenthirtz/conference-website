// components/admin/director/SegmentCard.tsx
// Feature: Run-of-show — Lot 3.
// Carte representant un segment dans la timeline. Status badge + actions
// contextuelles selon le statut (Start si upcoming, End si live, etc.).
//
// Drag-and-drop : on utilise les events HTML5 natifs portes par le parent
// TimelineBuilder (drag handle = la zone "::" a gauche). Pas de lib externe
// pour respecter la zero-dependency policy.

import {
  SEGMENT_TYPE_ICON,
  segmentStatusBadgeClasses,
  segmentStatusDotClasses,
  segmentStatusLabel,
  segmentTypeLabel,
} from '@/utils/eventSegmentLabels';
import type { EventSegment } from '@/types/events';

type Props = {
  segment: EventSegment;
  index: number;
  isSelected: boolean;
  isDragging: boolean;
  dragOver: boolean;
  busy: boolean;
  onSelect: () => void;
  onStart: () => void;
  onSkip: () => void;
  onEnd: () => void;
  onDelete: () => void;
  // Drag-and-drop handlers passes par TimelineBuilder.
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onDragLeave: () => void;
};

export default function SegmentCard({
  segment,
  index,
  isSelected,
  isDragging,
  dragOver,
  busy,
  onSelect,
  onStart,
  onSkip,
  onEnd,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onDragLeave,
}: Props) {
  const baseClasses =
    'group relative rounded-xl border bg-neutral-800/60 transition-colors';
  const borderClasses = isSelected
    ? 'border-purple-500/70 ring-2 ring-purple-500/30'
    : 'border-neutral-700/60 hover:border-neutral-600';
  const opacity = isDragging ? 'opacity-40' : 'opacity-100';
  const dragOverIndicator = dragOver
    ? 'before:absolute before:inset-x-0 before:-top-1 before:h-0.5 before:bg-purple-400 before:rounded-full'
    : '';

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onDragLeave={onDragLeave}
      className={`${baseClasses} ${borderClasses} ${opacity} ${dragOverIndicator}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="flex items-stretch gap-3 px-3 py-3">
        {/* Drag handle */}
        <div
          className="flex items-center text-neutral-500 hover:text-neutral-300 cursor-grab active:cursor-grabbing select-none"
          aria-label="Glisser pour reordonner"
          onClick={(e) => e.stopPropagation()}
        >
          <svg
            width="12"
            height="20"
            viewBox="0 0 12 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <circle cx="3" cy="4" r="1.5" />
            <circle cx="3" cy="10" r="1.5" />
            <circle cx="3" cy="16" r="1.5" />
            <circle cx="9" cy="4" r="1.5" />
            <circle cx="9" cy="10" r="1.5" />
            <circle cx="9" cy="16" r="1.5" />
          </svg>
        </div>

        {/* Position */}
        <div className="flex flex-col items-center justify-center px-2 min-w-[2rem] text-xs text-neutral-500 font-mono">
          {String(index + 1).padStart(2, '0')}
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${segmentStatusBadgeClasses(
                segment.status
              )}`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${segmentStatusDotClasses(
                  segment.status
                )}`}
              />
              {segmentStatusLabel(segment.status)}
            </span>
            <span
              className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-neutral-700/70 text-[10px] font-bold text-neutral-200"
              title={segmentTypeLabel(segment.type)}
            >
              {SEGMENT_TYPE_ICON[segment.type] ?? '?'}
            </span>
            <span className="font-medium text-white truncate max-w-[260px]">
              {segment.title}
            </span>
            <span className="text-[11px] text-neutral-500 uppercase tracking-wide">
              {segmentTypeLabel(segment.type)}
            </span>
            {typeof segment.duration_min === 'number' && (
              <span className="text-xs text-neutral-400">
                {segment.duration_min} min
              </span>
            )}
          </div>
          {segment.match_id && (
            <div className="mt-1 text-[11px] text-neutral-500 font-mono truncate">
              match: {segment.match_id}
            </div>
          )}
        </div>

        {/* Actions */}
        <div
          className="flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          {segment.status === 'upcoming' && (
            <>
              <button
                type="button"
                onClick={onStart}
                disabled={busy}
                title="Demarrer ce segment"
                className="px-2 py-1 rounded-md text-xs bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 border border-emerald-500/40 disabled:opacity-50"
              >
                Demarrer
              </button>
              <button
                type="button"
                onClick={onSkip}
                disabled={busy}
                title="Passer ce segment"
                className="px-2 py-1 rounded-md text-xs bg-amber-600/30 hover:bg-amber-600/50 text-amber-200 border border-amber-500/40 disabled:opacity-50"
              >
                Skip
              </button>
            </>
          )}
          {segment.status === 'live' && (
            <button
              type="button"
              onClick={onEnd}
              disabled={busy}
              title="Terminer ce segment"
              className="px-2 py-1 rounded-md text-xs bg-red-600/30 hover:bg-red-600/50 text-red-200 border border-red-500/40 disabled:opacity-50"
            >
              Terminer
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            title="Supprimer ce segment"
            className="px-2 py-1 rounded-md text-xs bg-neutral-700/50 hover:bg-red-700/40 text-neutral-300 hover:text-red-200 border border-neutral-600/40 disabled:opacity-50"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
