import { useCallback, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { useRouter } from 'next/router';

export type TabItem = {
  /** Stable identifier, also used as the `?tab=` query value. */
  id: string;
  /** Visible label. */
  label: ReactNode;
};

/** Stable DOM id for a tab button, given a page-level id base. */
export function tabButtonId(idBase: string, id: string) {
  return `${idBase}-tab-${id}`;
}

/** Stable DOM id for a tabpanel, given a page-level id base. */
export function tabPanelId(idBase: string, id: string) {
  return `${idBase}-panel-${id}`;
}

/**
 * Deep-linkable tab state driven by a URL query param (default `tab`).
 *
 * Reads the active tab from `router.query[param]`, validated against the
 * provided tab list; falls back to the first tab when absent/invalid. The
 * setter performs a shallow `router.replace` so the URL stays shareable and
 * old routes can redirect straight to a tab (e.g. `?tab=discord`).
 */
export function useQueryTab(
  tabs: TabItem[],
  param = 'tab'
): [string, (id: string) => void] {
  const router = useRouter();
  const raw = router.query[param];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const active = tabs.some((t) => t.id === value)
    ? (value as string)
    : (tabs[0]?.id ?? '');

  const setActive = useCallback(
    (id: string) => {
      router.replace(
        { pathname: router.pathname, query: { ...router.query, [param]: id } },
        undefined,
        { shallow: true, scroll: false }
      );
    },
    [router, param]
  );

  return [active, setActive];
}

type TabsProps = {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
  /** Accessible name for the tablist. */
  ariaLabel: string;
  /**
   * Page-level id base shared with the panels so `aria-controls` /
   * `aria-labelledby` line up. Use the same base with `tabPanelId`.
   */
  idBase: string;
  className?: string;
};

/**
 * Accessible tab bar (WAI-ARIA tablist pattern) with roving focus and
 * arrow-key / Home / End navigation. Purely presentational — pair it with
 * `useQueryTab` for URL-driven, deep-linkable state, and render the matching
 * panel yourself wrapped with `role="tabpanel"`, `id={tabPanelId(base, id)}`
 * and `aria-labelledby={tabButtonId(base, id)}`.
 */
export default function Tabs({
  tabs,
  active,
  onChange,
  ariaLabel,
  idBase,
  className = '',
}: TabsProps) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      const idx = tabs.findIndex((t) => t.id === active);
      if (idx < 0) return;
      let nextIdx: number | null = null;
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          nextIdx = (idx + 1) % tabs.length;
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          nextIdx = (idx - 1 + tabs.length) % tabs.length;
          break;
        case 'Home':
          nextIdx = 0;
          break;
        case 'End':
          nextIdx = tabs.length - 1;
          break;
        default:
          return;
      }
      e.preventDefault();
      const next = tabs[nextIdx];
      if (next) {
        onChange(next.id);
        refs.current[next.id]?.focus();
      }
    },
    [tabs, active, onChange]
  );

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex flex-wrap gap-1 border-b border-neutral-700/60 ${className}`}
    >
      {tabs.map((t) => {
        const selected = t.id === active;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el;
            }}
            role="tab"
            id={tabButtonId(idBase, t.id)}
            aria-selected={selected}
            aria-controls={tabPanelId(idBase, t.id)}
            tabIndex={selected ? 0 : -1}
            type="button"
            onClick={() => onChange(t.id)}
            onKeyDown={onKeyDown}
            className={`-mb-px rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
              selected
                ? 'border-b-2 border-purple-500 text-white'
                : 'border-b-2 border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
