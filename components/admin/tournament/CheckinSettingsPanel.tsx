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

type Dict = ReturnType<typeof useAdminT<'adminTournamentCheckin'>>;

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
): { label: string; className: string } {
  switch (status) {
    case 'pending':
      return {
        label: t.statusPending,
        className: 'bg-blue-600/20 text-blue-300 border-blue-500/30',
      };
    case 'ongoing':
      return {
        label: t.statusOngoing,
        className: 'bg-emerald-600/20 text-emerald-300 border-emerald-500/30',
      };
    case 'finished':
      return {
        label: t.statusFinished,
        className: 'bg-neutral-600/20 text-neutral-400 border-neutral-500/30',
      };
    case 'walkover':
      return {
        label: t.statusWalkover,
        className: 'bg-red-700/30 text-red-200 border-red-500/30',
      };
    case 'cancelled':
      return {
        label: t.statusCancelled,
        className: 'bg-amber-700/30 text-amber-200 border-amber-500/30',
      };
    default:
      return {
        label: status,
        className: 'bg-neutral-600/20 text-neutral-300 border-neutral-500/30',
      };
  }
}

export default function CheckinSettingsPanel() {
  const t = useAdminT('adminTournamentCheckin');
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
          <p className="text-sm text-neutral-400 mt-1">{t.pageSubtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/tournament/${tournamentId}/checkin?tab=live`}
            className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-sm font-medium transition-colors"
          >
            {t.liveConsole}
          </Link>
          <button
            type="button"
            onClick={() => {
              setGraceDraft(String(graceMinutes));
              setSettingsOpen(true);
            }}
            className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors"
            title={format(t.currentGraceTitle, { minutes: graceMinutes })}
          >
            {t.configureCheckin}
          </button>
          <button
            type="button"
            onClick={fetchData}
            className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors"
          >
            {t.refresh}
          </button>
          <button
            type="button"
            onClick={processNow}
            disabled={processing}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {processing ? t.processing : t.processNow}
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Stat label={t.statMatches} value={stats.total} />
        <Stat label={t.statUpcoming} value={stats.upcoming} accent="blue" />
        <Stat
          label={t.statAllCheckedIn}
          value={stats.bothCheckedIn}
          accent="emerald"
        />
        <Stat label={t.statNoCheckin} value={stats.noCheckin} accent="amber" />
        <Stat label={t.statAutoForfeits} value={stats.forfeited} accent="red" />
      </div>

      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={() => setFilter('upcoming')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            filter === 'upcoming'
              ? 'bg-blue-600 text-white'
              : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
          }`}
        >
          {t.filterUpcoming}
        </button>
        <button
          type="button"
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            filter === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
          }`}
        >
          {t.filterAll}
        </button>
        <span className="ml-auto text-xs text-neutral-500">
          {format(t.matchCount, { count: visibleRows.length })}
        </span>
      </div>

      {errorMsg && (
        <div className="mb-4 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="text-center py-20 text-neutral-500 text-sm">
          {t.emptyMatches}
        </div>
      ) : (
        <div className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-800/80 text-xs uppercase tracking-wide text-neutral-400">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left">{t.thDate}</th>
                  <th scope="col" className="px-4 py-3 text-left">{t.thMatch}</th>
                  <th scope="col" className="px-4 py-3 text-center">{t.thStatus}</th>
                  <th scope="col" className="px-4 py-3 text-center">{t.thEmail}</th>
                  <th scope="col" className="px-4 py-3 text-center">{t.thT30}</th>
                  <th scope="col" className="px-4 py-3 text-center">{t.thT15}</th>
                  <th scope="col" className="px-4 py-3 text-center">{t.thTeam1}</th>
                  <th scope="col" className="px-4 py-3 text-center">{t.thTeam2}</th>
                  <th scope="col" className="px-4 py-3 text-left">{t.thReason}</th>
                  <th scope="col" className="px-4 py-3 text-right">{t.thAction}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-700/50">
                {visibleRows.map((r) => {
                  const badge = statusBadge(t, r.status);
                  return (
                    <tr key={r.matchId} className="hover:bg-neutral-700/20">
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-neutral-300">
                        {formatDateFr(r.scheduledAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-white text-sm">
                          {r.team1.name || '—'}{' '}
                          <span className="text-neutral-500">vs</span>{' '}
                          {r.team2.name || '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-xs">
                        {r.emailSentAt ? (
                          <span className="text-emerald-300">
                            {formatTimeFr(r.emailSentAt)}
                          </span>
                        ) : (
                          <span className="text-neutral-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-xs">
                        {r.reminder30At ? (
                          <span className="text-amber-300">
                            {formatTimeFr(r.reminder30At)}
                          </span>
                        ) : (
                          <span className="text-neutral-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-xs">
                        {r.reminder15At ? (
                          <span className="text-red-300">
                            {formatTimeFr(r.reminder15At)}
                          </span>
                        ) : (
                          <span className="text-neutral-600">—</span>
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
                          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium border bg-red-700/30 text-red-200 border-red-500/30">
                            {noShowReasonLabel(t, noShowReasons[r.matchId])}
                          </span>
                        ) : (
                          <span className="text-neutral-600 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/matches/${r.matchId}/edit`}
                          className="text-xs text-blue-400 hover:text-blue-300"
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

      <p className="text-xs text-neutral-500 mt-6 text-center">
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
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
            >
              {t.cancel}
            </button>
            <button
              type="button"
              onClick={handleSaveSettings}
              disabled={savingSettings}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {savingSettings ? t.saving : t.save}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label
              htmlFor="checkin-grace-minutes"
              className="block text-sm font-medium text-neutral-200 mb-1"
            >
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
              className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-neutral-500 mt-1.5">
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
  accent?: 'blue' | 'emerald' | 'amber' | 'red';
}) {
  const colors: Record<string, string> = {
    blue: 'text-blue-300',
    emerald: 'text-emerald-300',
    amber: 'text-amber-300',
    red: 'text-red-300',
  };
  const accentColor = accent ? colors[accent] : 'text-white';
  return (
    <div className="bg-neutral-800/50 border border-neutral-700/50 rounded-xl px-4 py-3">
      <p className="text-xs text-neutral-400 uppercase tracking-wide">
        {label}
      </p>
      <p className={`text-2xl font-bold mt-1 ${accentColor}`}>{value}</p>
    </div>
  );
}

function CheckinDot({ at }: { at: string | null }) {
  const t = useAdminT('adminTournamentCheckin');
  if (at) {
    return (
      <span
        className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-600/20 border border-emerald-500/40"
        title={format(t.checkinAtTitle, { time: formatTimeFr(at) })}
      >
        <svg
          className="w-3 h-3 text-emerald-400"
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
  return <span className="inline-block w-2 h-2 rounded-full bg-neutral-700" />;
}
