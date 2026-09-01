// components/admin/CommandPalette.tsx
//
// Palette de commandes ⌘K / Ctrl-K — lot A4 de docs/PLAN-espace-admin.md.
//
// 125 pages admin et aucune recherche transverse : retrouver « l'équipe X »
// passait par la barre de navigation puis par le filtre local d'une liste. Un
// soir de journée, ça fait trois écrans pour atteindre une ligne qu'on a déjà
// en tête.
//
// Trois partis pris :
//
//   1. La palette ATTEINT, elle n'explore pas : cinq résultats par famille, un
//      champ, une touche. Ce qui demande à être exploré a sa page.
//   2. Les résultats viennent du serveur DÉJÀ filtrés par permission (lot A2) —
//      la palette n'a aucune règle d'accès à connaître, et ne peut donc pas se
//      tromper.
//   3. Accessible d'abord : `role="dialog"` modal, focus piégé, `Esc` ferme,
//      flèches + Entrée sans souris. Une palette qu'on ne peut utiliser qu'à la
//      souris n'a aucune raison d'exister.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminCommandPalette from '@/lib/i18n/locales/admin-fr/adminCommandPalette';
import type { AdminSearchPayload, SearchHit } from '@/pages/api/admin/search';

import { logger } from '../../utils/logger';

const RECENT_KEY = 'admin.palette.recent';
const RECENT_MAX = 5;
const DEBOUNCE_MS = 180;

type Recent = { title: string; href: string };

function readRecent(): Recent[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function pushRecent(entry: Recent) {
  try {
    const next = [entry, ...readRecent().filter((r) => r.href !== entry.href)];
    window.localStorage.setItem(
      RECENT_KEY,
      JSON.stringify(next.slice(0, RECENT_MAX))
    );
  } catch {
    /* stockage bloqué : l'historique est un confort, pas une fonction */
  }
}

export default function CommandPalette() {
  const t = useAdminT(nsAdminCommandPalette);
  const router = useRouter();
  const { adminFetchJson } = useAdminFetch();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [cursor, setCursor] = useState(0);
  const [loading, setLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Élément qui avait le focus AVANT l'ouverture : on le lui rend en fermant,
  // sinon la tabulation repart du début de la page.
  const restoreRef = useRef<HTMLElement | null>(null);

  /** Actions fixes — « aller à », toujours proposées. */
  const actions = useMemo<SearchHit[]>(
    () => [
      {
        kind: 'tournament',
        id: 'action-current',
        title: t.actionCurrentTournament,
        subtitle: null,
        href: '/admin/tournoi-en-cours',
      },
      {
        kind: 'task',
        id: 'action-tasks',
        title: t.actionTasks,
        subtitle: null,
        href: '/admin/tasks',
      },
      {
        kind: 'ticket',
        id: 'action-support',
        title: t.actionSupport,
        subtitle: null,
        href: '/admin/moderation?tab=support',
      },
    ],
    [t]
  );

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setHits([]);
    setCursor(0);
    restoreRef.current?.focus?.();
  }, []);

  // Ouverture au clavier. `metaKey` (macOS) ou `ctrlKey` (le reste) + K, et
  // jamais quand la personne est en train d'écrire dans un champ : intercepter
  // ⌘K dans un textarea volerait un raccourci d'édition.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key?.toLowerCase() !== 'k' || !(e.metaKey || e.ctrlKey)) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) {
        return;
      }
      e.preventDefault();
      restoreRef.current = document.activeElement as HTMLElement | null;
      setRecent(readRecent());
      setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Recherche débouncée : on ne part pas au serveur à chaque frappe.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      adminFetchJson<AdminSearchPayload>(
        `/api/admin/search?q=${encodeURIComponent(q)}`
      )
        .then((data) => {
          if (!cancelled) {
            setHits(data.hits ?? []);
            setCursor(0);
          }
        })
        .catch((err) => {
          logger.error('[palette] search error:', err);
          if (!cancelled) setHits([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query, adminFetchJson]);

  const rows: SearchHit[] = query.trim().length >= 2 ? hits : actions;

  const go = useCallback(
    (hit: SearchHit) => {
      pushRecent({ title: hit.title, href: hit.href });
      close();
      router.push(hit.href);
    },
    [close, router]
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, Math.max(rows.length - 1, 0)));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const hit = rows[cursor];
      if (hit) go(hit);
      return;
    }
    // Piège à focus : la palette est modale, la tabulation ne doit pas en
    // sortir vers une page qu'on ne voit plus.
    if (e.key === 'Tab') {
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
        'input, button, [href], [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/70 p-4 pt-24 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t.title}
        onKeyDown={onKeyDown}
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-neutral-950 shadow-2xl"
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.placeholder}
          aria-label={t.placeholder}
          className="w-full border-b border-white/10 bg-transparent px-5 py-4 text-sm text-white placeholder:text-neutral-500 focus:outline-none"
        />

        <ul
          role="listbox"
          aria-label={t.results}
          className="max-h-80 overflow-y-auto"
        >
          {rows.length === 0 && (
            <li className="px-5 py-4 text-sm text-neutral-500">
              {loading ? t.searching : t.noResult}
            </li>
          )}
          {rows.map((hit, i) => (
            <li key={`${hit.kind}-${hit.id}`}>
              <button
                type="button"
                role="option"
                aria-selected={i === cursor}
                onMouseEnter={() => setCursor(i)}
                onClick={() => go(hit)}
                className={`flex w-full items-center gap-3 px-5 py-2.5 text-left text-sm transition ${
                  i === cursor ? 'bg-white/10 text-white' : 'text-neutral-300'
                }`}
              >
                <span className="w-16 shrink-0 font-mono text-[10px] uppercase tracking-wide text-neutral-500">
                  {t[`kind_${hit.kind}` as keyof typeof t] ?? hit.kind}
                </span>
                <span className="min-w-0 flex-1 truncate">{hit.title}</span>
                {hit.subtitle && (
                  <span className="shrink-0 truncate text-xs text-neutral-500">
                    {hit.subtitle}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>

        {recent.length > 0 && query.trim().length < 2 && (
          <div className="border-t border-white/10 px-5 py-3">
            <p className="font-mono text-[10px] uppercase tracking-wide text-neutral-500">
              {t.recent}
            </p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {recent.map((r) => (
                <li key={r.href}>
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      router.push(r.href);
                    }}
                    className="truncate text-left text-xs text-neutral-400 transition hover:text-white"
                  >
                    {r.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="border-t border-white/10 px-5 py-2 font-mono text-[10px] text-neutral-600">
          {t.hint}
        </p>
      </div>
    </div>
  );
}
