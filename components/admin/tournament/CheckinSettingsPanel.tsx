// components/admin/tournament/CheckinSettingsPanel.tsx
// Check-in "settings" panel: per-match check-in status + grace-minutes config.
// Extracted from the former /admin/tournament/[id]/checkin page; now hosted as
// the `settings` sub-tab of the merged check-in route.

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import Modal from '@/components/admin/Modal';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTournamentCheckin from '@/lib/i18n/locales/admin-fr/adminTournamentCheckin';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import Chip, { type ChipTone } from '@/features/admin/_shared/ui/Chip';
import StatTile from '@/features/admin/_shared/ui/StatTile';
import {
  CARD_FLUSH,
  ERROR_BOX,
  FAINT,
  INPUT,
  LABEL,
  MUTED,
  SPINNER,
} from '@/features/admin/stages/ui/rubanClasses';

type Dict = typeof nsAdminTournamentCheckin.fr;

type CheckinRow = {
  matchId: string;
  scheduledAt: string | null;
  status: string;
  team1: { id: string | null; name: string | null; checkedInAt: string | null };
  team2: { id: string | null; name: string | null; checkedInAt: string | null };
  emailSentAt: string | null;
  reminder30At: string | null;
  reminder15At: string | null;
  forfeitProcessedAt: string | null;
};

type ApiResponse = { matches: CheckinRow[] };

type SettingsResponse = {
  checkinGraceMinutes: number;
  migrated: boolean;
  noShowReasons: Record<string, string>;
};

const DEFAULT_GRACE_MINUTES = 60;

function noShowReasonLabel(t: Dict, reason: string): string {
  switch (reason) {
    case 'auto_forfeit_no_checkin':
      return t.reasonAutoForfeit;
    default:
      return reason;
  }
}

function formatDateFr(value: string | null): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Paris',
    });
  } catch {
    return value;
  }
}

function formatTimeFr(value: string | null): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Paris',
    });
  } catch {
    return value;
  }
}

function statusBadge(
  t: Dict,
  status: string
): { label: string; tone: ChipTone } {
  switch (status) {
    case 'pending':
      return {
        label: t.statusPending,
        tone: 'neutral',
      };
    case 'ongoing':
      return {
        label: t.statusOngoing,
        tone: 'live',
      };
    case 'finished':
      return {
        label: t.statusFinished,
        tone: 'ok',
      };
    case 'walkover':
      return {
        label: t.statusWalkover,
        tone: 'err',
      };
    case 'cancelled':
      return {
        label: t.statusCancelled,
        tone: 'warn',
      };
    default:
      return {
        label: status,
        tone: 'neutral',
      };
  }
}

export default function CheckinSettingsPanel() {
  const t = useAdminT(nsAdminTournamentCheckin);
  const router = useRouter();
  const { id } = router.query;
  const tournamentId = Array.isArray(id) ? id[0] : id;
  const { addToast } = useToast();
  const { adminFetchJson } = useAdminFetch();
  const { mutate: processCheckin } = useIdempotentMutation();

  const { mutate: saveSettings } = useIdempotentMutation();

  const [rows, setRows] = useState<CheckinRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<'upcoming' | 'all'>('upcoming');

  const [graceMinutes, setGraceMinutes] = useState<number>(
    DEFAULT_GRACE_MINUTES
  );
  const [noShowReasons, setNoShowReasons] = useState<Record<string, string>>(
    {}
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [graceDraft, setGraceDraft] = useState<string>(
    String(DEFAULT_GRACE_MINUTES)
  );
  const [savingSettings, setSavingSettings] = useState(false);

  const fetchSettings = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const json = await adminFetchJson<SettingsResponse>(
        `/api/admin/tournament/${tournamentId}/checkin-settings`
      );
      const minutes =
        typeof json.checkinGraceMinutes === 'number'
          ? json.checkinGraceMinutes
          : DEFAULT_GRACE_MINUTES;
      setGraceMinutes(minutes);
      setGraceDraft(String(minutes));
      setNoShowReasons(json.noShowReasons || {});
    } catch {
      // Non-blocking: settings are auxiliary. Keep defaults, never break the page.
      setGraceMinutes(DEFAULT_GRACE_MINUTES);
      setNoShowReasons({});
    }
  }, [tournamentId, adminFetchJson]);

  const fetchData = useCallback(async () => {
    if (!tournamentId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const json = await adminFetchJson<ApiResponse>(
        `/api/admin/tournament/${tournamentId}/checkin`
      );
      setRows(json.matches || []);
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tournamentId, adminFetchJson]);

  useEffect(() => {
    fetchData();
    fetchSettings();
  }, [fetchData, fetchSettings]);

  async function handleSaveSettings() {
    if (!tournamentId) return;
    const minutes = Number(graceDraft);
    if (!Number.isInteger(minutes) || minutes < 0 || minutes > 120) {
      addToast(t.graceValidation, 'error');
      return;
    }
    setSavingSettings(true);
    try {
      const res = await saveSettings(
        `/api/admin/tournament/${tournamentId}/checkin-settings`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ checkinGraceMinutes: minutes }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          json.error ||
            (res.status === 503 ? t.errorMigrationMissing : t.errorSave)
        );
      }
      setGraceMinutes(minutes);
      setSettingsOpen(false);
      addToast(t.graceUpdated, 'success');
    } catch (err) {
      addToast((err as Error).message, 'error');
    } finally {
      setSavingSettings(false);
    }
  }

  async function processNow() {
    if (!tournamentId) return;
    setProcessing(true);
    try {
      const res = await processCheckin(
        `/api/admin/tournament/${tournamentId}/checkin`,
        { method: 'POST' }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || t.errorGeneric);
      addToast(
        format(t.processResult, {
          scanned: json.scanned,
          acted: json.acted,
          errors: json.errors,
        }),
        json.errors > 0 ? 'error' : 'success'
      );
      await fetchData();
    } catch (err) {
      addToast((err as Error).message, 'error');
    } finally {
      setProcessing(false);
    }
  }

  const now = Date.now();
  const visibleRows =
    filter === 'upcoming'
      ? rows.filter(
          (r) =>
            r.status === 'pending' ||
            r.status === 'ongoing' ||
            (r.scheduledAt &&
              new Date(r.scheduledAt).getTime() > now - 86_400_000)
        )
      : rows;

  // Aggregates
  const stats = {
    total: rows.length,
    upcoming: rows.filter((r) => r.status === 'pending').length,
    bothCheckedIn: rows.filter(
      (r) => r.team1.checkedInAt && r.team2.checkedInAt
    ).length,
    noCheckin: rows.filter(
      (r) =>
        r.status === 'pending' && !r.team1.checkedInAt && !r.team2.checkedInAt
    ).length,
    forfeited: rows.filter((r) => r.forfeitProcessedAt).length,
  };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t.pageTitle}</h1>
          <p className={`mt-1 text-sm ${MUTED}`}>{t.pageSubtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <AdminButtonLink
            href={`/admin/tournament/${tournamentId}/checkin?tab=live`}
            variant="secondary"
            size="sm"
          >
            {t.liveConsole}
          </AdminButtonLink>
          <AdminButton
            size="sm"
            onClick={() => {
              setGraceDraft(String(graceMinutes));
              setSettingsOpen(true);
            }}
            title={format(t.currentGraceTitle, { minutes: graceMinutes })}
          >
            {t.configureCheckin}
          </AdminButton>
          <AdminButton size="sm" onClick={fetchData}>
            {t.refresh}
          </AdminButton>
          <AdminButton
            variant="primary"
            size="sm"
            onClick={processNow}
            disabled={processing}
          >
            {processing ? t.processing : t.processNow}
          </AdminButton>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Stat label={t.statMatches} value={stats.total} />
        <Stat label={t.statUpcoming} value={stats.upcoming} accent="brand" />
        <Stat
          label={t.statAllCheckedIn}
          value={stats.bothCheckedIn}
          accent="ok"
        />
        <Stat label={t.statNoCheckin} value={stats.noCheckin} accent="warn" />
        <Stat label={t.statAutoForfeits} value={stats.forfeited} accent="err" />
      </div>

      <div className="flex items-center gap-2 mb-3">
        <AdminButton
          size="xs"
          variant={filter === 'upcoming' ? 'secondary' : 'ghost'}
          onClick={() => setFilter('upcoming')}
        >
          {t.filterUpcoming}
        </AdminButton>
        <AdminButton
          size="xs"
          variant={filter === 'all' ? 'secondary' : 'ghost'}
          onClick={() => setFilter('all')}
        >
          {t.filterAll}
        </AdminButton>
        <span className={`ml-auto text-xs ${FAINT}`}>
          {format(t.matchCount, { count: visibleRows.length })}
        </span>
      </div>

      {errorMsg && <div className={`mb-4 ${ERROR_BOX}`}>{errorMsg}</div>}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className={SPINNER} />
        </div>
      ) : visibleRows.length === 0 ? (
        <div className={`py-20 text-center text-sm ${FAINT}`}>
          {t.emptyMatches}
        </div>
      ) : (
        <div className={CARD_FLUSH}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--s2,#1d1520)]">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left">
                    {t.thDate}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left">
                    {t.thMatch}
                  </th>
                  <th scope="col" className="px-4 py-3 text-center">
                    {t.thStatus}
                  </th>
                  <th scope="col" className="px-4 py-3 text-center">
                    {t.thEmail}
                  </th>
                  <th scope="col" className="px-4 py-3 text-center">
                    {t.thT30}
                  </th>
                  <th scope="col" className="px-4 py-3 text-center">
                    {t.thT15}
                  </th>
                  <th scope="col" className="px-4 py-3 text-center">
                    {t.thTeam1}
                  </th>
                  <th scope="col" className="px-4 py-3 text-center">
                    {t.thTeam2}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left">
                    {t.thReason}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    {t.thAction}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line,rgba(194,196,201,.12))]">
                {visibleRows.map((r) => {
                  const badge = statusBadge(t, r.status);
                  return (
                    <tr
                      key={r.matchId}
                      className="hover:bg-[var(--s2,#1d1520)]"
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-[var(--t2,#c7bfca)]">
                        {formatDateFr(r.scheduledAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-[var(--t1,#f4edf7)]">
                          {r.team1.name || '—'}{' '}
                          <span className={FAINT}>vs</span>{' '}
                          {r.team2.name || '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Chip tone={badge.tone}>{badge.label}</Chip>
                      </td>
                      <td className="px-4 py-3 text-center text-xs">
                        {r.emailSentAt ? (
                          <span className="font-mono text-[var(--t2,#c7bfca)]">
                            {formatTimeFr(r.emailSentAt)}
                          </span>
                        ) : (
                          <span className={FAINT}>—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-xs">
                        {r.reminder30At ? (
                          <span className="font-mono text-[var(--t2,#c7bfca)]">
                            {formatTimeFr(r.reminder30At)}
                          </span>
                        ) : (
                          <span className={FAINT}>—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-xs">
                        {r.reminder15At ? (
                          <span className="font-mono text-[var(--t2,#c7bfca)]">
                            {formatTimeFr(r.reminder15At)}
                          </span>
                        ) : (
                          <span className={FAINT}>—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <CheckinDot at={r.team1.checkedInAt} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <CheckinDot at={r.team2.checkedInAt} />
                      </td>
                      <td className="px-4 py-3">
                        {noShowReasons[r.matchId] ? (
                          <Chip tone="err">
                            {noShowReasonLabel(t, noShowReasons[r.matchId])}
                          </Chip>
                        ) : (
                          <span className={`text-xs ${FAINT}`}>—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/matches/${r.matchId}/edit`}
                          className="text-xs text-[var(--or-300,#dea3f6)] hover:text-[var(--or-200,#eec4ff)]"
                        >
                          {t.view}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className={`mt-6 text-center text-xs ${FAINT}`}>
        {t.footerBefore} <code>scheduled_at</code> {t.footerAfter}
      </p>

      <Modal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title={t.settingsTitle}
        subtitle={t.settingsSubtitle}
        size="md"
        footer={
          <>
            <AdminButton size="sm" onClick={() => setSettingsOpen(false)}>
              {t.cancel}
            </AdminButton>
            <AdminButton
              variant="primary"
              size="sm"
              onClick={handleSaveSettings}
              disabled={savingSettings}
            >
              {savingSettings ? t.saving : t.save}
            </AdminButton>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="checkin-grace-minutes" className={LABEL}>
              {t.graceLabel}
            </label>
            <input
              id="checkin-grace-minutes"
              type="number"
              min={0}
              max={120}
              step={1}
              value={graceDraft}
              onChange={(e) => setGraceDraft(e.target.value)}
              className={INPUT}
            />
            <p className={`mt-1.5 text-xs ${FAINT}`}>
              {format(t.graceHelp, { default: DEFAULT_GRACE_MINUTES })}
            </p>
          </div>
        </div>
      </Modal>
    </>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: 'brand' | 'ok' | 'warn' | 'err';
}) {
  return <StatTile label={label} value={value} tone={accent ?? 'neutral'} />;
}

function CheckinDot({ at }: { at: string | null }) {
  const t = useAdminT(nsAdminTournamentCheckin);
  if (at) {
    return (
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded-[3px] border border-[rgba(127,202,101,.36)] bg-[rgba(127,202,101,.13)]"
        title={format(t.checkinAtTitle, { time: formatTimeFr(at) })}
      >
        <svg
          className="h-3 w-3 text-[var(--lf,#7fca65)]"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      </span>
    );
  }
  return (
    <span className="inline-block h-2 w-2 rounded-full bg-[var(--s3,#2f2732)]" />
  );
}
