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
import AdminButton from '@/features/admin/_shared/ui/AdminButton';

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
      <section className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4 space-y-3">
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
            <div className="rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] p-3">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="rounded-[3px] border border-[rgba(245,165,36,.38)] bg-[rgba(245,165,36,.13)] px-2 py-0.5 font-[family-name:var(--fd)] text-[10px] font-bold uppercase tracking-[0.12em] text-[#ffd9a3] [font-stretch:75%]">
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
                  className="px-3 py-2 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] focus:border-[var(--or,#b467d1)] focus:outline-none text-sm w-24"
                />
              </div>
              <AdminButton
                variant="secondary"
                size="sm"
                onClick={postSchedule}
                disabled={scheduleBusy}
              >
                {t.updateBtn}
              </AdminButton>
              <AdminButton
                variant="ghost"
                size="sm"
                onClick={triggerWaveNow}
                disabled={scheduleBusy || schedule.pending === 0}
              >
                {t.launchWaveNow}
              </AdminButton>
              <AdminButton
                variant="danger"
                size="sm"
                onClick={cancelSchedule}
                disabled={scheduleBusy}
              >
                {t.cancel}
              </AdminButton>
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
                className="px-3 py-2 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] focus:border-[var(--or,#b467d1)] focus:outline-none text-sm w-24"
              />
            </div>
            <AdminButton
              variant="secondary"
              size="sm"
              onClick={postSchedule}
              disabled={scheduleBusy}
            >
              {scheduleBusy ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : null}
              {t.planWaves}
            </AdminButton>
          </div>
        )}

        {scheduleError && (
          <div className="px-3 py-2 rounded-[var(--r-card,14px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] text-[#ffc2c2] text-red-300 text-sm">
            {scheduleError}
          </div>
        )}
        {scheduleNotice && (
          <div className="px-3 py-2 rounded-[var(--r-ctrl,4px)] border border-[rgba(127,202,101,.36)] bg-[rgba(127,202,101,.08)] text-[var(--lf-200,#b3e7a3)] text-sm">
            {scheduleNotice}
          </div>
        )}
      </section>
    </>
  );
}
