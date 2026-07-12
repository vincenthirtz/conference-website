// components/tournament/landing/TournamentFaq.tsx
//
// FAQ premium : accordéon fluide (grid-rows transition) + recherche instantanée
// côté client. Contenu curé (6 Q/R réelles, FR/EN) — pas de donnée en base.
// Accessible : chaque en-tête est un <button> aria-expanded pilotant un panneau.

import { useMemo, useState } from 'react';
import { useT } from '@/lib/i18n/useT';
import { Section, SectionHeader } from './primitives';

export default function TournamentFaq() {
  const t = useT('tournamentLanding');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<number | null>(0);

  const items = useMemo(
    () => [
      { id: 0, q: t.faqQ1, a: t.faqA1 },
      { id: 1, q: t.faqQ2, a: t.faqA2 },
      { id: 2, q: t.faqQ3, a: t.faqA3 },
      { id: 3, q: t.faqQ4, a: t.faqA4 },
      { id: 4, q: t.faqQ5, a: t.faqA5 },
      { id: 5, q: t.faqQ6, a: t.faqA6 },
    ],
    [t]
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (it) =>
        it.q.toLowerCase().includes(needle) || it.a.toLowerCase().includes(needle)
    );
  }, [items, query]);

  return (
    <Section id="faq">
      <SectionHeader
        eyebrow={t.faqEyebrow}
        title={t.faqHeading}
        subtitle={t.faqSubtitle}
      />

      <div className="mx-auto max-w-2xl">
        {/* Recherche */}
        <div className="relative mb-6">
          <svg
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.faqSearchPlaceholder}
            aria-label={t.faqSearchPlaceholder}
            className="w-full rounded-2xl border border-white/12 bg-white/[0.04] py-3 pl-11 pr-4 text-sm text-white placeholder:text-gray-500 outline-none transition-colors focus:border-[var(--color-violet)]/60"
          />
        </div>

        {filtered.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-6 py-10 text-center text-sm text-gray-400">
            {t.faqNoResults}
          </p>
        ) : (
          <ul className="space-y-3">
            {filtered.map((it) => {
              const open = openId === it.id;
              return (
                <li
                  key={it.id}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition-colors hover:border-white/20"
                >
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpenId(open ? null : it.id)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet)]/60"
                  >
                    <span className="text-sm font-semibold text-white">{it.q}</span>
                    <svg
                      className={`h-5 w-5 shrink-0 text-[var(--color-violet-light)] transition-transform duration-300 ${open ? 'rotate-45' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                  <div
                    className={`grid transition-all duration-300 ease-out ${
                      open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                    }`}
                  >
                    <div className="overflow-hidden">
                      <p className="px-5 pb-5 text-sm leading-relaxed text-gray-400">
                        {it.a}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Section>
  );
}
