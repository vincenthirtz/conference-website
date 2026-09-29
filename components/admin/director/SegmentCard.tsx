// components/admin/director/SegmentCard.tsx
// Feature: Run-of-show — Lot 3.
// Carte representant un segment dans la timeline. Status badge + actions
// contextuelles selon le statut (Start si upcoming, End si live, etc.).
//
// Drag-and-drop : on utilise les events HTML5 natifs portes par le parent
// TimelineBuilder (drag handle = la zone "::" a gauche). Pas de lib externe
// pour respecter la zero-dependency policy.
//
// Passe « Le Ruban » (lot 10C) : statut en Chip (ton `live` = la lueur), carte
// d'encre, actions AdminButton — mêmes `data-testid`, mêmes gestes.

import { useAdminT, format } from '@/lib/i18n/useAdminT';
import {
  SEGMENT_TYPE_ICON,
  segmentStatusLabel,
  segmentTypeLabel,
} from '@/utils/eventSegmentLabels';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import {
  SEGMENT_STATUS_TONE,
  rubanLiveFrame,
} from '@/features/admin/diffusion/ui/rubanClasses';
import type { EventSegment } from '@/types/events';
import nsAdminDirectorSegmentCard from '@/lib/i18n/locales/admin-fr/adminDirectorSegmentCard';
import { clockHHMM } from '@/utils/director/clock';

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
  const t = useAdminT(nsAdminDirectorSegmentCard);
  const hasOverrun = !!overrunSec && overrunSec > 0;
  const isLive = segment.status === 'live';
  const baseClasses = `group relative rounded-[var(--r-card,14px)] border transition-colors ${
    isLive ? 'bg-[var(--s2,#1d1520)]' : 'bg-[var(--s1,#100812)]'
  }`;
  const overrunRing = hasOverrun
    ? 'ring-2 ring-[rgba(245,165,36,.6)] animate-pulse'
    : '';
  const borderClasses = isSelected
    ? 'border-[var(--or,#b467d1)] ring-2 ring-[rgba(180,103,209,.3)]'
    : hasOverrun
      ? 'border-[rgba(245,165,36,.7)]'
      : isLive
        ? rubanLiveFrame
        : 'border-[var(--line2,rgba(194,196,201,.2))] hover:border-[var(--t4,#807984)]';
  const opacity = isDragging ? 'opacity-40' : 'opacity-100';
  const dragOverIndicator = dragOver
    ? 'before:absolute before:inset-x-0 before:-top-1 before:h-0.5 before:bg-[var(--or,#b467d1)] before:rounded-full'
    : '';
  const plannedHHMM = clockHHMM(plannedStartAt);

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
                className="text-[var(--warn,#f5a524)]"
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
            <Chip tone={SEGMENT_STATUS_TONE[segment.status] ?? 'neutral'}>
              {isLive && (
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--lf,#7fca65)]"
                />
              )}
              {segmentStatusLabel(segment.status)}
            </Chip>
            <span
              className="inline-flex items-center justify-center w-5 h-5 rounded-[var(--r-ctrl,4px)] bg-[var(--s3,#2f2732)] text-[10px] font-bold text-[var(--t2,#c7bfca)]"
              title={segmentTypeLabel(segment.type)}
            >
              {SEGMENT_TYPE_ICON[segment.type] ?? '?'}
            </span>
            <span className="font-semibold text-[var(--t1,#f4edf7)] truncate max-w-[260px]">
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
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[3px] font-mono text-[11px] font-bold text-[#ffd9a3] bg-[rgba(245,165,36,.18)] border border-[rgba(245,165,36,.6)]"
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
              <AdminButton
                variant="secondary"
                size="xs"
                onClick={onStart}
                disabled={busy}
                title={t.startTitle}
                data-testid={`segment-start-${segment.id}`}
              >
                {t.start}
              </AdminButton>
              <AdminButton
                variant="ghost"
                size="xs"
                onClick={onSkip}
                disabled={busy}
                title={t.skipTitle}
                data-testid={`segment-skip-${segment.id}`}
              >
                {t.skip}
              </AdminButton>
            </>
          )}
          {segment.status === 'live' && (
            <AdminButton
              variant="danger"
              size="xs"
              onClick={onEnd}
              disabled={busy}
              title={t.endTitle}
              data-testid={`segment-end-${segment.id}`}
            >
              {t.end}
            </AdminButton>
          )}
          <AdminButton
            variant="ghost"
            size="xs"
            onClick={onDelete}
            disabled={busy}
            title={t.deleteTitle}
            aria-label={t.deleteTitle}
            data-testid={`segment-delete-${segment.id}`}
            className="hover:border-[rgba(255,107,107,.45)] hover:text-[var(--err,#ff6b6b)]"
          >
            ×
          </AdminButton>
        </div>
      </div>
    </div>
  );
}
