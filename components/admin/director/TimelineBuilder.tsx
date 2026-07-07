// components/admin/director/TimelineBuilder.tsx
// Feature: Run-of-show — Lot 3.
// Liste verticale drag-drop des segments. Drag-and-drop via HTML5 natif (pas
// de dependance externe — zero-dependency policy).
//
// Comportement :
//   - Le state d'ordre local est la source de verite pendant le drag (pour
//     l'optimistic UI). Au drop, on appelle onReorder(orderedIds) ; en cas
//     d'erreur cote API, le parent peut rollback en re-set segments.
//   - Les actions par segment (start/skip/end/delete/edit) sont remontees au
//     parent via callbacks. La selection est aussi geree par le parent (pour
//     que SegmentEditor reactif coute moins cher en re-renders).

import { useEffect, useMemo, useRef, useState } from 'react';
import { useAdminT } from '@/lib/i18n/useAdminT';
import SegmentCard from './SegmentCard';
import EmptyState from '@/components/admin/EmptyState';
import type { ComputedRunSchedule } from '@/utils/eventSchedule';
import type { EventSegment } from '@/types/events';

type Props = {
  segments: EventSegment[];
  selectedId: string | null;
  busy: boolean;
  /** Planning calcule (Lot 6). Si null, on n'affiche pas les horaires. */
  schedule?: ComputedRunSchedule | null;
  onSelect: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onStart: (segment: EventSegment) => void;
  onSkip: (segment: EventSegment) => void;
  onEnd: (segment: EventSegment) => void;
  onDelete: (segment: EventSegment) => void;
  onAddClick: () => void;
};

export default function TimelineBuilder({
  segments,
  selectedId,
  busy,
  schedule,
  onSelect,
  onReorder,
  onStart,
  onSkip,
  onEnd,
  onDelete,
  onAddClick,
}: Props) {
  const t = useAdminT('adminDirectorTimelineBuilder');
  // Local copy for instant feedback during drag. Sync from props on change.
  const [localSegments, setLocalSegments] = useState(segments);
  const draggingIdRef = useRef<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => {
    setLocalSegments(segments);
  }, [segments]);

  function handleDragStart(e: React.DragEvent<HTMLDivElement>, id: string) {
    draggingIdRef.current = id;
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
    // Required for Firefox to start the drag.
    e.dataTransfer.setData('text/plain', id);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>, overId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(overId);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>, dropOnId: string) {
    e.preventDefault();
    const draggedId = draggingIdRef.current;
    setDragOverId(null);
    setDraggingId(null);
    draggingIdRef.current = null;
    if (!draggedId || draggedId === dropOnId) return;

    const fromIndex = localSegments.findIndex((s) => s.id === draggedId);
    const toIndex = localSegments.findIndex((s) => s.id === dropOnId);
    if (fromIndex === -1 || toIndex === -1) return;

    const next = [...localSegments];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setLocalSegments(next);
    onReorder(next.map((s) => s.id));
  }

  function handleDragEnd() {
    draggingIdRef.current = null;
    setDraggingId(null);
    setDragOverId(null);
  }

  function handleDragLeave() {
    setDragOverId(null);
  }

  // Lookup O(1) du timing par segmentId pour eviter un .find() dans le render
  // de chaque carte (NSegments potentiellement >20).
  const timingById = useMemo(() => {
    const map = new Map<
      string,
      { plannedStartAt: string; isAnchored: boolean }
    >();
    if (schedule) {
      for (const t of schedule.segments) {
        map.set(t.segmentId, {
          plannedStartAt: t.plannedStartAt,
          isAnchored: t.isAnchored,
        });
      }
    }
    return map;
  }, [schedule]);

  return (
    <div className="space-y-2">
      {localSegments.length === 0 ? (
        <div className="rounded-2xl border border-neutral-700/50 bg-neutral-800/30">
          <EmptyState
            title={t.emptyTitle}
            description={t.emptyDescription}
            action={
              <button
                type="button"
                onClick={onAddClick}
                data-testid="timeline-add-empty"
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-medium"
              >
                {t.addSegment}
              </button>
            }
          />
        </div>
      ) : (
        <ul className="space-y-2" data-testid="timeline-list">
          {localSegments.map((seg, idx) => {
            const timing = timingById.get(seg.id) ?? null;
            const isLiveSegment =
              schedule?.liveSegmentId === seg.id && seg.status === 'live';
            const overrunSec =
              isLiveSegment && schedule ? schedule.liveOverrunSec : 0;
            return (
              <li key={seg.id}>
                <SegmentCard
                  segment={seg}
                  index={idx}
                  isSelected={seg.id === selectedId}
                  isDragging={seg.id === draggingId}
                  dragOver={seg.id === dragOverId && seg.id !== draggingId}
                  busy={busy}
                  plannedStartAt={timing?.plannedStartAt ?? null}
                  isAnchored={timing?.isAnchored ?? false}
                  overrunSec={overrunSec}
                  onSelect={() => onSelect(seg.id)}
                  onStart={() => onStart(seg)}
                  onSkip={() => onSkip(seg)}
                  onEnd={() => onEnd(seg)}
                  onDelete={() => onDelete(seg)}
                  onDragStart={(e) => handleDragStart(e, seg.id)}
                  onDragOver={(e) => handleDragOver(e, seg.id)}
                  onDrop={(e) => handleDrop(e, seg.id)}
                  onDragEnd={handleDragEnd}
                  onDragLeave={handleDragLeave}
                />
              </li>
            );
          })}
        </ul>
      )}
      {localSegments.length > 0 && (
        <button
          type="button"
          onClick={onAddClick}
          data-testid="timeline-add"
          className="w-full px-4 py-3 rounded-xl border border-dashed border-neutral-700 hover:border-neutral-600 text-sm text-neutral-400 hover:text-white transition-colors"
        >
          {t.addSegmentPlus}
        </button>
      )}
    </div>
  );
}
