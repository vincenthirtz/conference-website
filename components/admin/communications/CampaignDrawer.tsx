// components/admin/communications/CampaignDrawer.tsx
//
// Tiroir d'une campagne email : aperçu du rendu, envoi de test, planification
// par vagues, dry-run et broadcast, et suppression.
//
// Extrait de CampaignsPanel.tsx (1 027 lignes à lui seul) au titre de la règle
// A7 : tout lot qui touche un god-component en sort au moins un morceau. Le
// code est déplacé tel quel — `Field` et `Progress`, utilisés uniquement ici,
// le suivent.

import { useState, useEffect, useId } from 'react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import Modal from '@/components/admin/Modal';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminCampaigns from '@/lib/i18n/locales/admin-fr/adminCampaigns';
import {
  getAudienceLabels,
  formatDateTime,
  type CampaignSummary,
  type DryRunResult,
  type SendResult,
} from './campaignShared';
import { Field } from './campaignUi';
import CampaignScheduleSection from './CampaignScheduleSection';

export default function CampaignDrawer({
  campaign,
  onClose,
  onDelete,
  onAfterSend,
  onRefresh,
}: {
  campaign: CampaignSummary;
  onClose: () => void;
  /**
   * Suppression depuis le tiroir. Le geste existait déjà sur la fiche de la
   * liste, mais pas ici : une fois la campagne ouverte, il fallait refermer et
   * la retrouver dans la liste pour la supprimer. Le parent gère la
   * confirmation, l'appel API et la fermeture du tiroir.
   */
  onDelete: () => void | Promise<void>;
  onAfterSend: () => void;
  onRefresh: () => void | Promise<void>;
}) {
  const t = useAdminT(nsAdminCampaigns);
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { mutateJson } = useIdempotentMutation();
  const { adminFetch } = useAdminFetch();
  const { addToast } = useToast();

  const trapRef = useFocusTrap<HTMLDivElement>();
  const titleId = useId();

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

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

  // Envoi aux « nouveaux inscrits » : recalcule l'audience et ne renvoie qu'aux
  // comptes jamais encore adressés pour cette campagne (diff sur les envois déjà
  // enregistrés). Flux en un clic : dry-run onlyNew → confirmation → envoi ciblé.
  async function runNewSubscribers() {
    setSendBusy(true);
    setActionError(null);
    try {
      const res = await adminFetch(`/api/admin/broadcast/${campaign.id}`, {
        method: 'POST',
        body: JSON.stringify({ dryRun: true, onlyNew: true }),
      });
      const dry = await res.json();
      if (!res.ok || dry.error) {
        throw new Error(dry.error || t.dryRunFailed);
      }
      const n = Number(dry.newCount ?? 0);
      if (n <= 0) {
        addToast(t.newSubscribersNone, 'info');
        return;
      }
      const ok = await confirm({
        title: t.newSubscribersTitle,
        subtitle: format(t.newSubscribersConfirmBody, {
          count: n,
          name: campaign.name,
        }),
        variant: 'warning',
        confirmLabel: format(t.newSubscribersConfirmBtn, { count: n }),
        cancelLabel: t.cancel,
      });
      if (!ok) return;

      const json = await mutateJson<SendResult & { errors?: string[] }>(
        `/api/admin/broadcast/${campaign.id}`,
        {
          method: 'POST',
          body: JSON.stringify({ onlyNew: true }),
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
      await onRefresh();
    } catch (err: unknown) {
      const msg = (err as Error)?.message || t.sendFailed;
      setActionError(msg);
      addToast(msg, 'error');
    } finally {
      setSendBusy(false);
    }
  }

  // Envoi « à la nouvelle audience » : diff PAR IDENTITÉ contre les envois déjà
  // tracés, à ne pas confondre avec « nouveaux inscrits » (filtre daté). Quand
  // on CHANGE l'audience, les personnes qui entrent ont des comptes anciens :
  // le filtre daté les écarte toutes et annonce zéro. Celui-ci les trouve.
  async function runAudienceDiff() {
    setSendBusy(true);
    setActionError(null);
    try {
      const res = await adminFetch(`/api/admin/broadcast/${campaign.id}`, {
        method: 'POST',
        body: JSON.stringify({ dryRun: true, onlyUnsent: true }),
      });
      const dry = await res.json();
      if (!res.ok || dry.error) {
        throw new Error(dry.error || t.dryRunFailed);
      }

      const n = Number(dry.unsentCount ?? 0);
      if (n <= 0) {
        addToast(t.audienceDiffNone, 'info');
        return;
      }

      // Un envoi passé sans trace par destinataire : le diff ne distingue
      // rien, et « envoyer aux nouveaux » enverrait en fait à tout le monde.
      // On le DIT avant, plutôt que de le constater après.
      const untraced = Boolean(dry.untracedPreviousSend);
      const ok = await confirm({
        title: t.audienceDiffTitle,
        subtitle: untraced
          ? format(t.audienceDiffUntracedBody, {
              count: n,
              name: campaign.name,
            })
          : format(t.audienceDiffConfirmBody, {
              count: n,
              already: Number(dry.alreadySent ?? 0),
              total: Number(dry.audienceTotal ?? 0),
              name: campaign.name,
            }),
        variant: 'warning',
        confirmLabel: format(t.audienceDiffConfirmBtn, { count: n }),
        cancelLabel: t.cancel,
      });
      if (!ok) return;

      const json = await mutateJson<SendResult & { errors?: string[] }>(
        `/api/admin/broadcast/${campaign.id}`,
        {
          method: 'POST',
          body: JSON.stringify({
            onlyUnsent: true,
            // Reprend la reconnaissance donnée dans la boîte de dialogue :
            // l'API refuse l'envoi sans elle quand la trace manque.
            acknowledgeUntraced: untraced,
          }),
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
      await onRefresh();
    } catch (err: unknown) {
      const msg = (err as Error)?.message || t.sendFailed;
      setActionError(msg);
      addToast(msg, 'error');
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
          ref={trapRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="w-full max-w-2xl h-full bg-neutral-900 border-l border-neutral-700/50 overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sticky top-0 z-10 bg-neutral-900/95 backdrop-blur border-b border-neutral-800 px-6 py-4 flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wider text-neutral-500">
                {t.campaignKicker}
              </p>
              <h2 id={titleId} className="text-lg font-semibold truncate">
                {campaign.name}
              </h2>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {/* Les campagnes `builtin` (catalogue codé en dur) ne sont pas
                supprimables — l'API renvoie 403. On n'affiche donc le geste que
                pour les campagnes créées depuis l'admin, comme sur la fiche. */}
              {campaign.source === 'db' && (
                <button
                  type="button"
                  onClick={() => onDelete()}
                  aria-label={format(t.deleteAria, { name: campaign.name })}
                  className="rounded-lg p-2 text-rose-400 hover:bg-rose-500/15 hover:text-rose-300 transition-colors"
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
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              )}
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

            <CampaignScheduleSection
              campaign={campaign}
              onRefresh={onRefresh}
            />

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
                <button
                  type="button"
                  onClick={runNewSubscribers}
                  disabled={dryRunBusy || sendBusy}
                  title={t.newSubscribersHint}
                  className="px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 border border-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors flex items-center gap-2"
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
                  {t.newSubscribersBtn}
                </button>
                <button
                  type="button"
                  onClick={runAudienceDiff}
                  disabled={dryRunBusy || sendBusy}
                  title={t.audienceDiffHint}
                  className="px-4 py-2.5 rounded-xl bg-indigo-700 hover:bg-indigo-600 border border-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors flex items-center gap-2"
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
                      d="M17 20h5v-2a3 3 0 0 0-5.36-1.86M9 20H4v-2a3 3 0 0 1 5.36-1.86M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"
                    />
                  </svg>
                  {t.audienceDiffBtn}
                </button>
              </div>

              <p className="text-xs text-neutral-500">{t.newSubscribersHint}</p>
              <p className="text-xs text-neutral-500">{t.audienceDiffHint}</p>

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
                      {t.dryWithoutLabel} <strong>{dryRun.withoutLabel}</strong>
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
          title={
            <h3 className="text-lg font-semibold">{t.confirmSendTitle}</h3>
          }
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
