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
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import { rubanCard } from '@/features/admin/diffusion/ui/rubanClasses';
import type { ComputedRunSchedule } from '@/utils/eventSchedule';
import type { EventSegment } from '@/types/events';
import nsAdminDirectorTimelineBuilder from '@/lib/i18n/locales/admin-fr/adminDirectorTimelineBuilder';

/**
 * Un segment `live` ou `done` est verrouille : il ne peut ni etre saisi (drag)
 * ni servir de cible de drop. Deplacer le segment en cours au milieu des
 * upcoming n'a aucun sens metier. Seuls `upcoming` et `skipped` restent
 * reordonnables.
 */
function isSegmentLocked(status: EventSegment['status']): boolean {
  return status === 'live' || status === 'done';
}

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
  const t = useAdminT(nsAdminDirectorTimelineBuilder);
  // Local copy for instant feedback during drag. Sync from props on change.
  const [localSegments, setLocalSegments] = useState(segments);
  const draggingIdRef = useRef<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => {
    setLocalSegments(segments);
  }, [segments]);

  function handleDragStart(e: React.DragEvent<HTMLDivElement>, id: string) {
    // Garde-fou : un segment verrouille ne se saisit pas (draggable=false le
    // bloque deja au niveau DOM, ceci couvre les cas limites).
    const seg = localSegments.find((s) => s.id === id);
    if (seg && isSegmentLocked(seg.status)) return;
    draggingIdRef.current = id;
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
    // Required for Firefox to start the drag.
    e.dataTransfer.setData('text/plain', id);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>, overId: string) {
    // Une cible verrouillee (live/done) n'accepte pas de drop : on n'affiche pas
    // l'indicateur et on signale au navigateur qu'aucun drop n'est possible.
    const overSeg = localSegments.find((s) => s.id === overId);
    if (overSeg && isSegmentLocked(overSeg.status)) {
      e.dataTransfer.dropEffect = 'none';
      setDragOverId(null);
      return;
    }
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
    // Ni la source ni la cible ne doivent etre verrouillees.
    if (
      isSegmentLocked(localSegments[fromIndex].status) ||
      isSegmentLocked(localSegments[toIndex].status)
    ) {
      return;
    }

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
        <div className={rubanCard}>
          <EmptyState
            title={t.emptyTitle}
            description={t.emptyDescription}
            action={
              <AdminButton
                variant="secondary"
                size="sm"
                onClick={onAddClick}
                data-testid="timeline-add-empty"
              >
                {t.addSegment}
              </AdminButton>
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
                  locked={isSegmentLocked(seg.status)}
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
          className="w-full h-11 px-4 rounded-[var(--r-card,14px)] border border-dashed border-[var(--line2,rgba(194,196,201,.2))] hover:border-[var(--or,#b467d1)] font-[family-name:var(--fd)] text-[12px] font-bold uppercase tracking-[0.02em] text-[var(--t3,#a39ba6)] hover:text-[var(--or-200,#eec4ff)] transition-colors"
        >
          {t.addSegmentPlus}
        </button>
      )}
    </div>
  );
}
