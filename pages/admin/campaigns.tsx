import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import Modal from '@/components/admin/Modal';
import { useAdminT, format } from '@/lib/i18n/useAdminT';

type Dict = ReturnType<typeof useAdminT<'adminCampaigns'>>;

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type Props = {
  staff: StaffShape;
};

type CampaignStats = {
  totalSent: number;
  totalFailed: number;
  lastRunAt: string | null;
  runsCount: number;
};

type CampaignSchedule = {
  waveSize: number;
  status: 'scheduled' | 'paused' | 'completed';
  lastWaveAt: string | null;
  totalRecipients: number;
  pending: number;
  sent: number;
  failed: number;
};

type CampaignBody = {
  heading: string;
  greetingEnabled: boolean;
  bodyParagraphs: string[];
  ctaLabel: string | null;
  ctaUrl: string | null;
  footerNote: string | null;
};

type CampaignSummary = {
  id: string;
  name: string;
  description: string;
  subject: string;
  status: 'active' | 'draft' | 'archived' | string;
  audience: string;
  source: 'builtin' | 'db';
  body: CampaignBody | null;
  stats: CampaignStats;
  schedule: CampaignSchedule | null;
};

type DryRunResult = {
  totalConfirmedUsers: number;
  windowSize: number;
  withLabel: number;
  withoutLabel: number;
};

type WaveResult = {
  attempted: number;
  sent: number;
  failed: number;
  remainingPending: number;
  status: 'scheduled' | 'completed' | 'paused' | 'idle';
};

type SendResult = {
  totalConfirmedUsers: number;
  windowSize: number;
  sent: number;
  failed: number;
  errors?: string[];
};

export const getServerSideProps = withStaffPage('admin');

function getStatusStyles(
  t: Dict
): Record<string, { label: string; className: string }> {
  return {
    active: {
      label: t.statusActive,
      className: 'bg-emerald-600/20 text-emerald-300 border-emerald-500/30',
    },
    draft: {
      label: t.statusDraft,
      className: 'bg-amber-600/20 text-amber-300 border-amber-500/30',
    },
    archived: {
      label: t.statusArchived,
      className: 'bg-neutral-600/20 text-neutral-300 border-neutral-500/30',
    },
  };
}

function getAudienceLabels(t: Dict): Record<string, string> {
  return {
    'all-confirmed-users': t.audienceAllConfirmed,
  };
}

function formatDateTime(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function AdminCampaignsPage(_props: Props) {
  const t = useAdminT('adminCampaigns');
  const router = useRouter();

  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [limit] = useState(25);
  const [offset, setOffset] = useState(0);

  const [activeId, setActiveId] = useState<string | null>(null);
  const activeCampaign = campaigns.find((c) => c.id === activeId) ?? null;

  // Create / edit form: `null` = closed, `'new'` = create, otherwise the
  // db campaign currently being edited.
  const [formTarget, setFormTarget] = useState<'new' | CampaignSummary | null>(
    null
  );

  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { mutateJson } = useIdempotentMutation();
  const { adminFetchJson } = useAdminFetch();
  const { addToast } = useToast();

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      const json = await adminFetchJson<{
        campaigns?: CampaignSummary[];
        total?: number;
      }>('/api/admin/broadcast?' + params.toString());
      setCampaigns(json.campaigns || []);
      setTotal(typeof json.total === 'number' ? json.total : null);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errorUnexpected);
    } finally {
      setLoading(false);
    }
  }, [limit, offset, adminFetchJson, t.errorUnexpected]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const deleteCampaign = useCallback(
    async (campaign: CampaignSummary) => {
      const ok = await confirm({
        title: t.confirmDeleteTitle,
        subtitle: format(t.confirmDeleteSubtitle, { name: campaign.name }),
        variant: 'danger',
        confirmLabel: t.confirmDeleteLabel,
        cancelLabel: t.cancel,
      });
      if (!ok) return;
      try {
        await mutateJson(`/api/admin/broadcast/${campaign.id}`, {
          method: 'DELETE',
        });
        addToast(format(t.campaignDeleted, { name: campaign.name }), 'success');
        await fetchCampaigns();
      } catch (err: unknown) {
        addToast((err as Error)?.message || t.deleteFailed, 'error');
      }
    },
    [confirm, mutateJson, addToast, fetchCampaigns, t]
  );

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <button
              type="button"
              onClick={() => router.push('/admin')}
              className="mb-4 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              {t.backDashboard}
            </button>

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                  {t.heading}
                </h1>
                <p className="text-neutral-400 text-sm mt-1">
                  {t.subtitle}
                  {total !== null
                    ? format(
                        total > 1
                          ? t.subtitleCount_other
                          : t.subtitleCount_one,
                        { total }
                      )
                    : ''}
                </p>
              </div>
              <div className="flex flex-col items-end gap-3">
                <button
                  type="button"
                  onClick={() => setFormTarget('new')}
                  className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-semibold transition-colors flex items-center gap-2"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  {t.createCampaign}
                </button>
                <div className="text-xs text-neutral-500 bg-neutral-800/50 px-3 py-2 rounded-xl border border-neutral-700/50">
                  {t.brevoQuota}
                </div>
              </div>
            </div>
          </div>

          {/* Error */}
          {errorMsg && (
            <div className="mb-6 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm flex items-center gap-2">
              <svg
                className="w-5 h-5 text-red-400 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="flex-1">{errorMsg}</span>
              <button
                type="button"
                onClick={() => fetchCampaigns()}
                className="flex-shrink-0 px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-medium transition-colors"
              >
                {t.retry}
              </button>
            </div>
          )}

          {/* Campaign list */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
            </div>
          ) : campaigns.length === 0 ? (
            <div className="bg-neutral-800/50 border border-neutral-700/50 rounded-2xl p-10 text-center text-neutral-400">
              {t.emptyTitle}
              <p className="text-xs text-neutral-500 mt-2">
                {t.emptyHintPrefix}
                <span className="mx-1 px-1.5 py-0.5 rounded bg-neutral-900 text-neutral-300 font-medium text-[11px]">
                  {t.emptyHintButton}
                </span>
                {t.emptyHintSuffix}
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {campaigns.map((c) => (
                <CampaignCard
                  key={c.id}
                  campaign={c}
                  onOpen={() => setActiveId(c.id)}
                  onEdit={() => setFormTarget(c)}
                  onDelete={() => deleteCampaign(c)}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {!loading && campaigns.length > 0 && (
            <div className="flex justify-between items-center mt-6">
              <button
                type="button"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - limit))}
                className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                {t.prev}
              </button>

              <span className="text-neutral-400 text-sm">
                {offset + 1} – {offset + campaigns.length}
                {total ? format(t.paginationOf, { total }) : ''}
              </span>

              <button
                type="button"
                disabled={total !== null && offset + limit >= total}
                onClick={() => setOffset(offset + limit)}
                className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {t.next}
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {confirmDialog}

      {formTarget && (
        <CampaignFormModal
          campaign={formTarget === 'new' ? null : formTarget}
          onClose={() => setFormTarget(null)}
          onSaved={async () => {
            setFormTarget(null);
            await fetchCampaigns();
          }}
        />
      )}

      {activeCampaign && (
        <CampaignDrawer
          campaign={activeCampaign}
          onClose={() => setActiveId(null)}
          onAfterSend={() => {
            setActiveId(null);
            fetchCampaigns();
          }}
          onRefresh={fetchCampaigns}
        />
      )}
    </>
  );
}

export default AdminCampaignsPage;

function CampaignCard({
  campaign,
  onOpen,
  onEdit,
  onDelete,
}: {
  campaign: CampaignSummary;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useAdminT('adminCampaigns');
  const status = getStatusStyles(t)[campaign.status] ?? {
    label: campaign.status,
    className: 'bg-neutral-600/20 text-neutral-300 border-neutral-500/30',
  };
  const audience = getAudienceLabels(t)[campaign.audience] ?? campaign.audience;
  const isArchived = campaign.status === 'archived';
  const editable = campaign.source === 'db';

  return (
    <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-[260px]">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h2 className="text-lg font-semibold">{campaign.name}</h2>
            <span
              className={`px-2.5 py-0.5 rounded-lg text-[11px] font-semibold border ${status.className}`}
            >
              {status.label}
            </span>
          </div>
          <p className="text-sm text-neutral-400 leading-relaxed">
            {campaign.description}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editable && (
            <>
              <button
                type="button"
                onClick={onEdit}
                className="px-3 py-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-sm font-medium transition-colors flex items-center gap-2"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
                {t.edit}
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="px-3 py-2 rounded-xl border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-sm font-medium transition-colors flex items-center gap-2"
              >
                <svg
                  className="w-4 h-4"
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
                {t.delete}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onOpen}
            disabled={isArchived}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors flex items-center gap-2"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            {t.manage}
          </button>
        </div>
      </div>

      <p className="text-xs text-neutral-500 italic mb-4 truncate">
        {format(t.subjectPrefix, { subject: campaign.subject })}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label={t.statAudience} value={audience} />
        <Stat
          label={t.statTotalSent}
          value={String(campaign.stats.totalSent)}
        />
        <Stat label={t.statFailed} value={String(campaign.stats.totalFailed)} />
        <Stat
          label={t.statLastSent}
          value={formatDateTime(campaign.stats.lastRunAt)}
        />
      </div>

      {campaign.schedule && (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-200 border border-amber-500/30 font-semibold uppercase tracking-wider text-[10px]">
            {campaign.schedule.status === 'scheduled'
              ? t.scheduleScheduled
              : campaign.schedule.status === 'completed'
                ? t.scheduleCompleted
                : t.schedulePaused}
          </span>
          <span className="text-neutral-300">
            {format(t.scheduleSentOf, {
              sent: campaign.schedule.sent,
              total: campaign.schedule.totalRecipients,
            })}
            {campaign.schedule.failed > 0
              ? format(t.scheduleFailedSuffix, {
                  failed: campaign.schedule.failed,
                })
              : ''}
          </span>
          <span className="text-neutral-400">
            {t.scheduleWaveLabel}{' '}
            <strong className="text-neutral-200">
              {campaign.schedule.waveSize}
            </strong>
            {t.scheduleWavePerDay}
          </span>
          <span className="text-neutral-500">
            {format(t.scheduleLastWave, {
              date: formatDateTime(campaign.schedule.lastWaveAt),
            })}
          </span>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-neutral-900/50 rounded-xl p-3 border border-neutral-700/40">
      <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className="text-sm font-medium text-white truncate">{value}</div>
    </div>
  );
}

function CampaignDrawer({
  campaign,
  onClose,
  onAfterSend,
  onRefresh,
}: {
  campaign: CampaignSummary;
  onClose: () => void;
  onAfterSend: () => void;
  onRefresh: () => void | Promise<void>;
}) {
  const t = useAdminT('adminCampaigns');
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { mutateJson } = useIdempotentMutation();
  const { adminFetch } = useAdminFetch();
  const { addToast } = useToast();

  // Live HTML preview
  const [previewLabel, setPreviewLabel] = useState('');
  const previewSrc = `/api/admin/broadcast/${encodeURIComponent(
    campaign.id
  )}/preview${
    previewLabel.trim()
      ? `?label=${encodeURIComponent(previewLabel.trim())}`
      : ''
  }`;

  // Test send
  const [testTo, setTestTo] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);

  // Wave scheduling
  const schedule = campaign.schedule;
  const [waveSize, setWaveSize] = useState<string>(
    schedule ? String(schedule.waveSize) : '10'
  );
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleNotice, setScheduleNotice] = useState<string | null>(null);

  async function postSchedule() {
    const parsed = Number(waveSize);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 290) {
      setScheduleError(t.errorWaveSize);
      return;
    }
    const wave = Math.floor(parsed);

    const recipientLine =
      schedule && typeof schedule.totalRecipients === 'number'
        ? format(t.recipientTotal, { count: schedule.totalRecipients })
        : t.recipientCurrentList;
    const ok = await confirm({
      title: schedule ? t.scheduleUpdateTitle : t.scheduleCreateTitle,
      subtitle: format(t.scheduleConfirmSubtitle, {
        name: campaign.name,
        wave,
        recipients: recipientLine,
      }),
      variant: 'warning',
      confirmLabel: schedule ? t.scheduleUpdateLabel : t.scheduleCreateLabel,
      cancelLabel: t.cancel,
    });
    if (!ok) return;

    setScheduleBusy(true);
    setScheduleError(null);
    setScheduleNotice(null);
    try {
      const json = await mutateJson<{ totalRecipients: number }>(
        `/api/admin/broadcast/${campaign.id}/schedule`,
        {
          method: 'POST',
          body: JSON.stringify({ waveSize: wave }),
        }
      );
      setScheduleNotice(
        format(t.scheduleSavedNotice, {
          count: json.totalRecipients,
          wave,
        })
      );
      addToast(
        format(t.scheduleSavedToast, { count: json.totalRecipients }),
        'success'
      );
      await onRefresh();
    } catch (err: unknown) {
      const msg = (err as Error)?.message || t.scheduleFailed;
      setScheduleError(msg);
      addToast(msg, 'error');
    } finally {
      setScheduleBusy(false);
    }
  }

  async function triggerWaveNow() {
    const pending = schedule?.pending;
    const recipientLine =
      typeof pending === 'number'
        ? format(t.recipientPending, { count: pending })
        : t.recipientRemaining;
    const ok = await confirm({
      title: t.waveNowTitle,
      subtitle: format(t.waveNowSubtitle, {
        name: campaign.name,
        recipients: recipientLine,
        cap: schedule?.waveSize ?? '?',
      }),
      variant: 'warning',
      confirmLabel: t.waveNowConfirm,
      cancelLabel: t.cancel,
    });
    if (!ok) return;

    setScheduleBusy(true);
    setScheduleError(null);
    setScheduleNotice(null);
    try {
      const json = await mutateJson<{
        sent: number;
        failed: number;
        remainingPending: number;
      }>(`/api/admin/broadcast/${campaign.id}/wave`, {
        method: 'POST',
      });
      setScheduleNotice(
        format(t.waveSentNotice, {
          sent: json.sent,
          failed: json.failed,
          remaining: json.remainingPending,
        })
      );
      addToast(
        format(t.waveSentToast, { sent: json.sent, failed: json.failed }),
        json.failed > 0 ? 'warning' : 'success'
      );
      await onRefresh();
    } catch (err: unknown) {
      const msg = (err as Error)?.message || t.waveFailed;
      setScheduleError(msg);
      addToast(msg, 'error');
    } finally {
      setScheduleBusy(false);
    }
  }

  async function cancelSchedule() {
    const ok = await confirm({
      title: t.cancelScheduleTitle,
      subtitle: t.cancelScheduleSubtitle,
      variant: 'warning',
      confirmLabel: t.cancelScheduleConfirm,
      cancelLabel: t.keep,
    });
    if (!ok) return;
    setScheduleBusy(true);
    setScheduleError(null);
    setScheduleNotice(null);
    try {
      await mutateJson(`/api/admin/broadcast/${campaign.id}/schedule`, {
        method: 'DELETE',
      });
      setScheduleNotice(t.scheduleCancelledNotice);
      addToast(t.scheduleCancelledNotice, 'success');
      await onRefresh();
    } catch (err: unknown) {
      const msg = (err as Error)?.message || t.cancelFailed;
      setScheduleError(msg);
      addToast(msg, 'error');
    } finally {
      setScheduleBusy(false);
    }
  }

  // Dry-run + broadcast
  const [limit, setLimit] = useState<string>('');
  const [offset, setOffset] = useState<string>('0');
  const [dryRunBusy, setDryRunBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function buildBody(extra: Record<string, unknown>) {
    const body: Record<string, unknown> = { ...extra };
    const parsedLimit = limit.trim() ? Number(limit) : null;
    const parsedOffset = offset.trim() ? Number(offset) : 0;
    if (Number.isFinite(parsedLimit) && parsedLimit !== null) {
      body.limit = parsedLimit;
    }
    if (Number.isFinite(parsedOffset) && parsedOffset > 0) {
      body.offset = parsedOffset;
    }
    return body;
  }

  async function runTest() {
    const to = testTo.trim();
    if (!to) return;
    setTestSending(true);
    setTestResult(null);
    try {
      const json = await mutateJson<{ success?: boolean; error?: string }>(
        `/api/admin/broadcast/${campaign.id}`,
        {
          method: 'POST',
          body: JSON.stringify({ testTo: to }),
        }
      );
      if (json.success) {
        const okMsg = format(t.testSentResult, { to });
        setTestResult({ ok: true, msg: okMsg });
        addToast(okMsg, 'success');
      } else {
        const msg = json.error || t.testFailedGeneric;
        setTestResult({ ok: false, msg });
        addToast(msg, 'error');
      }
    } catch (err: unknown) {
      const msg = (err as Error)?.message || t.testNetworkError;
      setTestResult({ ok: false, msg });
      addToast(msg, 'error');
    } finally {
      setTestSending(false);
    }
  }

  async function runDryRun() {
    setDryRunBusy(true);
    setActionError(null);
    setDryRun(null);
    setSendResult(null);
    try {
      const res = await adminFetch(`/api/admin/broadcast/${campaign.id}`, {
        method: 'POST',
        body: JSON.stringify(buildBody({ dryRun: true })),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || t.dryRunFailed);
      }
      setDryRun({
        totalConfirmedUsers: json.totalConfirmedUsers,
        windowSize: json.windowSize,
        withLabel: json.withLabel,
        withoutLabel: json.withoutLabel,
      });
    } catch (err: unknown) {
      setActionError((err as Error).message);
    } finally {
      setDryRunBusy(false);
    }
  }

  async function runSend() {
    setSendBusy(true);
    setActionError(null);
    try {
      const json = await mutateJson<SendResult & { errors?: string[] }>(
        `/api/admin/broadcast/${campaign.id}`,
        {
          method: 'POST',
          body: JSON.stringify(buildBody({})),
        }
      );
      setSendResult({
        totalConfirmedUsers: json.totalConfirmedUsers,
        windowSize: json.windowSize,
        sent: json.sent,
        failed: json.failed,
        errors: json.errors,
      });
      addToast(
        format(t.sendDoneToast, { sent: json.sent, failed: json.failed }),
        json.failed > 0 ? 'warning' : 'success'
      );
      setConfirming(false);
    } catch (err: unknown) {
      const msg = (err as Error)?.message || t.sendFailed;
      setActionError(msg);
      addToast(msg, 'error');
      setConfirming(false);
    } finally {
      setSendBusy(false);
    }
  }

  return (
    <>
      {confirmDialog}
      <div
        className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-stretch justify-end"
        onClick={onClose}
      >
        <div
          className="w-full max-w-2xl h-full bg-neutral-900 border-l border-neutral-700/50 overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sticky top-0 z-10 bg-neutral-900/95 backdrop-blur border-b border-neutral-800 px-6 py-4 flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wider text-neutral-500">
                {t.campaignKicker}
              </p>
              <h2 className="text-lg font-semibold truncate">
                {campaign.name}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
              aria-label={t.closeAria}
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <div className="px-6 py-6 space-y-6">
            <section>
              <p className="text-sm text-neutral-300 leading-relaxed">
                {campaign.description}
              </p>
              <div className="mt-4 grid grid-cols-1 gap-2 text-sm">
                <Field label={t.fieldSubject}>{campaign.subject}</Field>
                <Field label={t.fieldAudience}>
                  {getAudienceLabels(t)[campaign.audience] ?? campaign.audience}
                </Field>
                <Field label={t.fieldId}>
                  <code className="font-mono text-xs">{campaign.id}</code>
                </Field>
              </div>
            </section>

            {/* Live preview */}
            <section className="bg-neutral-800/50 border border-neutral-700/50 rounded-xl p-4">
              <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-200">
                    {t.previewHeading}
                  </h3>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {t.previewHint}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={previewLabel}
                    onChange={(e) => setPreviewLabel(e.target.value)}
                    placeholder="Vincent"
                    maxLength={80}
                    className="px-3 py-1.5 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs w-32"
                  />
                  <a
                    href={previewSrc}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-xs font-medium transition-colors"
                  >
                    {t.previewOpen}
                  </a>
                </div>
              </div>
              <div className="rounded-xl overflow-hidden border border-neutral-700/50 bg-neutral-950">
                <iframe
                  key={previewSrc}
                  src={previewSrc}
                  title={t.iframeTitle}
                  sandbox="allow-same-origin"
                  className="w-full h-[520px] bg-white"
                />
              </div>
            </section>

            {/* Test send */}
            <section className="bg-neutral-800/50 border border-neutral-700/50 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-neutral-200 mb-1">
                {t.testHeading}
              </h3>
              <p className="text-xs text-neutral-500 mb-3">{t.testHint}</p>
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[200px]">
                  <input
                    type="email"
                    placeholder="ton.email@example.com"
                    value={testTo}
                    onChange={(e) => setTestTo(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && runTest()}
                    className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={runTest}
                  disabled={testSending || !testTo.trim()}
                  className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors flex items-center gap-2"
                >
                  {testSending ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : null}
                  {t.sendTest}
                </button>
              </div>
              {testResult && (
                <div
                  className={`mt-3 px-3 py-2 rounded-xl border text-sm ${
                    testResult.ok
                      ? 'bg-emerald-900/40 border-emerald-500/50 text-emerald-300'
                      : 'bg-red-900/40 border-red-500/50 text-red-300'
                  }`}
                >
                  {testResult.msg}
                </div>
              )}
            </section>

            {/* Wave scheduling */}
            <section className="bg-neutral-800/50 border border-neutral-700/50 rounded-xl p-4 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-neutral-200">
                  {t.waveSchedulingHeading}
                </h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {t.waveSchedulingHintPrefix}
                  <strong className="text-neutral-300"> waveSize </strong>
                  {t.waveSchedulingHintSuffix}
                </p>
              </div>

              {schedule ? (
                <>
                  <div className="rounded-xl bg-neutral-900/50 border border-neutral-700/40 p-3">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-200 border border-amber-500/30 text-[10px] uppercase tracking-wider font-semibold">
                        {schedule.status === 'scheduled'
                          ? t.statusInProgress
                          : schedule.status === 'completed'
                            ? t.statusCompletedFem
                            : t.statusPaused}
                      </span>
                      <span className="text-xs text-neutral-400">
                        {t.scheduleWaveLabel}{' '}
                        <strong className="text-neutral-200">
                          {schedule.waveSize}
                        </strong>
                        {t.scheduleWavePerDay}
                      </span>
                    </div>
                    <Progress
                      sent={schedule.sent}
                      failed={schedule.failed}
                      pending={schedule.pending}
                      total={schedule.totalRecipients}
                    />
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-neutral-400">
                      <span>
                        <strong className="text-emerald-300">
                          {schedule.sent}
                        </strong>{' '}
                        {t.sentWord}
                      </span>
                      <span>
                        <strong className="text-rose-300">
                          {schedule.failed}
                        </strong>{' '}
                        {t.failedWord}
                      </span>
                      <span>
                        <strong className="text-neutral-200">
                          {schedule.pending}
                        </strong>{' '}
                        {t.pendingWord}
                      </span>
                      <span className="text-neutral-500">
                        {format(t.scheduleLastWave, {
                          date: formatDateTime(schedule.lastWaveAt),
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-end gap-2">
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1">
                        {t.modifySize}
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="290"
                        value={waveSize}
                        onChange={(e) => setWaveSize(e.target.value)}
                        className="px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm w-24"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={postSchedule}
                      disabled={scheduleBusy}
                      className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                    >
                      {t.updateBtn}
                    </button>
                    <button
                      type="button"
                      onClick={triggerWaveNow}
                      disabled={scheduleBusy || schedule.pending === 0}
                      className="px-4 py-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                    >
                      {t.launchWaveNow}
                    </button>
                    <button
                      type="button"
                      onClick={cancelSchedule}
                      disabled={scheduleBusy}
                      className="px-4 py-2 rounded-xl border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 disabled:opacity-50 text-sm font-medium transition-colors"
                    >
                      {t.cancel}
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <label className="block text-xs text-neutral-400 mb-1">
                      {t.emailsPerDay}
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="290"
                      value={waveSize}
                      onChange={(e) => setWaveSize(e.target.value)}
                      placeholder="10"
                      className="px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm w-24"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={postSchedule}
                    disabled={scheduleBusy}
                    className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors flex items-center gap-2"
                  >
                    {scheduleBusy ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : null}
                    {t.planWaves}
                  </button>
                </div>
              )}

              {scheduleError && (
                <div className="px-3 py-2 rounded-xl bg-red-900/40 border border-red-500/50 text-red-300 text-sm">
                  {scheduleError}
                </div>
              )}
              {scheduleNotice && (
                <div className="px-3 py-2 rounded-xl bg-emerald-900/40 border border-emerald-500/50 text-emerald-300 text-sm">
                  {scheduleNotice}
                </div>
              )}
            </section>

            {/* Broadcast */}
            <section className="bg-neutral-800/50 border border-neutral-700/50 rounded-xl p-4 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-neutral-200 mb-1">
                  {t.broadcastHeading}
                </h3>
                <p className="text-xs text-neutral-500">
                  {t.broadcastHintPrefix}
                  <code className="mx-1 px-1.5 py-0.5 rounded bg-neutral-900 text-neutral-300 font-mono text-[11px]">
                    limit
                  </code>
                  {t.broadcastHintMid}
                  <code className="mx-1 px-1.5 py-0.5 rounded bg-neutral-900 text-neutral-300 font-mono text-[11px]">
                    offset
                  </code>
                  {t.broadcastHintSuffix}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">
                    {t.limitLabel}
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                    placeholder={t.limitPlaceholder}
                    className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">
                    {t.offsetLabel}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={offset}
                    onChange={(e) => setOffset(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={runDryRun}
                  disabled={dryRunBusy || sendBusy}
                  className="px-4 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors flex items-center gap-2"
                >
                  {dryRunBusy ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : null}
                  {t.dryRunBtn}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  disabled={dryRunBusy || sendBusy}
                  className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                    />
                  </svg>
                  {t.launchBroadcast}
                </button>
              </div>

              {actionError && (
                <div className="px-3 py-2 rounded-xl bg-red-900/40 border border-red-500/50 text-red-300 text-sm">
                  {actionError}
                </div>
              )}

              {dryRun && (
                <div className="rounded-xl bg-neutral-900/50 border border-neutral-700/40 p-4">
                  <p className="text-xs text-neutral-500 uppercase tracking-wider mb-2">
                    {t.previewResultHeading}
                  </p>
                  <ul className="text-sm text-neutral-200 space-y-1">
                    <li>
                      {t.dryConfirmedUsers}{' '}
                      <strong>{dryRun.totalConfirmedUsers}</strong>
                    </li>
                    <li>
                      {t.dryBatch} <strong>{dryRun.windowSize}</strong>
                    </li>
                    <li>
                      {t.dryWithGreeting} <strong>{dryRun.withLabel}</strong>
                    </li>
                    <li>
                      {t.dryWithoutLabel}{' '}
                      <strong>{dryRun.withoutLabel}</strong>
                    </li>
                  </ul>
                </div>
              )}

              {sendResult && (
                <div className="rounded-xl bg-emerald-900/30 border border-emerald-500/40 p-4">
                  <p className="text-xs text-emerald-400 uppercase tracking-wider mb-2">
                    {t.broadcastDoneHeading}
                  </p>
                  <ul className="text-sm text-emerald-100 space-y-1">
                    <li>
                      {t.sentLabelColon} <strong>{sendResult.sent}</strong> /{' '}
                      {sendResult.windowSize}
                    </li>
                    <li>
                      {t.failedLabelColon} <strong>{sendResult.failed}</strong>
                    </li>
                  </ul>
                  {sendResult.errors && sendResult.errors.length > 0 && (
                    <details className="mt-2 text-xs text-red-200">
                      <summary className="cursor-pointer text-red-300">
                        {format(t.errorsDetails, {
                          count: sendResult.errors.length,
                        })}
                      </summary>
                      <ul className="mt-2 space-y-1 max-h-40 overflow-auto">
                        {sendResult.errors.map((e, i) => (
                          <li key={i} className="font-mono text-[11px]">
                            {e}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <button
                    type="button"
                    onClick={onAfterSend}
                    className="mt-3 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-medium transition-colors"
                  >
                    {t.closeAndRefresh}
                  </button>
                </div>
              )}
            </section>
          </div>
        </div>

        {/* Confirm modal */}
        <Modal
          open={confirming}
          onClose={() => setConfirming(false)}
          disableEscapeClose={sendBusy}
          disableBackdropClose={sendBusy}
          zIndexClassName="z-[210]"
          backdropClassName="bg-black/70"
          panelChromeClassName="rounded-2xl bg-neutral-900 border border-neutral-700"
          title={<h3 className="text-lg font-semibold">{t.confirmSendTitle}</h3>}
          footer={
            <>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={sendBusy}
                className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-sm font-medium transition-colors"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={runSend}
                disabled={sendBusy}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-sm font-medium transition-colors flex items-center gap-2"
              >
                {sendBusy ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : null}
                {t.confirmSendBtn}
              </button>
            </>
          }
        >
          <p className="text-sm text-neutral-300">
            {format(t.confirmSendBody, {
              name: campaign.name,
              limitPart: limit ? format(t.confirmSendLimit, { limit }) : '',
              offsetPart:
                Number(offset) > 0
                  ? format(t.confirmSendOffset, { offset })
                  : '',
            })}
            <br />
            <strong>{t.confirmSendIrreversible}</strong>
          </p>
        </Modal>
      </div>
    </>
  );
}

function getFormStatusOptions(t: Dict): { value: string; label: string }[] {
  return [
    { value: 'draft', label: t.statusDraft },
    { value: 'active', label: t.statusActive },
    { value: 'archived', label: t.statusArchived },
  ];
}

function CampaignFormModal({
  campaign,
  onClose,
  onSaved,
}: {
  campaign: CampaignSummary | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const t = useAdminT('adminCampaigns');
  const isEdit = campaign !== null;
  const { mutateJson } = useIdempotentMutation();
  const { addToast } = useToast();

  const [name, setName] = useState(campaign?.name ?? '');
  const [subject, setSubject] = useState(campaign?.subject ?? '');
  const [description, setDescription] = useState(campaign?.description ?? '');
  const [status, setStatus] = useState<string>(
    campaign?.status === 'active' ||
      campaign?.status === 'archived' ||
      campaign?.status === 'draft'
      ? campaign.status
      : 'draft'
  );
  const [heading, setHeading] = useState(campaign?.body?.heading ?? '');
  const [greetingEnabled, setGreetingEnabled] = useState(
    campaign?.body?.greetingEnabled ?? true
  );
  const [bodyText, setBodyText] = useState(
    campaign?.body?.bodyParagraphs?.join('\n\n') ?? ''
  );
  const [ctaLabel, setCtaLabel] = useState(campaign?.body?.ctaLabel ?? '');
  const [ctaUrl, setCtaUrl] = useState(campaign?.body?.ctaUrl ?? '');
  const [footerNote, setFooterNote] = useState(
    campaign?.body?.footerNote ?? ''
  );

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const bodyParagraphs = bodyText
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const ctaLabelTrimmed = ctaLabel.trim();
  const ctaUrlTrimmed = ctaUrl.trim();
  const ctaMismatch =
    (ctaLabelTrimmed && !ctaUrlTrimmed) || (!ctaLabelTrimmed && ctaUrlTrimmed);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError(t.errorNameRequired);
      return;
    }
    if (!subject.trim()) {
      setFormError(t.errorSubjectRequired);
      return;
    }
    if (!heading.trim()) {
      setFormError(t.errorHeadingRequired);
      return;
    }
    if (bodyParagraphs.length === 0) {
      setFormError(t.errorBodyRequired);
      return;
    }
    if (ctaMismatch) {
      setFormError(t.errorCtaMismatch);
      return;
    }

    const payload: Record<string, unknown> = {
      name: name.trim(),
      subject: subject.trim(),
      description: description.trim() || undefined,
      status,
      heading: heading.trim(),
      greetingEnabled,
      bodyParagraphs,
      ctaLabel: ctaLabelTrimmed || undefined,
      ctaUrl: ctaUrlTrimmed || undefined,
      footerNote: footerNote.trim() || undefined,
    };

    setSubmitting(true);
    try {
      if (isEdit && campaign) {
        await mutateJson(`/api/admin/broadcast/${campaign.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        addToast(
          format(t.campaignUpdated, { name: name.trim() }),
          'success'
        );
      } else {
        await mutateJson('/api/admin/broadcast', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        addToast(format(t.campaignCreated, { name: name.trim() }), 'success');
      }
      await onSaved();
    } catch (err: unknown) {
      const msg = (err as Error)?.message || t.saveFailed;
      setFormError(msg);
      addToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-stretch justify-end"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl h-full bg-neutral-900 border-l border-neutral-700/50 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-neutral-900/95 backdrop-blur border-b border-neutral-800 px-6 py-4 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-neutral-500">
              {isEdit ? t.editKicker : t.newKicker}
            </p>
            <h2 className="text-lg font-semibold truncate">
              {isEdit ? campaign?.name : t.composeEmail}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
            aria-label={t.closeAria}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-6 space-y-5">
          {/* Meta */}
          <div className="grid grid-cols-1 gap-4">
            <FormField label={t.nameLabel} required>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                placeholder={t.namePlaceholder}
                className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </FormField>

            <FormField label={t.subjectLabel} required>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={200}
                placeholder={t.subjectPlaceholder}
                className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </FormField>

            <FormField label={t.descriptionLabel} hint={t.descriptionHint}>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={280}
                placeholder={t.descriptionPlaceholder}
                className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </FormField>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label={t.statusLabel}>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  {getFormStatusOptions(t).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label={t.audienceLabel} hint={t.audienceHint}>
                <input
                  type="text"
                  value={t.audienceValue}
                  disabled
                  readOnly
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/30 border border-neutral-700 text-neutral-400 text-sm cursor-not-allowed"
                />
              </FormField>
            </div>
          </div>

          <hr className="border-neutral-800" />

          {/* Template body */}
          <FormField label={t.headingLabel} required>
            <input
              type="text"
              value={heading}
              onChange={(e) => setHeading(e.target.value)}
              maxLength={160}
              placeholder={t.headingPlaceholder}
              className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </FormField>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={greetingEnabled}
              onChange={(e) => setGreetingEnabled(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-neutral-600 bg-neutral-900 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-neutral-300">
              {t.greetingLabel}
              <span className="block text-xs text-neutral-500">
                {t.greetingHint}
              </span>
            </span>
          </label>

          <FormField label={t.bodyLabel} required hint={t.bodyHint}>
            <textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              rows={8}
              placeholder={t.bodyPlaceholder}
              className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-y leading-relaxed"
            />
            <p className="text-xs text-neutral-500 mt-1">
              {format(
                bodyParagraphs.length > 1
                  ? t.paragraphsDetected_other
                  : t.paragraphsDetected_one,
                { count: bodyParagraphs.length }
              )}
            </p>
          </FormField>

          <FormField label={t.ctaLabel} hint={t.ctaHint}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={ctaLabel}
                onChange={(e) => setCtaLabel(e.target.value)}
                maxLength={80}
                placeholder={t.ctaLabelPlaceholder}
                className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <input
                type="url"
                value={ctaUrl}
                onChange={(e) => setCtaUrl(e.target.value)}
                placeholder={t.ctaUrlPlaceholder}
                className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            {ctaMismatch && (
              <p className="text-xs text-amber-300 mt-1">{t.ctaMismatchHint}</p>
            )}
          </FormField>

          <FormField label={t.footerLabel}>
            <input
              type="text"
              value={footerNote}
              onChange={(e) => setFooterNote(e.target.value)}
              maxLength={280}
              placeholder={t.footerPlaceholder}
              className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </FormField>

          {formError && (
            <div className="px-3 py-2 rounded-xl bg-red-900/40 border border-red-500/50 text-red-300 text-sm">
              {formError}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold transition-colors flex items-center gap-2"
            >
              {submitting ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : null}
              {isEdit ? t.save : t.createCampaignBtn}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FormField({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-neutral-200 mb-1">
        {label}
        {required && <span className="text-rose-400 ml-0.5">*</span>}
      </label>
      {hint && <p className="text-xs text-neutral-500 mb-1.5">{hint}</p>}
      {children}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-neutral-900/50 rounded-xl p-3 border border-neutral-700/40">
      <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-0.5">
        {label}
      </div>
      <div className="text-sm font-medium text-white truncate">{children}</div>
    </div>
  );
}

function Progress({
  sent,
  failed,
  pending,
  total,
}: {
  sent: number;
  failed: number;
  pending: number;
  total: number;
}) {
  const safeTotal = total > 0 ? total : Math.max(1, sent + failed + pending);
  const sentPct = (sent / safeTotal) * 100;
  const failedPct = (failed / safeTotal) * 100;
  return (
    <div className="h-2 w-full rounded-full overflow-hidden bg-neutral-800 border border-neutral-700/50 flex">
      <div
        className="h-full bg-emerald-500 transition-[width]"
        style={{ width: `${sentPct}%` }}
      />
      <div
        className="h-full bg-rose-500 transition-[width]"
        style={{ width: `${failedPct}%` }}
      />
    </div>
  );
}
