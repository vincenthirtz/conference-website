// features/admin/tournaments/ui/TournamentRulesLists.tsx — les deux listes
// de la section « Règlement » : les versions déposées (la plus récente en
// tête, « En vigueur », téléchargement) et les validations équipe par équipe
// (« 5/7 validations », le détail des manquants). Plus la pastille
// « Règlement X/Y » réutilisée par le hub du tournoi.
//
// Présentationnel : les données arrivent de la section (ou du hub).

import type { UseQueryResult } from '@tanstack/react-query';
import {
  Button,
  Chip,
  rubanErr,
  rubanInset,
  rubanMuted,
} from '@/features/ruban';
import { format, useAdminT } from '@/lib/i18n/useAdminT';
import { useLocale } from '@/lib/i18n/useLocale';
import nsAdminTournamentRules from '@/lib/i18n/locales/admin-fr/adminTournamentRules';
import { formatSiteDate } from '@/utils/timezone';
import {
  tournamentUrls,
  type TournamentRulesMember,
  type TournamentRulesStatusView,
  type TournamentRulesTeamStatus,
  type TournamentRulesVersion,
} from '../client';
import { missingMemberNames } from '../rulesGate';
import { formatFileSize } from '../rulesUpload';

type T = typeof nsAdminTournamentRules.fr;

const DATE_TIME: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

function roleLabel(role: string | null, t: T): string | null {
  if (!role) return null;
  const key = role.trim().toLowerCase() as keyof T['roles'];
  return t.roles[key] ?? role;
}

export function RulesVersionsList({
  tournamentId,
  versions,
  t,
}: {
  tournamentId: string;
  /** Triées, la plus récente d'abord. */
  versions: TournamentRulesVersion[];
  t: T;
}) {
  const locale = useLocale();
  return (
    <div className="mb-6">
      <h3 className="mb-2 text-sm font-semibold text-[var(--t1,#f4edf7)]">
        {t.versionsTitle}
      </h3>
      {versions.length === 0 ? (
        <p className={`text-sm ${rubanMuted}`}>{t.versionsEmpty}</p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label={t.versionsTitle}>
          {versions.map((v, i) => {
            const date = formatSiteDate(v.createdAt, locale, DATE_TIME);
            return (
              <li
                key={v.id}
                data-testid="rules-version"
                className={`${rubanInset} flex flex-wrap items-start justify-between gap-3 px-3 py-2`}
              >
                <div className="min-w-0 text-sm">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-[var(--t1,#f4edf7)]">
                    {format(t.versionLabel, { number: v.number })}
                    {i === 0 && <Chip tone="ok">{t.versionCurrent}</Chip>}
                    <Chip tone={v.requiresRevalidation ? 'warn' : 'neutral'}>
                      {v.requiresRevalidation
                        ? t.versionImportant
                        : t.versionMinor}
                    </Chip>
                  </p>
                  <p className={`mt-0.5 text-xs ${rubanMuted}`}>
                    {[v.fileName, formatFileSize(v.sizeBytes, locale)]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  <p className={`text-xs ${rubanMuted}`}>
                    {v.createdBy
                      ? format(t.versionMetaBy, { date, by: v.createdBy })
                      : format(t.versionMeta, { date })}
                  </p>
                  {v.note && (
                    <p className="mt-1 whitespace-pre-line text-xs text-[var(--t2,#c7bfca)]">
                      {v.note}
                    </p>
                  )}
                </div>
                <a
                  href={tournamentUrls.rulesFile(tournamentId, v.number)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={format(t.downloadLabel, { number: v.number })}
                  className="inline-flex h-[30px] shrink-0 items-center rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] px-3 font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.02em] text-[var(--t2,#c7bfca)] transition-colors hover:border-[var(--t4,#807984)] hover:text-[var(--t1,#f4edf7)]"
                >
                  {t.download}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function memberState(m: TournamentRulesMember, t: T, locale: string): string {
  if (m.accepted)
    return format(t.memberAccepted, {
      date: m.acceptedAt
        ? formatSiteDate(m.acceptedAt, locale, DATE_TIME)
        : '—',
    });
  return m.userId ? t.memberPending : t.memberNoAccount;
}

export function RulesValidationsList({
  query,
  t,
  onRefresh,
}: {
  query: UseQueryResult<TournamentRulesStatusView>;
  t: T;
  onRefresh: () => void;
}) {
  const locale = useLocale();
  const teams = query.data?.teams ?? [];
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--t1,#f4edf7)]">
          {t.validationsTitle}
        </h3>
        <Button
          size="xs"
          variant="ghost"
          onClick={onRefresh}
          disabled={query.isFetching}
        >
          {t.refresh}
        </Button>
      </div>
      {query.isError && (
        <p role="alert" className={`${rubanErr} px-3 py-2 text-sm`}>
          {t.validationsLoadError}
        </p>
      )}
      {query.data && teams.length === 0 && (
        <p className={`text-sm ${rubanMuted}`}>{t.validationsEmpty}</p>
      )}
      {teams.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label={t.validationsTitle}>
          {teams.map((team) => {
            const missing = team.members.filter((m) => !m.accepted);
            return (
              <li
                key={team.teamId}
                data-testid="rules-team-status"
                className={`${rubanInset} px-3 py-2`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-[var(--t1,#f4edf7)]">
                    {team.name}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={`text-xs ${rubanMuted}`} data-numeric>
                      {format(t.teamCount, {
                        validated: team.validated,
                        total: team.total,
                      })}
                    </span>
                    <Chip tone={team.complete ? 'ok' : 'warn'}>
                      {team.complete ? t.teamComplete : t.teamIncomplete}
                    </Chip>
                  </span>
                </div>
                {missing.length > 0 && (
                  <details className="mt-1">
                    <summary className={`cursor-pointer text-xs ${rubanMuted}`}>
                      {format(t.missingTitle, { count: missing.length })}
                    </summary>
                    <ul className="mt-1 space-y-0.5 pl-3 text-xs text-[var(--t2,#c7bfca)]">
                      {missing.map((m, i) => {
                        const role = roleLabel(m.role, t);
                        return (
                          <li key={m.userId ?? `no-account-${i}`}>
                            {m.name}
                            {role ? ` (${role})` : ''} —{' '}
                            {memberState(m, t, locale)}
                          </li>
                        );
                      })}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * « Règlement 5/7 » d'une équipe (hub du tournoi, demandes d'inscription).
 * Info-bulle : les noms des manquants.
 */
export function TournamentRulesChip({
  team,
  noVersion = false,
}: {
  team?: TournamentRulesTeamStatus | null;
  /** Réglage allumé mais aucune version déposée. */
  noVersion?: boolean;
}) {
  const t = useAdminT(nsAdminTournamentRules);
  if (noVersion) {
    return (
      <Chip tone="warn" data-testid="rules-chip">
        {t.chipNoVersion}
      </Chip>
    );
  }
  if (!team) return null;
  const names = missingMemberNames(team);
  return (
    <Chip
      tone={team.complete ? 'ok' : 'warn'}
      title={
        team.complete
          ? t.chipTitleComplete
          : format(t.chipTitleIncomplete, { names: names.join(', ') })
      }
      data-testid="rules-chip"
    >
      {format(t.chipLabel, { validated: team.validated, total: team.total })}
    </Chip>
  );
}
