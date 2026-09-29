// features/admin/teams/ui/TeamsListTable.tsx — le corps de la liste staff des
// équipes (/admin/teams), présentationnel : squelette, état vide, ligne « tout
// sélectionner » et une ligne par équipe. Il reçoit les lignes et les gestes
// (sélection, suppression) ; il ne charge rien.

import Image from 'next/image';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTeamsList from '@/lib/i18n/locales/admin-fr/adminTeamsList';
import EmptyState from '@/components/admin/EmptyState';
import { SkeletonListRow } from '@/components/admin/Skeleton';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import type { TeamRow } from '@/types/admin';

function formatDate(d: string | null) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return d;
  }
}

const CHECKBOX =
  'h-4 w-4 shrink-0 rounded-[3px] border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] accent-[var(--or,#b467d1)]';

function TeamsListRow({
  team,
  selected,
  onToggle,
  onDelete,
}: {
  team: TeamRow;
  selected: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const t = useAdminT(nsAdminTeamsList);
  return (
    <div
      className={`group flex flex-col gap-3 p-4 transition-colors hover:bg-[var(--s2,#1d1520)] sm:flex-row sm:items-center sm:gap-4 ${
        selected ? 'bg-[rgba(180,103,209,.06)]' : ''
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className={CHECKBOX}
        />

        <div className="shrink-0">
          {team.logo_url ? (
            <Image
              src={team.logo_url}
              alt={team.name}
              width={48}
              height={48}
              className="h-10 w-10 rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] object-cover sm:h-12 sm:w-12"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s3,#2f2732)] sm:h-12 sm:w-12">
              <svg
                aria-hidden
                className="h-5 w-5 text-[var(--t4,#807984)] sm:h-6 sm:w-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold text-[var(--t1,#f4edf7)]">
              {team.name}
            </h3>
            {team.short_name && <Chip tone="neutral">{team.short_name}</Chip>}
            <Chip tone={team.is_active ? 'ok' : 'neutral'}>
              {team.is_active ? t.active : t.inactive}
            </Chip>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--t3,#a39ba6)] sm:gap-3">
            {team.slug && (
              <span className="rounded-[3px] bg-[var(--s2,#1d1520)] px-2 py-0.5 font-mono text-xs text-[var(--t4,#807984)]">
                /{team.slug}
              </span>
            )}
            {team.country && (
              <>
                <span>{team.country}</span>
                <span className="hidden sm:inline">•</span>
              </>
            )}
            <span data-numeric>
              {format(t.createdOn, { date: formatDate(team.created_at) })}
            </span>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 pl-7 sm:pl-0">
        <AdminButtonLink
          href={`/admin/teams/${team.id}/edit`}
          variant="ghost"
          size="sm"
        >
          {t.edit}
        </AdminButtonLink>
        <AdminButton
          variant="danger"
          size="sm"
          onClick={onDelete}
          title={t.deleteTitle}
          aria-label={t.deleteTitle}
        >
          <svg
            aria-hidden
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </AdminButton>
      </div>
    </div>
  );
}

export default function TeamsListTable({
  teams,
  loading,
  selected,
  onToggleSelect,
  onToggleSelectAll,
  onDelete,
}: {
  teams: TeamRow[];
  loading: boolean;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onDelete: (team: TeamRow) => void;
}) {
  const t = useAdminT(nsAdminTeamsList);
  return (
    <section className="overflow-hidden rounded-[var(--r-card,14px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s1,#100812)]">
      {loading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonListRow key={i} />
          ))}
        </div>
      ) : teams.length === 0 ? (
        <EmptyState title={t.emptyTitle} description={t.emptyDesc} />
      ) : (
        <div className="divide-y divide-[var(--line,rgba(194,196,201,.12))]">
          {/* Ligne « tout sélectionner » */}
          <div className="flex items-center gap-3 bg-[var(--s2,#1d1520)] px-4 py-3">
            <input
              type="checkbox"
              checked={selected.size === teams.length && teams.length > 0}
              onChange={onToggleSelectAll}
              className={CHECKBOX}
            />
            <span className="font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--t3,#a39ba6)] [font-stretch:75%]">
              {t.selectAll}
            </span>
          </div>

          {teams.map((team) => (
            <TeamsListRow
              key={team.id}
              team={team}
              selected={selected.has(team.id)}
              onToggle={() => onToggleSelect(team.id)}
              onDelete={() => onDelete(team)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
