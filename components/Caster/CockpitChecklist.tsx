// components/Caster/CockpitChecklist.tsx
//
// Checklist pre-match du segment courant. Toggle un item PATCH vers
// /api/caster/segments/[segId]/checklist.

import { useCallback, useMemo, useState } from 'react';
import { useToast } from '@/components/Toast';
import type { EventCasterChecklistItem, EventSegment } from '@/types/events';
import { useT, format } from '@/lib/i18n/useT';

type Props = {
  segment: EventSegment;
  accessToken: string | null;
  onUpdated: (segment: EventSegment) => void;
};

export default function CockpitChecklist({
  segment,
  accessToken,
  onUpdated,
}: Props) {
  const { addToast } = useToast();
  const t = useT('cockpitChecklist');
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const items = useMemo(
    () =>
      (Array.isArray(segment.caster_checklist)
        ? segment.caster_checklist
        : []) as EventCasterChecklistItem[],
    [segment.caster_checklist]
  );

  const toggle = useCallback(
    async (item: EventCasterChecklistItem) => {
      if (!accessToken) {
        addToast(t.sessionExpired, 'error');
        return;
      }
      if (pending[item.key]) return;
      setPending((p) => ({ ...p, [item.key]: true }));

      const nextChecked = !item.checked_at;
      try {
        const res = await fetch(
          `/api/caster/segments/${segment.id}/checklist`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ key: item.key, checked: nextChecked }),
          }
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error || t.updateFailed);
        }
        const json = (await res.json()) as { segment: EventSegment };
        onUpdated(json.segment);
      } catch (err) {
        addToast(
          (err as Error)?.message || t.updateChecklistFailed,
          'error'
        );
      } finally {
        setPending((p) => {
          const next = { ...p };
          delete next[item.key];
          return next;
        });
      }
    },
    [accessToken, addToast, onUpdated, pending, segment.id, t]
  );

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="text-sm font-semibold text-white mb-1">
          {t.title}
        </div>
        <p className="text-xs text-gray-400">{t.emptyBody}</p>
      </div>
    );
  }

  const checkedCount = items.filter((it) => it.checked_at).length;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-semibold text-white">{t.title}</div>
          <div className="text-[11px] text-gray-400">
            {format(t.validatedProgress, {
              checked: checkedCount,
              total: items.length,
            })}
          </div>
        </div>
      </div>
      <ul className="space-y-2">
        {items.map((item) => {
          const checked = !!item.checked_at;
          const isPending = !!pending[item.key];
          return (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => toggle(item)}
                disabled={isPending}
                className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg border text-left transition ${
                  checked
                    ? 'border-emerald-500/40 bg-emerald-900/15 text-emerald-50'
                    : 'border-white/10 bg-black/30 text-gray-100 hover:bg-white/5'
                } ${isPending ? 'opacity-60 cursor-progress' : ''}`}
                data-testid={`checklist-item-${item.key}`}
                aria-pressed={checked}
              >
                <span
                  className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded border flex items-center justify-center ${
                    checked
                      ? 'bg-emerald-500 border-emerald-500'
                      : 'border-white/20 bg-black/40'
                  }`}
                  aria-hidden
                >
                  {checked && (
                    <svg
                      className="w-3 h-3 text-white"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.704 5.29a1 1 0 00-1.408-1.42L8.002 11.17 4.7 7.87a1 1 0 10-1.4 1.43l4.003 3.997a1.5 1.5 0 002.123 0l7.278-7.007z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-sm leading-tight block">
                    {item.label}
                  </span>
                  {checked && item.checked_at && (
                    <span className="block text-[11px] text-emerald-200/80 mt-0.5">
                      {t.validated}
                      {item.checked_at
                        ? format(t.validatedAtSuffix, {
                            time: new Date(
                              item.checked_at
                            ).toLocaleTimeString('fr-FR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            }),
                          })
                        : ''}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
