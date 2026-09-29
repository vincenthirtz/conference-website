// components/admin/teams/TeamHistoryPanel.tsx
//
// Historique staff d'une équipe.
//
// L'endpoint GET /api/admin/teams/[teamId]/history existait déjà — et n'était
// appelé par personne. Il agrège pourtant ce qu'on cherche en premier quand un
// roster paraît faux : qui a touché à cette équipe, quand, et pour quoi faire.
// Sans lui, la réponse se cherchait dans `/admin/logs` en filtrant à la main.
//
// Replié par défaut : c'est une question qu'on se pose parfois, pas à chaque
// ouverture de la fiche, et l'écran est déjà dense. Le chargement n'a lieu qu'au
// dépliage — un historique que personne n'ouvre ne doit rien coûter.

import { useState } from 'react';
import { useTeamHistory } from '@/features/admin/teams/hooks/useTeamsQueries';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTeamEdit from '@/lib/i18n/locales/admin-fr/adminTeamEdit';

const PAGE_SIZE = 20;

export default function TeamHistoryPanel({ teamId }: { teamId: string }) {
  const t = useAdminT(nsAdminTeamEdit);

  const [open, setOpen] = useState(false);
  // Chargé au premier dépliage seulement ; ensuite, gardé en cache.
  const [requested, setRequested] = useState(false);
  const historyQuery = useTeamHistory(teamId, PAGE_SIZE, requested);
  const logs = historyQuery.isError ? [] : (historyQuery.data ?? null);
  const error = historyQuery.error
    ? historyQuery.error.message || t.historyLoadError
    : null;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) setRequested(true);
  };

  return (
    <section
      className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-6"
      data-testid="team-history"
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <h2 className="font-[family-name:var(--fd)] text-[12px] font-bold uppercase tracking-[0.22em] text-[var(--t3,#a39ba6)] [font-stretch:75%]">
          {t.historyTitle}
        </h2>
        <span className="text-xs text-[var(--t4,#807984)]" aria-hidden>
          {open ? '▾' : '▸'}
        </span>
      </button>

      {open && (
        <div className="mt-3">
          {error && (
            <p className="text-xs text-[var(--err,#ff6b6b)]" role="alert">
              {error}
            </p>
          )}
          {logs === null ? (
            <p className="text-xs text-[var(--t3,#a39ba6)]">
              {t.historyLoading}
            </p>
          ) : logs.length === 0 ? (
            <p className="text-xs text-[var(--t3,#a39ba6)]">{t.historyEmpty}</p>
          ) : (
            <ul className="space-y-2">
              {logs.map((l) => (
                <li
                  key={l.id}
                  className="rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] px-3 py-2 text-xs"
                >
                  <div className="text-[var(--t1,#f4edf7)]">
                    {l.readableAction}
                  </div>
                  <div className="mt-0.5 text-[var(--t3,#a39ba6)]">
                    {l.date}
                    {l.readableEntity ? ` • ${l.readableEntity}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {logs !== null && logs.length >= PAGE_SIZE && (
            <p className="mt-2 text-[11px] text-[var(--t4,#807984)]">
              {format(t.historyTruncated, { count: PAGE_SIZE })}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
