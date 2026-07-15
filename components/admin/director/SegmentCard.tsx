// components/admin/director/SegmentCard.tsx
// Feature: Run-of-show — Lot 3.
// Carte representant un segment dans la timeline. Status badge + actions
// contextuelles selon le statut (Start si upcoming, End si live, etc.).
//
// Drag-and-drop : on utilise les events HTML5 natifs portes par le parent
// TimelineBuilder (drag handle = la zone "::" a gauche). Pas de lib externe
// pour respecter la zero-dependency policy.

import { useAdminT, format } from '@/lib/i18n/useAdminT';
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
  /**
   * Verrouille le drag : un segment `live`/`done` ne se reordonne pas (metier)
   * et n'est pas une cible de drop. On retire la poignee et on desactive
   * draggable. Le parent (TimelineBuilder) refuse aussi le drop dessus.
   */
  locked?: boolean;
  /** ISO planifie (Lot 6). Si null, on n'affiche pas d'horaire. */
  plannedStartAt?: string | null;
  /** True si planned_start_at vient d'un override Director. */
  isAnchored?: boolean;
  /** Overrun en secondes (>0 si depassement). Active visuel amber. */
  overrunSec?: number;
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

function formatHHMM(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return null;
  }
}

function formatOverrun(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `+${m}:${String(s).padStart(2, '0')}`;
}

export default function SegmentCard({
  segment,
  index,
  isSelected,
  isDragging,
  dragOver,
  busy,
  locked = false,
  plannedStartAt,
  isAnchored,
  overrunSec,
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
  const t = useAdminT('adminDirectorSegmentCard');
  const hasOverrun = !!overrunSec && overrunSec > 0;
  const baseClasses =
    'group relative rounded-xl border bg-neutral-800/60 transition-colors';
  const overrunRing = hasOverrun
    ? 'ring-2 ring-amber-400/60 animate-pulse'
    : '';
  const borderClasses = isSelected
    ? 'border-purple-500/70 ring-2 ring-purple-500/30'
    : hasOverrun
      ? 'border-amber-500/70'
      : 'border-neutral-700/60 hover:border-neutral-600';
  const opacity = isDragging ? 'opacity-40' : 'opacity-100';
  const dragOverIndicator = dragOver
    ? 'before:absolute before:inset-x-0 before:-top-1 before:h-0.5 before:bg-purple-400 before:rounded-full'
    : '';
  const plannedHHMM = formatHHMM(plannedStartAt);

  return (
    <div
      draggable={!locked}
      onDragStart={locked ? undefined : onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={locked ? undefined : onDragEnd}
      onDragLeave={onDragLeave}
      className={`${baseClasses} ${borderClasses} ${opacity} ${dragOverIndicator} ${overrunRing}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      data-testid={`segment-card-${segment.id}`}
      data-segment-type={segment.type}
      data-segment-status={segment.status}
      data-segment-ord={segment.ord}
      data-segment-locked={locked ? 'true' : 'false'}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="flex items-stretch gap-3 px-3 py-3">
        {/* Drag handle — remplace par un cadenas quand le segment est verrouille
            (live/done) : pas de reordonnancement possible. */}
        {locked ? (
          <div
            className="flex items-center text-neutral-600 cursor-not-allowed select-none"
            aria-label={t.lockedAria}
            title={t.lockedAria}
            data-testid={`segment-lock-${segment.id}`}
            onClick={(e) => e.stopPropagation()}
          >
            <svg
              width="12"
              height="20"
              viewBox="0 0 14 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M4 8V6a3 3 0 0 1 6 0v2h.5A1.5 1.5 0 0 1 12 9.5v6A1.5 1.5 0 0 1 10.5 17h-7A1.5 1.5 0 0 1 2 15.5v-6A1.5 1.5 0 0 1 3.5 8H4zm1.5 0h3V6a1.5 1.5 0 0 0-3 0v2z" />
            </svg>
          </div>
        ) : (
          <div
            className="flex items-center text-neutral-500 hover:text-neutral-300 cursor-grab active:cursor-grabbing select-none"
            aria-label={t.dragHandleAria}
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
        )}

        {/* Position */}
        <div className="flex flex-col items-center justify-center px-2 min-w-[2rem] text-xs text-neutral-500 font-mono">
          {String(index + 1).padStart(2, '0')}
        </div>

        {/* Horaire planifie (Lot 6) — gauche du titre, monospace */}
        {plannedHHMM && (
          <div
            className="flex items-center justify-center px-1 min-w-[3.5rem] text-[11px] text-neutral-300 font-mono gap-1"
            data-testid={`segment-time-${segment.id}`}
            title={isAnchored ? t.anchorTitle : t.computedTitle}
          >
            {isAnchored && (
              <svg
                width="10"
                height="12"
                viewBox="0 0 10 12"
                fill="currentColor"
                aria-hidden="true"
                className="text-amber-300"
                data-testid={`segment-anchor-icon-${segment.id}`}
              >
                <path d="M2 5h6v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5zm1.5-3.5a1.5 1.5 0 1 1 3 0V5h-3V1.5z" />
              </svg>
            )}
            <span>{plannedHHMM}</span>
          </div>
        )}

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
            {hasOverrun && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold text-amber-100 bg-amber-500/30 border border-amber-400/60"
                data-testid={`segment-overrun-${segment.id}`}
                data-overrun-sec={Math.floor(overrunSec ?? 0)}
                title={format(t.overrunTitle, {
                  value: formatOverrun(overrunSec ?? 0),
                })}
              >
                {formatOverrun(overrunSec ?? 0)}
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
                title={t.startTitle}
                data-testid={`segment-start-${segment.id}`}
                className="px-2 py-1 rounded-md text-xs bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 border border-emerald-500/40 disabled:opacity-50"
              >
                {t.start}
              </button>
              <button
                type="button"
                onClick={onSkip}
                disabled={busy}
                title={t.skipTitle}
                data-testid={`segment-skip-${segment.id}`}
                className="px-2 py-1 rounded-md text-xs bg-amber-600/30 hover:bg-amber-600/50 text-amber-200 border border-amber-500/40 disabled:opacity-50"
              >
                {t.skip}
              </button>
            </>
          )}
          {segment.status === 'live' && (
            <button
              type="button"
              onClick={onEnd}
              disabled={busy}
              title={t.endTitle}
              data-testid={`segment-end-${segment.id}`}
              className="px-2 py-1 rounded-md text-xs bg-red-600/30 hover:bg-red-600/50 text-red-200 border border-red-500/40 disabled:opacity-50"
            >
              {t.end}
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            title={t.deleteTitle}
            data-testid={`segment-delete-${segment.id}`}
            className="px-2 py-1 rounded-md text-xs bg-neutral-700/50 hover:bg-red-700/40 text-neutral-300 hover:text-red-200 border border-neutral-600/40 disabled:opacity-50"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
