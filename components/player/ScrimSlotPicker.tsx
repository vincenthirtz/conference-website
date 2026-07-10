// components/player/ScrimSlotPicker.tsx
// Repeatable multi-slot datetime picker shared between the scrim creation form
// (pages/player/requests.tsx) and the inline counter-proposal UI in the
// dashboard pending-scrims block (pages/player/index.tsx).
//
// i18n-friendly: all visible strings are passed in via `labels`, so each caller
// supplies them from its own namespace.
//
// Chaque créneau saisi (datetime-local, dans le fuseau du navigateur) est
// ré-affiché en clair (date complète) sous le champ, et le fuseau local du
// proposant est rappelé — même souci de clarté de fuseau que la grille de dispos
// (évite l'ambiguïté « 20:00 chez qui ? » dans une négociation cross-fuseau).

import { useEffect, useState } from 'react';
import { useLocale } from '@/lib/i18n/useLocale';

const MAX_SLOTS = 5;

export type ScrimSlotPickerLabels = {
  /** Label above the list of slot rows. */
  slotsLabel: string;
  /** Text for the "add another slot" button. */
  addSlot: string;
  /** Accessible label for the per-row remove button. */
  removeSlot: string;
  /** Hint shown under the list (e.g. "up to 5 slots"). */
  maxSlotsHint: string;
  /** Optionnel : note « créneaux dans ton fuseau ({tz}) » ({tz} interpolé). */
  timezoneNote?: string;
};

export { MAX_SLOTS };

export default function ScrimSlotPicker({
  slots,
  onChange,
  labels,
  accent = 'blue',
  idPrefix = 'slot',
}: {
  /** Current list of `datetime-local` values (at least one element). */
  slots: string[];
  onChange: (slots: string[]) => void;
  labels: ScrimSlotPickerLabels;
  accent?: 'blue' | 'purple';
  /** Prefix used to build unique input ids when several pickers coexist. */
  idPrefix?: string;
}) {
  const locale = useLocale();
  // Fuseau du navigateur (client-only pour éviter un mismatch SSR).
  const [viewerTz, setViewerTz] = useState<string | null>(null);
  useEffect(() => {
    try {
      setViewerTz(Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch {
      setViewerTz(null);
    }
  }, []);

  // Écho lisible d'un `datetime-local` (interprété dans le fuseau du navigateur).
  const echo = (value: string): string | null => {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const ring =
    accent === 'purple'
      ? 'focus:ring-purple-400/80'
      : 'focus:ring-blue-400/80';

  const updateSlot = (index: number, value: string) => {
    const next = slots.slice();
    next[index] = value;
    onChange(next);
  };

  const addSlot = () => {
    if (slots.length >= MAX_SLOTS) return;
    onChange([...slots, '']);
  };

  const removeSlot = (index: number) => {
    if (slots.length <= 1) return;
    onChange(slots.filter((_, i) => i !== index));
  };

  return (
    <div>
      <label className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2">
        {labels.slotsLabel}
      </label>
      <div className="space-y-2">
        {slots.map((value, index) => {
          const echoed = echo(value);
          return (
            <div key={`${idPrefix}-${index}`}>
              <div className="flex items-center gap-2">
                <input
                  id={`${idPrefix}-${index}`}
                  type="datetime-local"
                  value={value}
                  onChange={(e) => updateSlot(index, e.target.value)}
                  className={`flex-1 rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 ${ring} transition`}
                />
                {slots.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeSlot(index)}
                    aria-label={labels.removeSlot}
                    title={labels.removeSlot}
                    className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl border border-white/15 bg-white/5 text-gray-300 hover:bg-red-500/20 hover:text-red-200 hover:border-red-500/40 transition"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                )}
              </div>
              {echoed && (
                <p className="mt-1 pl-1 text-xs capitalize text-gray-400">
                  {echoed}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {slots.length < MAX_SLOTS && (
        <button
          type="button"
          onClick={addSlot}
          className="mt-2 inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-gray-200 hover:bg-white/10 transition"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {labels.addSlot}
        </button>
      )}

      <p className="mt-2 text-xs text-gray-500">{labels.maxSlotsHint}</p>
      {labels.timezoneNote && viewerTz && (
        <p className="mt-1 text-xs text-gray-500">
          {labels.timezoneNote.replace('{tz}', viewerTz)}
        </p>
      )}
    </div>
  );
}
