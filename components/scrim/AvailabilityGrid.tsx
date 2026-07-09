// components/scrim/AvailabilityGrid.tsx
// Grille de disponibilités partagée « When2Meet » — composant PRÉSENTATIONNEL
// pur (aucun fetch, aucune dépendance Supabase). Deux modes :
//   - 'paint'   : je peins mes créneaux dispo (drag-to-paint, tactile).
//   - 'heatmap' : lecture de l'overlap (intensité = nb de parties dispo), avec
//                 survol « qui est dispo » et clic pour valider (admin).
//
// Idiome dark Tailwind aligné sur components/player/ScrimSlotPicker.tsx.
// Toutes les chaînes visibles sont injectées via `labels` (i18n côté appelant).

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  horizonDates,
  slotMinutesOfDay,
  slotKey,
  isSlotValidatable,
  isFullOverlap,
  type PlanningConfig,
  type Heatmap,
  type HeatmapCell,
} from '@/utils/teams/scrimPlanningOverlap';

export type AvailabilityGridLabels = {
  /** Titre de la légende (ex. « Disponibilités »). */
  legendTitle: string;
  /** Libellé « personne / X dispo » — reçoit {count}. */
  availableCount: string;
  /** Libellé cellule « planifiable » (les 2 équipes). */
  validatable: string;
  /** Libellé cellule overlap parfait (2 équipes + staff). */
  fullOverlap: string;
  /** Aide en mode paint (ex. « Clique-glisse pour peindre »). */
  paintHint: string;
  /** Aria-label d'une cellule — reçoit {when}. */
  cellLabel: string;
  /** Aucun créneau peint pour l'instant. */
  empty: string;
};

export type AvailabilityGridProps = {
  config: PlanningConfig;
  mode: 'paint' | 'heatmap';
  labels: AvailabilityGridLabels;
  accent?: 'blue' | 'purple' | 'emerald';
  /** paint : créneaux ISO actuellement peints. */
  value?: string[];
  /** paint : appelé avec la nouvelle liste de créneaux ISO. */
  onChange?: (slots: string[]) => void;
  /** heatmap : overlap agrégé par slot. */
  heatmap?: Heatmap;
  /** heatmap : échelle d'intensité (défaut = 3 parties). */
  maxParties?: number;
  /** heatmap : clic sur une cellule (validation admin). */
  onSlotClick?: (slotKey: string) => void;
  /** heatmap : créneau actuellement sélectionné (halo). */
  selectedSlot?: string | null;
  /** Désactive toute interaction (lecture seule). */
  disabled?: boolean;
  /** Session `staff_required` : un créneau n'est planifiable qu'avec le staff. */
  requireStaff?: boolean;
};

const ACCENT_RING: Record<string, string> = {
  blue: 'ring-blue-400/80',
  purple: 'ring-purple-400/80',
  emerald: 'ring-emerald-400/80',
};

const ACCENT_PAINT: Record<string, string> = {
  blue: 'bg-blue-500/80 border-blue-300/60',
  purple: 'bg-purple-500/80 border-purple-300/60',
  emerald: 'bg-emerald-500/80 border-emerald-300/60',
};

// Rampe d'intensité heatmap (0 → maxParties). index 0 = vide.
const HEAT_RAMP = [
  'bg-white/[0.03] border-white/10', // 0 : personne
  'bg-emerald-900/50 border-emerald-700/40', // 1 partie
  'bg-emerald-600/60 border-emerald-400/50', // 2 parties
  'bg-emerald-400/80 border-emerald-200/70', // 3 parties (plein)
];

function fmtWeekday(dateStr: string, timezone: string): { dow: string; day: string } {
  // dateStr = 'YYYY-MM-DD' (date calendaire locale de session). On la rend à
  // midi UTC pour éviter tout glissement de jour à l'affichage.
  const d = new Date(`${dateStr}T12:00:00Z`);
  const dow = d.toLocaleDateString('fr-FR', { weekday: 'short', timeZone: timezone });
  const day = d.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    timeZone: timezone,
  });
  return { dow, day };
}

function fmtHour(minuteOfDay: number): string {
  const hh = String(Math.floor(minuteOfDay / 60)).padStart(2, '0');
  const mm = String(minuteOfDay % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

export default function AvailabilityGrid({
  config,
  mode,
  labels,
  accent = 'emerald',
  value,
  onChange,
  heatmap,
  maxParties = 3,
  onSlotClick,
  selectedSlot,
  disabled = false,
  requireStaff = false,
}: AvailabilityGridProps) {
  const days = useMemo(() => horizonDates(config), [config]);
  const rows = useMemo(() => slotMinutesOfDay(config), [config]);

  // Cache clé ISO par (jour, minute) pour ne pas recalculer à chaque render.
  const keyGrid = useMemo(() => {
    const g: Record<string, string> = {};
    for (const day of days) {
      for (const m of rows) {
        g[`${day}|${m}`] = slotKey(config, day, m);
      }
    }
    return g;
  }, [config, days, rows]);

  const selected = useMemo(() => new Set(value ?? []), [value]);

  // --- Drag-to-paint (mode paint) ---
  const painting = useRef<null | { add: boolean }>(null);
  const [, forceRerender] = useState(0);

  const applyPaint = useCallback(
    (key: string, add: boolean) => {
      if (!onChange) return;
      const next = new Set(value ?? []);
      if (add) next.add(key);
      else next.delete(key);
      onChange(Array.from(next));
    },
    [onChange, value]
  );

  const startPaint = useCallback(
    (key: string) => {
      if (disabled || mode !== 'paint') return;
      const add = !selected.has(key);
      painting.current = { add };
      applyPaint(key, add);
      forceRerender((n) => n + 1);
    },
    [disabled, mode, selected, applyPaint]
  );

  const enterPaint = useCallback(
    (key: string) => {
      if (!painting.current) return;
      applyPaint(key, painting.current.add);
    },
    [applyPaint]
  );

  const stopPaint = useCallback(() => {
    painting.current = null;
  }, []);

  const [hover, setHover] = useState<{ key: string; cell: HeatmapCell } | null>(
    null
  );

  const cellClass = (key: string): string => {
    if (mode === 'paint') {
      return selected.has(key)
        ? ACCENT_PAINT[accent]
        : 'bg-white/[0.03] border-white/10 hover:bg-white/10';
    }
    const cell = heatmap?.[key];
    const count = cell?.count ?? 0;
    const idx = Math.min(count, HEAT_RAMP.length - 1, maxParties);
    let base = HEAT_RAMP[idx];
    if (isFullOverlap(cell) || (count >= maxParties && maxParties >= 3)) {
      base += ' shadow-[0_0_10px_-1px] shadow-emerald-400/60';
    }
    if (selectedSlot && selectedSlot === key) {
      base += ` ring-2 ${ACCENT_RING[accent]}`;
    }
    return base;
  };

  const cellInteractive = mode === 'heatmap' && !!onSlotClick && !disabled;

  return (
    <div className="select-none">
      {/* Légende */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-gray-400">
        <span className="font-medium tracking-[0.12em] uppercase text-gray-300">
          {labels.legendTitle}
        </span>
        {mode === 'heatmap' ? (
          <div className="flex items-center gap-2">
            {HEAT_RAMP.slice(0, Math.min(maxParties + 1, HEAT_RAMP.length)).map(
              (c, i) => (
                <span key={i} className="flex items-center gap-1">
                  <span className={`inline-block h-3 w-4 rounded border ${c}`} />
                  <span>{i}</span>
                </span>
              )
            )}
          </div>
        ) : (
          <span className="text-gray-500">{labels.paintHint}</span>
        )}
      </div>

      <div
        className="overflow-x-auto rounded-2xl border border-white/10 bg-black/40 p-2"
        onPointerLeave={stopPaint}
        onPointerUp={stopPaint}
      >
        <div className="inline-grid" style={{ gridTemplateColumns: `4.5rem repeat(${days.length}, minmax(2.6rem, 1fr))` }}>
          {/* Coin + en-têtes de jour (sticky top) */}
          <div className="sticky left-0 z-20 bg-black/60 backdrop-blur" />
          {days.map((day) => {
            const { dow, day: dm } = fmtWeekday(day, config.timezone);
            return (
              <div
                key={`h-${day}`}
                className="px-1 pb-2 text-center"
              >
                <div className="text-[11px] font-semibold uppercase text-gray-200">
                  {dow}
                </div>
                <div className="text-[10px] text-gray-500">{dm}</div>
              </div>
            );
          })}

          {/* Lignes horaires */}
          {rows.map((m) => (
            <FragmentRow key={`r-${m}`}>
              <div className="sticky left-0 z-10 -mt-px flex items-start justify-end bg-black/60 pr-2 pt-0.5 text-[10px] tabular-nums text-gray-500 backdrop-blur">
                {fmtHour(m)}
              </div>
              {days.map((day) => {
                const key = keyGrid[`${day}|${m}`];
                const cell = heatmap?.[key];
                return (
                  <button
                    type="button"
                    key={`c-${day}-${m}`}
                    disabled={disabled || (mode === 'heatmap' && !cellInteractive)}
                    aria-label={labels.cellLabel.replace(
                      '{when}',
                      `${fmtWeekday(day, config.timezone).dow} ${fmtHour(m)}`
                    )}
                    onPointerDown={() => startPaint(key)}
                    onPointerEnter={() => {
                      enterPaint(key);
                      if (mode === 'heatmap' && cell) setHover({ key, cell });
                    }}
                    onPointerLeave={() => {
                      if (mode === 'heatmap') setHover(null);
                    }}
                    onClick={() => {
                      if (cellInteractive) onSlotClick?.(key);
                    }}
                    className={`relative m-px h-6 rounded-md border transition-colors ${cellClass(
                      key
                    )} ${
                      cellInteractive ? 'cursor-pointer hover:brightness-125' : ''
                    } ${
                      mode === 'heatmap' && isSlotValidatable(cell, requireStaff)
                        ? 'after:absolute after:inset-x-1 after:bottom-0.5 after:h-0.5 after:rounded-full after:bg-emerald-200/70 after:content-[""]'
                        : ''
                    }`}
                  />
                );
              })}
            </FragmentRow>
          ))}
        </div>
      </div>

      {/* Tooltip overlap (heatmap) */}
      {mode === 'heatmap' && hover && hover.cell.count > 0 && (
        <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-gray-300">
          <div className="mb-1 font-medium text-gray-100">
            {labels.availableCount.replace('{count}', String(hover.cell.count))}
            {isFullOverlap(hover.cell) && (
              <span className="ml-2 rounded-full bg-emerald-400/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                {labels.fullOverlap}
              </span>
            )}
            {!isFullOverlap(hover.cell) && isSlotValidatable(hover.cell, requireStaff) && (
              <span className="ml-2 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                {labels.validatable}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {hover.cell.participants.map((p, i) => (
              <span
                key={`${p.userId}-${i}`}
                className="rounded-md bg-black/40 px-2 py-0.5 text-[11px] text-gray-300"
              >
                {p.displayName || p.party}
              </span>
            ))}
          </div>
        </div>
      )}

      {mode === 'paint' && selected.size === 0 && (
        <p className="mt-3 text-xs text-gray-500">{labels.empty}</p>
      )}
    </div>
  );
}

// Petit wrapper pour émettre plusieurs enfants dans la grille (React fragment
// ne peut pas porter de style, mais display:contents laisse le grid gérer).
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'contents' }}>{children}</div>;
}
