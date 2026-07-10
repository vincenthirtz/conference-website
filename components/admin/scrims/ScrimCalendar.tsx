// components/admin/scrims/ScrimCalendar.tsx
// Agenda admin (vue semaine) pour poser / replanifier des scrims sur un créneau.
// Colonnes = 7 jours (lun→dim), axe horaire continu à gauche. La plage horaire
// affichée est dynamique : par défaut 8h→minuit, élargie pour englober tout
// scrim/match qui déborde (créneau matinal ou nocturne) — plus de bloc coupé.
//   - Scrims : blocs colorés par statut, DÉPLAÇABLES (drag) et REDIMENSIONNABLES
//     (poignée basse) via pointer events (souris + tactile). Cliquer (sans
//     drag) → onOpenScrim(id).
//   - Matches : blocs gris hachurés, LECTURE SEULE (tag « Match ») ; cliquer →
//     onOpenMatch(id). Rend les collisions scrim/match visibles à l'œil.
//   - Zone vide : clic → onCreateAt(dayYmd, minuteOfDay) (snap 30 min).
// Présentation pure : aucun fetch. Les mutations sont remontées au parent
// (onMoveScrim / onResizeScrim) qui persiste et rafraîchit.

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  weekDaysFrom,
  dateAndMinuteInTz,
  todayYmdInTz,
  assignLanes,
} from '@/utils/teams/scrimCalendar';
import { fmtHourOfDay as fmtHour } from '@/utils/teams/scrimTime';

export type CalendarScrim = {
  id: string;
  name: string;
  status: string;
  scheduled_date: string | null;
  duration_minutes?: number | null;
  team1Name?: string | null;
  team2Name?: string | null;
};

export type CalendarMatch = {
  id: string;
  status: string;
  scheduled_at: string | null;
  team1Name?: string | null;
  team2Name?: string | null;
};

export type ScrimCalendarLabels = {
  today: string;
  prevWeek: string;
  nextWeek: string;
  thisWeek: string;
  weekOf: string; // reçoit {date}
  createHint: string;
  matchTag: string;
};

const DEFAULT_DAY_START_MIN = 8 * 60; // 08:00 (borne haute du début visible)
const DEFAULT_DAY_END_MIN = 24 * 60; // minuit (borne basse de la fin visible)
const BAND_PAD_MIN = 30; // marge autour des événements hors plage par défaut
const MAX_DAY_END_MIN = 30 * 60; // garde-fou : jamais au-delà de 06:00 (J+1)
const HOUR_PX = 44;
const SNAP_MIN = 30; // snap création (clic zone vide)
const DND_SNAP_MIN = 15; // snap drag & drop / resize
const DEFAULT_DURATION_MIN = 120;
const DEFAULT_MATCH_DURATION_MIN = 60;
const MIN_DURATION_MIN = 15;
const MAX_DURATION_MIN = 720;
const DRAG_THRESHOLD_PX = 4;
const pxPerMin = HOUR_PX / 60;

const STATUS_BLOCK: Record<string, string> = {
  draft: 'bg-neutral-600/80 border-neutral-400/50 text-neutral-100',
  scheduled: 'bg-blue-600/80 border-blue-300/50 text-white',
  running: 'bg-emerald-600/80 border-emerald-300/50 text-white',
  completed: 'bg-purple-600/80 border-purple-300/50 text-white',
  cancelled: 'bg-red-700/70 border-red-400/50 text-red-100 line-through',
};

/** Label de graduation : au-delà de minuit, affiche l'heure J+1 avec un « +1 ». */
const fmtMark = (m: number) =>
  m >= 24 * 60 ? `${fmtHour(m - 24 * 60)}⁺¹` : fmtHour(m);
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

function fmtDayHeader(ymd: string, tz: string): { dow: string; day: string } {
  const d = new Date(`${ymd}T12:00:00Z`);
  return {
    dow: d.toLocaleDateString('fr-FR', { weekday: 'short', timeZone: tz }),
    day: d.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      timeZone: tz,
    }),
  };
}

type DragState = {
  id: string;
  mode: 'move' | 'resize';
  startX: number;
  startY: number;
  moved: boolean;
  originMinute: number;
  originDuration: number;
  curDay: string;
  curMinute: number;
  curDuration: number;
};

export default function ScrimCalendar({
  tz,
  weekStart,
  scrims,
  matches = [],
  labels,
  onWeekChange,
  onCreateAt,
  onOpenScrim,
  onOpenMatch,
  onMoveScrim,
  onResizeScrim,
}: {
  tz: string;
  /** Lundi de la semaine affichée ('YYYY-MM-DD'). */
  weekStart: string;
  scrims: CalendarScrim[];
  matches?: CalendarMatch[];
  labels: ScrimCalendarLabels;
  onWeekChange: (mondayYmd: string) => void;
  onCreateAt: (dayYmd: string, minuteOfDay: number) => void;
  onOpenScrim: (id: string) => void;
  onOpenMatch: (id: string) => void;
  onMoveScrim: (id: string, dayYmd: string, minuteOfDay: number) => void;
  onResizeScrim: (id: string, durationMinutes: number) => void;
}) {
  const days = useMemo(() => weekDaysFrom(weekStart), [weekStart]);
  const todayYmd = useMemo(() => todayYmdInTz(tz), [tz]);

  // Refs des colonnes-jour pour retrouver le jour cible depuis le pointeur.
  const colRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Drag en cours : source de vérité en ref (pas de re-render par mutation),
  // `dragTick` force un re-render à chaque frame pour refléter la position.
  const dragRef = useRef<DragState | null>(null);
  const [dragTick, setDragTick] = useState(0);
  const rerender = useCallback(() => setDragTick((t) => t + 1), []);
  // Avale le clic synthétique qui suit un vrai drag (souris).
  const justDraggedRef = useRef(false);

  const scrimBasePos = useMemo(() => {
    const map = new Map<
      string,
      { ymd: string; minute: number; duration: number; dayIdx: number }
    >();
    for (const s of scrims) {
      if (!s.scheduled_date) continue;
      const pos = dateAndMinuteInTz(s.scheduled_date, tz);
      if (!pos) continue;
      const dayIdx = days.indexOf(pos.ymd);
      if (dayIdx < 0) continue;
      map.set(s.id, {
        ymd: pos.ymd,
        minute: pos.minute,
        duration: s.duration_minutes ?? DEFAULT_DURATION_MIN,
        dayIdx,
      });
    }
    return map;
  }, [scrims, tz, days]);

  // Position d'affichage (base + override du drag en cours). `dragTick` est une
  // dépendance volontaire : dragRef est muté sans déclencher de render.
  const placedScrims = useMemo(() => {
    void dragTick;
    const drag = dragRef.current;
    const out: {
      scrim: CalendarScrim;
      ymd: string;
      minute: number;
      duration: number;
      dragging: boolean;
    }[] = [];
    for (const s of scrims) {
      const base = scrimBasePos.get(s.id);
      if (!base) continue;
      if (drag && drag.id === s.id) {
        out.push({
          scrim: s,
          ymd: drag.mode === 'move' ? drag.curDay : base.ymd,
          minute: drag.mode === 'move' ? drag.curMinute : base.minute,
          duration: drag.mode === 'resize' ? drag.curDuration : base.duration,
          dragging: true,
        });
      } else {
        out.push({
          scrim: s,
          ymd: base.ymd,
          minute: base.minute,
          duration: base.duration,
          dragging: false,
        });
      }
    }
    return out;
  }, [scrims, scrimBasePos, dragTick]);

  const scrimsByDay = useMemo(() => {
    const map: Record<string, typeof placedScrims> = {};
    for (const p of placedScrims) (map[p.ymd] ??= []).push(p);
    return map;
  }, [placedScrims]);

  const matchesByDay = useMemo(() => {
    const map: Record<string, { match: CalendarMatch; minute: number }[]> = {};
    for (const m of matches) {
      if (!m.scheduled_at) continue;
      const pos = dateAndMinuteInTz(m.scheduled_at, tz);
      if (!pos || !days.includes(pos.ymd)) continue;
      (map[pos.ymd] ??= []).push({ match: m, minute: pos.minute });
    }
    return map;
  }, [matches, tz, days]);

  // Plage horaire visible, dynamique : 8h→minuit par défaut, élargie pour
  // englober tout scrim/match qui déborde (créneau matinal ou nocturne). Basée
  // sur les positions de base (pas le drag) → la plage ne saute pas pendant un
  // déplacement.
  const band = useMemo(() => {
    let earliest = DEFAULT_DAY_START_MIN;
    let latest = DEFAULT_DAY_END_MIN;
    for (const p of scrimBasePos.values()) {
      earliest = Math.min(earliest, p.minute);
      latest = Math.max(latest, p.minute + p.duration);
    }
    for (const list of Object.values(matchesByDay)) {
      for (const { minute } of list) {
        earliest = Math.min(earliest, minute);
        latest = Math.max(latest, minute + DEFAULT_MATCH_DURATION_MIN);
      }
    }
    const startMin = clamp(
      Math.floor((earliest - BAND_PAD_MIN) / 60) * 60,
      0,
      DEFAULT_DAY_START_MIN
    );
    const endMin = clamp(
      Math.ceil((latest + BAND_PAD_MIN) / 60) * 60,
      DEFAULT_DAY_END_MIN,
      MAX_DAY_END_MIN
    );
    return { startMin, endMin };
  }, [scrimBasePos, matchesByDay]);

  const colHeight = ((band.endMin - band.startMin) / 60) * HOUR_PX;

  // Layout côte-à-côte : par jour, répartit matches + scrims chevauchants en
  // colonnes pour qu'aucun bloc n'en recouvre un autre. Recalculé pendant le
  // drag (scrimsByDay dépend de dragTick).
  const layoutByDay = useMemo(() => {
    const map: Record<string, Map<string, { col: number; cols: number }>> = {};
    for (const day of days) {
      const blocks: { id: string; start: number; end: number }[] = [];
      for (const { match, minute } of matchesByDay[day] ?? []) {
        blocks.push({
          id: `m-${match.id}`,
          start: minute,
          end: minute + DEFAULT_MATCH_DURATION_MIN,
        });
      }
      for (const p of scrimsByDay[day] ?? []) {
        blocks.push({
          id: p.scrim.id,
          start: p.minute,
          end: p.minute + p.duration,
        });
      }
      map[day] = assignLanes(blocks);
    }
    return map;
  }, [days, matchesByDay, scrimsByDay]);

  const hourMarks = useMemo(() => {
    const marks: { top: number; label: string }[] = [];
    for (let m = band.startMin; m <= band.endMin; m += 60) {
      marks.push({ top: (m - band.startMin) * pxPerMin, label: fmtMark(m) });
    }
    return marks;
  }, [band]);

  const colIndexAt = useCallback(
    (clientX: number): number | null => {
      const rects = colRefs.current;
      for (let i = 0; i < rects.length; i++) {
        const el = rects[i];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (clientX >= r.left && clientX <= r.right) return i;
      }
      const first = rects[0]?.getBoundingClientRect();
      if (first && clientX < first.left) return 0;
      const last = rects[days.length - 1]?.getBoundingClientRect();
      if (last && clientX > last.right) return days.length - 1;
      return null;
    },
    [days.length]
  );

  const startDrag = useCallback(
    (e: React.PointerEvent, scrim: CalendarScrim, mode: 'move' | 'resize') => {
      const base = scrimBasePos.get(scrim.id);
      if (!base) return;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      justDraggedRef.current = false;
      dragRef.current = {
        id: scrim.id,
        mode,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        originMinute: base.minute,
        originDuration: base.duration,
        curDay: base.ymd,
        curMinute: base.minute,
        curDuration: base.duration,
      };
      rerender();
    },
    [scrimBasePos, rerender]
  );

  const moveDrag = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dy = e.clientY - d.startY;
      const dist = Math.abs(e.clientX - d.startX) + Math.abs(dy);
      if (!d.moved && dist > DRAG_THRESHOLD_PX) d.moved = true;
      const deltaMin = Math.round(dy / pxPerMin / DND_SNAP_MIN) * DND_SNAP_MIN;
      if (d.mode === 'resize') {
        d.curDuration = clamp(
          d.originDuration + deltaMin,
          MIN_DURATION_MIN,
          MAX_DURATION_MIN
        );
      } else {
        d.curMinute = clamp(
          d.originMinute + deltaMin,
          band.startMin,
          band.endMin - DND_SNAP_MIN
        );
        const idx = colIndexAt(e.clientX);
        if (idx !== null) d.curDay = days[idx];
      }
      rerender();
    },
    [colIndexAt, days, rerender, band]
  );

  const endDrag = useCallback(
    (e: React.PointerEvent) => {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      const d = dragRef.current;
      dragRef.current = null;
      if (d?.moved) {
        justDraggedRef.current = true;
        if (d.mode === 'move') onMoveScrim(d.id, d.curDay, d.curMinute);
        else onResizeScrim(d.id, d.curDuration);
      }
      rerender();
    },
    [onMoveScrim, onResizeScrim, rerender]
  );

  const cancelDrag = useCallback(() => {
    if (dragRef.current) {
      dragRef.current = null;
      rerender();
    }
  }, [rerender]);

  const handleColClick = (dayYmd: string) => (e: React.MouseEvent) => {
    if (justDraggedRef.current) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    let minute = band.startMin + Math.round(y / pxPerMin / SNAP_MIN) * SNAP_MIN;
    minute = clamp(minute, band.startMin, band.endMin - SNAP_MIN);
    onCreateAt(dayYmd, minute);
  };

  const handleScrimClick = (id: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      e.preventDefault();
      return;
    }
    onOpenScrim(id);
  };

  const weekLabel = fmtDayHeader(days[0], tz).day;

  return (
    <div className="select-none">
      {/* Barre de navigation semaine */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            aria-label={labels.prevWeek}
            onClick={() => onWeekChange(shift(weekStart, -7))}
            className="rounded-lg border border-neutral-700 bg-neutral-900/60 px-2.5 py-1 hover:bg-neutral-800 transition"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => onWeekChange(mondayToday(tz))}
            className="rounded-lg border border-neutral-700 bg-neutral-900/60 px-3 py-1 text-xs font-medium hover:bg-neutral-800 transition"
          >
            {labels.thisWeek}
          </button>
          <button
            type="button"
            aria-label={labels.nextWeek}
            onClick={() => onWeekChange(shift(weekStart, 7))}
            className="rounded-lg border border-neutral-700 bg-neutral-900/60 px-2.5 py-1 hover:bg-neutral-800 transition"
          >
            ›
          </button>
          <span className="ml-1 text-neutral-300 tabular-nums">
            {labels.weekOf.replace('{date}', weekLabel)}
          </span>
        </div>
        <span className="text-xs text-neutral-500">{labels.createHint}</span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-900/40 p-2">
        <div className="flex min-w-[720px]">
          {/* Gouttière d'heures */}
          <div className="w-12 flex-shrink-0 pt-9">
            <div className="relative" style={{ height: colHeight }}>
              {hourMarks.map((m) => (
                <div
                  key={m.label}
                  className="absolute right-1 -translate-y-1/2 text-[10px] tabular-nums text-neutral-500"
                  style={{ top: m.top }}
                >
                  {m.label}
                </div>
              ))}
            </div>
          </div>

          {/* Colonnes-jour */}
          <div className="flex flex-1 gap-1">
            {days.map((day, dayIdx) => {
              const isToday = day === todayYmd;
              const dayScrims = scrimsByDay[day] ?? [];
              const dayMatches = matchesByDay[day] ?? [];
              return (
                <div key={day} className="flex-1 min-w-[92px]">
                  <div
                    className={`h-9 text-center ${
                      isToday ? 'text-emerald-300' : 'text-neutral-200'
                    }`}
                  >
                    <div className="text-[11px] font-semibold uppercase">
                      {fmtDayHeader(day, tz).dow}
                    </div>
                    <div className="text-[10px] text-neutral-500">
                      {fmtDayHeader(day, tz).day}
                    </div>
                  </div>

                  <div
                    ref={(el) => {
                      colRefs.current[dayIdx] = el;
                    }}
                    className="relative cursor-copy rounded-lg border border-neutral-800 bg-neutral-950/40 hover:bg-neutral-900/40"
                    style={{ height: colHeight }}
                    onClick={handleColClick(day)}
                    title={labels.createHint}
                  >
                    {hourMarks.map((m) => (
                      <div
                        key={m.label}
                        className="pointer-events-none absolute inset-x-0 border-t border-neutral-800/70"
                        style={{ top: m.top }}
                      />
                    ))}

                    {/* Matches (lecture seule) */}
                    {dayMatches.map(({ match, minute }) => {
                      const top = Math.max(
                        0,
                        (minute - band.startMin) * pxPerMin
                      );
                      const height = Math.max(
                        18,
                        DEFAULT_MATCH_DURATION_MIN * pxPerMin - 2
                      );
                      const lane = layoutByDay[day]?.get(`m-${match.id}`) ?? {
                        col: 0,
                        cols: 1,
                      };
                      const vs =
                        match.team1Name || match.team2Name
                          ? `${match.team1Name ?? '?'} vs ${match.team2Name ?? '?'}`
                          : labels.matchTag;
                      return (
                        <button
                          type="button"
                          key={`m-${match.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenMatch(match.id);
                          }}
                          className="absolute overflow-hidden rounded-md border border-neutral-500/40 px-1.5 py-1 text-left text-[10px] leading-tight text-neutral-300 hover:brightness-125"
                          style={{
                            top,
                            height,
                            left: `calc(${(lane.col / lane.cols) * 100}% + 1px)`,
                            width: `calc(${100 / lane.cols}% - 2px)`,
                            backgroundColor: '#3f3f46',
                            backgroundImage:
                              'repeating-linear-gradient(45deg, rgba(255,255,255,0.06) 0, rgba(255,255,255,0.06) 4px, transparent 4px, transparent 8px)',
                          }}
                          title={`${labels.matchTag} — ${vs} — ${fmtHour(minute)}`}
                        >
                          <span className="mb-0.5 inline-block rounded-sm bg-neutral-900/70 px-1 text-[8px] font-semibold uppercase tracking-wide text-neutral-300">
                            {labels.matchTag}
                          </span>
                          <span className="block truncate">{vs}</span>
                        </button>
                      );
                    })}

                    {/* Scrims (déplaçables / redimensionnables) */}
                    {dayScrims.map(({ scrim, minute, duration, dragging }) => {
                      const top = Math.max(
                        0,
                        (minute - band.startMin) * pxPerMin
                      );
                      const height = Math.max(18, duration * pxPerMin - 2);
                      const lane = layoutByDay[day]?.get(scrim.id) ?? {
                        col: 0,
                        cols: 1,
                      };
                      const cls =
                        STATUS_BLOCK[scrim.status] ?? STATUS_BLOCK.draft;
                      const vs =
                        scrim.team1Name || scrim.team2Name
                          ? `${scrim.team1Name ?? '?'} vs ${scrim.team2Name ?? '?'}`
                          : scrim.name;
                      return (
                        <button
                          type="button"
                          key={scrim.id}
                          onPointerDown={(e) => startDrag(e, scrim, 'move')}
                          onPointerMove={moveDrag}
                          onPointerUp={endDrag}
                          onPointerCancel={cancelDrag}
                          onClick={handleScrimClick(scrim.id)}
                          className={`absolute touch-none cursor-grab overflow-hidden rounded-md border px-1.5 py-1 text-left text-[10px] leading-tight shadow-sm hover:brightness-110 active:cursor-grabbing ${cls} ${
                            dragging ? 'z-20 ring-2 ring-white/60' : ''
                          }`}
                          style={{
                            top,
                            height,
                            // Pendant le drag, on prend toute la largeur (repère
                            // clair) ; sinon on respecte la lane anti-collision.
                            left: dragging
                              ? '2px'
                              : `calc(${(lane.col / lane.cols) * 100}% + 1px)`,
                            right: dragging ? '2px' : undefined,
                            width: dragging
                              ? undefined
                              : `calc(${100 / lane.cols}% - 2px)`,
                          }}
                          title={`${vs} — ${fmtHour(minute)}`}
                        >
                          <span className="block font-semibold tabular-nums">
                            {fmtHour(minute)}
                          </span>
                          <span className="block truncate">{vs}</span>
                          {/* Poignée de redimensionnement (durée) */}
                          <span
                            role="presentation"
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              startDrag(e, scrim, 'resize');
                            }}
                            onPointerMove={moveDrag}
                            onPointerUp={endDrag}
                            onPointerCancel={cancelDrag}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize touch-none bg-white/10 hover:bg-white/25"
                          />
                        </button>
                      );
                    })}

                    {isToday && (
                      <TodayLine
                        tz={tz}
                        startMin={band.startMin}
                        endMin={band.endMin}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function TodayLine({
  tz,
  startMin,
  endMin,
}: {
  tz: string;
  startMin: number;
  endMin: number;
}) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) =>
    parseInt(parts.find((p) => p.type === t)?.value ?? '0', 10);
  const nowMin = get('hour') * 60 + get('minute');
  if (nowMin < startMin || nowMin > endMin) return null;
  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
      style={{ top: (nowMin - startMin) * pxPerMin }}
    >
      <span className="h-1.5 w-1.5 -ml-0.5 rounded-full bg-red-500" />
      <span className="h-px flex-1 bg-red-500/80" />
    </div>
  );
}

// Décale un lundi de n jours (helpers locaux pour éviter d'importer plus).
function shift(mondayYmd: string, n: number): string {
  const [y, m, d] = mondayYmd.split('-').map((v) => parseInt(v, 10));
  const next = new Date(Date.UTC(y, m - 1, d) + n * 86_400_000);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${next.getUTCFullYear()}-${p(next.getUTCMonth() + 1)}-${p(next.getUTCDate())}`;
}

function mondayToday(tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const ymd = `${get('year')}-${get('month')}-${get('day')}`;
  const [y, m, d] = ymd.split('-').map((v) => parseInt(v, 10));
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  return shift(ymd, offset);
}
