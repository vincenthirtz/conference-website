// components/admin/communications/CampaignScheduleSection.tsx
//
// Planification par vagues d'une campagne : taille de vague, envoi d'une vague
// immédiate, annulation du planning, et l'avancement (envoyés / échecs / en
// attente).
//
// Extrait de CampaignDrawer, lui-même extrait de CampaignsPanel : le tiroir
// dépassait à son tour le plafond de 800 lignes de la règle A7. Ce bloc est le
// plus autonome — son état ne sert qu'ici, et il ne parle au reste que par
// `onRefresh`.

import { useState } from 'react';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminCampaigns from '@/lib/i18n/locales/admin-fr/adminCampaigns';
import { formatDateTime, type CampaignSummary } from './campaignShared';
import { Progress } from './campaignUi';

export default function CampaignScheduleSection({
  campaign,
  onRefresh,
}: {
  campaign: CampaignSummary;
  onRefresh: () => void | Promise<void>;
}) {
  const t = useAdminT(nsAdminCampaigns);
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { mutateJson } = useIdempotentMutation();
  const { addToast } = useToast();

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

  return (
    <>
      {confirmDialog}
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
                  <strong className="text-emerald-300">{schedule.sent}</strong>{' '}
                  {t.sentWord}
                </span>
                <span>
                  <strong className="text-rose-300">{schedule.failed}</strong>{' '}
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
    </>
  );
}
