import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';

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

type CampaignSummary = {
  id: string;
  name: string;
  description: string;
  subject: string;
  status: 'active' | 'draft' | 'archived' | string;
  audience: string;
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

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  active: {
    label: 'Active',
    className: 'bg-emerald-600/20 text-emerald-300 border-emerald-500/30',
  },
  draft: {
    label: 'Brouillon',
    className: 'bg-amber-600/20 text-amber-300 border-amber-500/30',
  },
  archived: {
    label: 'Archivée',
    className: 'bg-neutral-600/20 text-neutral-300 border-neutral-500/30',
  },
};

const AUDIENCE_LABELS: Record<string, string> = {
  'all-confirmed-users': 'Tous les comptes confirmés',
};

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
  const router = useRouter();

  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [limit] = useState(25);
  const [offset, setOffset] = useState(0);

  const [activeId, setActiveId] = useState<string | null>(null);
  const activeCampaign = campaigns.find((c) => c.id === activeId) ?? null;

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      const res = await fetch('/api/admin/broadcast?' + params.toString());
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Impossible de charger les campagnes');
      }
      const json = await res.json();
      setCampaigns(json.campaigns || []);
      setTotal(typeof json.total === 'number' ? json.total : null);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }, [limit, offset]);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  return (
    <>
      <Head>
        <title>Admin – Campagnes emails</title>
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
              Retour au dashboard admin
            </button>

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                  Campagnes emails
                </h1>
                <p className="text-neutral-400 text-sm mt-1">
                  Diffusion d&rsquo;annonces aux comptes confirm&eacute;s du
                  site (annonces, &eacute;v&eacute;nements, communaut&eacute;).
                  {total !== null
                    ? ` ${total} campagne${total > 1 ? 's' : ''} déclarée${total > 1 ? 's' : ''}.`
                    : ''}
                </p>
              </div>
              <div className="text-xs text-neutral-500 bg-neutral-800/50 px-3 py-2 rounded-xl border border-neutral-700/50">
                Brevo gratuit : 300 emails/jour
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
                Réessayer
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
              Aucune campagne disponible pour le moment.
              <p className="text-xs text-neutral-500 mt-2">
                Les campagnes sont d&eacute;clar&eacute;es dans
                <code className="mx-1 px-1.5 py-0.5 rounded bg-neutral-900 text-neutral-300 font-mono text-[11px]">
                  utils/broadcasts.ts
                </code>
                .
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {campaigns.map((c) => (
                <CampaignCard
                  key={c.id}
                  campaign={c}
                  onOpen={() => setActiveId(c.id)}
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
                Precedent
              </button>

              <span className="text-neutral-400 text-sm">
                {offset + 1} – {offset + campaigns.length}
                {total ? ` sur ${total}` : ''}
              </span>

              <button
                type="button"
                disabled={total !== null && offset + limit >= total}
                onClick={() => setOffset(offset + limit)}
                className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                Suivant
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
}: {
  campaign: CampaignSummary;
  onOpen: () => void;
}) {
  const status = STATUS_STYLES[campaign.status] ?? {
    label: campaign.status,
    className: 'bg-neutral-600/20 text-neutral-300 border-neutral-500/30',
  };
  const audience = AUDIENCE_LABELS[campaign.audience] ?? campaign.audience;
  const isArchived = campaign.status === 'archived';

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
          Gérer
        </button>
      </div>

      <p className="text-xs text-neutral-500 italic mb-4 truncate">
        Sujet : {campaign.subject}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Audience" value={audience} />
        <Stat label="Envois cumulés" value={String(campaign.stats.totalSent)} />
        <Stat label="Échecs" value={String(campaign.stats.totalFailed)} />
        <Stat
          label="Dernier envoi"
          value={formatDateTime(campaign.stats.lastRunAt)}
        />
      </div>

      {campaign.schedule && (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-200 border border-amber-500/30 font-semibold uppercase tracking-wider text-[10px]">
            {campaign.schedule.status === 'scheduled'
              ? 'Vagues programmées'
              : campaign.schedule.status === 'completed'
                ? 'Vagues terminées'
                : 'En pause'}
          </span>
          <span className="text-neutral-300">
            {campaign.schedule.sent} / {campaign.schedule.totalRecipients}{' '}
            envoy&eacute;s
            {campaign.schedule.failed > 0
              ? ` · ${campaign.schedule.failed} échec(s)`
              : ''}
          </span>
          <span className="text-neutral-400">
            Vague :{' '}
            <strong className="text-neutral-200">
              {campaign.schedule.waveSize}
            </strong>
            /jour
          </span>
          <span className="text-neutral-500">
            Dernière vague&nbsp;: {formatDateTime(campaign.schedule.lastWaveAt)}
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
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { mutateJson } = useIdempotentMutation();
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
      setScheduleError(
        'La taille de vague doit être un entier entre 1 et 290.'
      );
      return;
    }
    const wave = Math.floor(parsed);

    const recipientLine =
      schedule && typeof schedule.totalRecipients === 'number'
        ? `${schedule.totalRecipients} destinataire(s) au total`
        : 'la liste actuelle des comptes confirmés';
    const ok = await confirm({
      title: schedule
        ? 'Mettre à jour la programmation ?'
        : 'Programmer cette campagne par vagues ?',
      subtitle:
        `Campagne « ${campaign.name} » : envoi de ${wave} email(s)/jour ` +
        `vers ${recipientLine}, jusqu'à épuisement. Les envois partiront ` +
        'automatiquement via le cron quotidien.',
      variant: 'warning',
      confirmLabel: schedule ? 'Mettre à jour' : 'Programmer',
      cancelLabel: 'Annuler',
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
        `Planning enregistré : ${json.totalRecipients} destinataire(s), ${wave}/jour.`
      );
      addToast(
        `Programmation enregistrée : ${json.totalRecipients} destinataire(s).`,
        'success'
      );
      await onRefresh();
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Échec de la planification';
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
        ? `${pending} destinataire(s) en attente`
        : 'les destinataires restants';
    const ok = await confirm({
      title: 'Lancer une vague maintenant ?',
      subtitle:
        `Campagne « ${campaign.name} » : envoi immédiat de ${recipientLine} ` +
        `(plafonné à ${schedule?.waveSize ?? '?'} par vague). Action ` +
        'irréversible — les emails partent réellement.',
      variant: 'warning',
      confirmLabel: 'Envoyer la vague',
      cancelLabel: 'Annuler',
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
        `Vague envoyée : ${json.sent} succès / ${json.failed} échec(s) — ${json.remainingPending} restants.`
      );
      addToast(
        `Vague envoyée : ${json.sent} succès, ${json.failed} échec(s).`,
        json.failed > 0 ? 'warning' : 'success'
      );
      await onRefresh();
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Vague échouée';
      setScheduleError(msg);
      addToast(msg, 'error');
    } finally {
      setScheduleBusy(false);
    }
  }

  async function cancelSchedule() {
    const ok = await confirm({
      title: 'Annuler la programmation de cette campagne ?',
      subtitle:
        'Les emails deja envoyes restent dans l historique. Les destinataires non encore traites ne recevront pas la campagne.',
      variant: 'warning',
      confirmLabel: 'Annuler la programmation',
      cancelLabel: 'Garder',
    });
    if (!ok) return;
    setScheduleBusy(true);
    setScheduleError(null);
    setScheduleNotice(null);
    try {
      await mutateJson(`/api/admin/broadcast/${campaign.id}/schedule`, {
        method: 'DELETE',
      });
      setScheduleNotice('Programmation annulée.');
      addToast('Programmation annulée.', 'success');
      await onRefresh();
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Annulation échouée';
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
        setTestResult({ ok: true, msg: `Email de test envoyé à ${to}.` });
        addToast(`Email de test envoyé à ${to}.`, 'success');
      } else {
        const msg = json.error || 'Échec';
        setTestResult({ ok: false, msg });
        addToast(msg, 'error');
      }
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Erreur réseau';
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
      const res = await fetch(`/api/admin/broadcast/${campaign.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody({ dryRun: true })),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || 'Dry-run échoué');
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
        `Diffusion terminée : ${json.sent} envoyé(s), ${json.failed} échec(s).`,
        json.failed > 0 ? 'warning' : 'success'
      );
      setConfirming(false);
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Envoi échoué';
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
                Campagne
              </p>
              <h2 className="text-lg font-semibold truncate">
                {campaign.name}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
              aria-label="Fermer"
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
                <Field label="Sujet">{campaign.subject}</Field>
                <Field label="Audience">
                  {AUDIENCE_LABELS[campaign.audience] ?? campaign.audience}
                </Field>
                <Field label="ID">
                  <code className="font-mono text-xs">{campaign.id}</code>
                </Field>
              </div>
            </section>

            {/* Live preview */}
            <section className="bg-neutral-800/50 border border-neutral-700/50 rounded-xl p-4">
              <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-200">
                    Aper&ccedil;u live
                  </h3>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Rendu HTML r&eacute;el de l&rsquo;email. Modifie le label
                    pour tester le greeting.
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
                    Ouvrir
                  </a>
                </div>
              </div>
              <div className="rounded-xl overflow-hidden border border-neutral-700/50 bg-neutral-950">
                <iframe
                  key={previewSrc}
                  src={previewSrc}
                  title="Aperçu de l'email"
                  sandbox="allow-same-origin"
                  className="w-full h-[520px] bg-white"
                />
              </div>
            </section>

            {/* Test send */}
            <section className="bg-neutral-800/50 border border-neutral-700/50 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-neutral-200 mb-1">
                Envoyer un test
              </h3>
              <p className="text-xs text-neutral-500 mb-3">
                Envoie cet email &agrave; une seule adresse pour le visualiser
                dans ton inbox avant la diffusion.
              </p>
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
                  Envoyer le test
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
                  Programmation par vagues
                </h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Snapshot la liste actuelle, puis le cron quotidien envoie
                  <strong className="text-neutral-300"> waveSize </strong>
                  emails par jour jusqu&rsquo;&agrave; &eacute;puisement.
                  Recommand&eacute; pour rester sous le quota Brevo gratuit
                  (300/jour).
                </p>
              </div>

              {schedule ? (
                <>
                  <div className="rounded-xl bg-neutral-900/50 border border-neutral-700/40 p-3">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-200 border border-amber-500/30 text-[10px] uppercase tracking-wider font-semibold">
                        {schedule.status === 'scheduled'
                          ? 'En cours'
                          : schedule.status === 'completed'
                            ? 'Termin&eacute;e'
                            : 'En pause'}
                      </span>
                      <span className="text-xs text-neutral-400">
                        Vague :{' '}
                        <strong className="text-neutral-200">
                          {schedule.waveSize}
                        </strong>
                        /jour
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
                        envoy&eacute;s
                      </span>
                      <span>
                        <strong className="text-rose-300">
                          {schedule.failed}
                        </strong>{' '}
                        &eacute;chec(s)
                      </span>
                      <span>
                        <strong className="text-neutral-200">
                          {schedule.pending}
                        </strong>{' '}
                        en attente
                      </span>
                      <span className="text-neutral-500">
                        Derni&egrave;re vague :{' '}
                        {formatDateTime(schedule.lastWaveAt)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-end gap-2">
                    <div>
                      <label className="block text-xs text-neutral-400 mb-1">
                        Modifier la taille
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
                      Mettre &agrave; jour
                    </button>
                    <button
                      type="button"
                      onClick={triggerWaveNow}
                      disabled={scheduleBusy || schedule.pending === 0}
                      className="px-4 py-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                    >
                      Lancer une vague maintenant
                    </button>
                    <button
                      type="button"
                      onClick={cancelSchedule}
                      disabled={scheduleBusy}
                      className="px-4 py-2 rounded-xl border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 disabled:opacity-50 text-sm font-medium transition-colors"
                    >
                      Annuler
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <label className="block text-xs text-neutral-400 mb-1">
                      Emails par jour
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
                    Planifier les vagues
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
                  Diffusion imm&eacute;diate
                </h3>
                <p className="text-xs text-neutral-500">
                  Le quota Brevo gratuit est de 300 emails/jour. Au-del&agrave;,
                  segmente l&rsquo;envoi avec
                  <code className="mx-1 px-1.5 py-0.5 rounded bg-neutral-900 text-neutral-300 font-mono text-[11px]">
                    limit
                  </code>
                  et
                  <code className="mx-1 px-1.5 py-0.5 rounded bg-neutral-900 text-neutral-300 font-mono text-[11px]">
                    offset
                  </code>
                  .
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">
                    Limite (vide = tout)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                    placeholder="ex. 250"
                    className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">
                    Offset
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
                  Pr&eacute;visualiser (dry-run)
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
                  Lancer la diffusion
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
                    Aper&ccedil;u
                  </p>
                  <ul className="text-sm text-neutral-200 space-y-1">
                    <li>
                      Comptes confirm&eacute;s :{' '}
                      <strong>{dryRun.totalConfirmedUsers}</strong>
                    </li>
                    <li>
                      Envois pour ce batch :{' '}
                      <strong>{dryRun.windowSize}</strong>
                    </li>
                    <li>
                      Avec greeting personnalis&eacute; :{' '}
                      <strong>{dryRun.withLabel}</strong>
                    </li>
                    <li>
                      Sans label (greeting g&eacute;n&eacute;rique) :{' '}
                      <strong>{dryRun.withoutLabel}</strong>
                    </li>
                  </ul>
                </div>
              )}

              {sendResult && (
                <div className="rounded-xl bg-emerald-900/30 border border-emerald-500/40 p-4">
                  <p className="text-xs text-emerald-400 uppercase tracking-wider mb-2">
                    Diffusion termin&eacute;e
                  </p>
                  <ul className="text-sm text-emerald-100 space-y-1">
                    <li>
                      Envoy&eacute;s : <strong>{sendResult.sent}</strong> /{' '}
                      {sendResult.windowSize}
                    </li>
                    <li>
                      &Eacute;checs : <strong>{sendResult.failed}</strong>
                    </li>
                  </ul>
                  {sendResult.errors && sendResult.errors.length > 0 && (
                    <details className="mt-2 text-xs text-red-200">
                      <summary className="cursor-pointer text-red-300">
                        {sendResult.errors.length} erreur(s) — voir le
                        d&eacute;tail
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
                    Fermer et rafra&icirc;chir
                  </button>
                </div>
              )}
            </section>
          </div>
        </div>

        {/* Confirm modal */}
        {confirming && (
          <div
            className="fixed inset-0 z-[210] bg-black/70 flex items-center justify-center p-4"
            onClick={() => !sendBusy && setConfirming(false)}
          >
            <div
              className="w-full max-w-md rounded-2xl bg-neutral-900 border border-neutral-700 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold mb-2">
                Confirmer l&rsquo;envoi
              </h3>
              <p className="text-sm text-neutral-300 mb-4">
                Cette action va envoyer la campagne &laquo; {campaign.name}{' '}
                &raquo; aux comptes confirm&eacute;s du site
                {limit ? ` (limite : ${limit})` : ''}
                {Number(offset) > 0
                  ? `, en sautant les ${offset} premiers`
                  : ''}
                .
                <br />
                <strong>Action irr&eacute;versible.</strong>
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={sendBusy}
                  className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-sm font-medium transition-colors"
                >
                  Annuler
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
                  Confirmer la diffusion
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
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
