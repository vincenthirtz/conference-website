// components/admin/communications/CampaignsPanel.tsx
//
// "Campagnes" tab of the merged /admin/communications hub (ex-route
// /admin/campaigns, 308-redirected here). Gestion des campagnes emails Brevo :
// liste paginée, création/édition, drawer d'envoi (test, planification par
// vagues, dry-run + broadcast). minRole 'admin' (re-gaté par le host).

import { useState, useCallback, useEffect, useId } from 'react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import {
  useCampaignSubscriptions,
  useCampaignsPage,
  useIdempotentCall,
  useRefreshCampaigns,
} from '@/features/admin/communications/hooks/useCommunications';
import { campaignsClient } from '@/features/admin/communications/client';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminCampaigns from '@/lib/i18n/locales/admin-fr/adminCampaigns';
import CampaignDrawer from './CampaignDrawer';
import {
  getAudienceLabels,
  formatDateTime,
  type Dict,
  type CampaignSummary,
} from './campaignShared';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip, { type ChipTone } from '@/features/admin/_shared/ui/Chip';

const CAMPAIGNS_PAGE_SIZE = 25;
const EMPTY_CAMPAIGNS: CampaignSummary[] = [];

function getStatusStyles(
  t: Dict
): Record<string, { label: string; tone: ChipTone }> {
  return {
    active: {
      label: t.statusActive,
      tone: 'ok',
    },
    draft: {
      label: t.statusDraft,
      tone: 'warn',
    },
    archived: {
      label: t.statusArchived,
      tone: 'neutral',
    },
  };
}

function getAudienceOptions(t: Dict): { value: string; label: string }[] {
  const labels = getAudienceLabels(t);
  return [
    'all-confirmed-users',
    'team-captains',
    'team-captains-managers',
    'team-staff',
    'team-members',
    'staff',
    'adherents',
    'tournament-members',
    'tournament-never-logged-in',
    'tournament-captains-incomplete-roster',
    'team-members-without-discord',
    'team-members-without-battletag',
    'newsletter',
    'all-plus-newsletter',
    'adherents-plus-newsletter',
  ].map((value) => ({ value, label: labels[value] ?? value }));
}

export default function CampaignsPanel() {
  const t = useAdminT(nsAdminCampaigns);

  const [activeId, setActiveId] = useState<string | null>(null);

  // Create / edit form: `null` = closed, `'new'` = create, otherwise the
  // db campaign currently being edited.
  const [formTarget, setFormTarget] = useState<'new' | CampaignSummary | null>(
    null
  );

  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { run } = useIdempotentCall();
  const { addToast } = useToast();

  // Liste paginée. `limit: 25` réplique le défaut de la route (parsePagination
  // limit:25) ; la requête reste `?limit=25&offset=N`. `total` revient
  // toujours dans le payload.
  const limit = CAMPAIGNS_PAGE_SIZE;
  const [offset, setOffset] = useState(0);
  const page = useCampaignsPage(limit, offset);
  const campaigns = page.data?.campaigns ?? EMPTY_CAMPAIGNS;
  const total = typeof page.data?.total === 'number' ? page.data.total : null;
  const loading = page.isPending;
  const errorMsg = page.error ? page.error.message : null;
  const fetchCampaigns = useRefreshCampaigns();

  const activeCampaign = campaigns.find((c) => c.id === activeId) ?? null;

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
        await run(campaignsClient.remove(campaign.id));
        addToast(format(t.campaignDeleted, { name: campaign.name }), 'success');
        // La campagne supprimée peut être celle ouverte dans le tiroir : sans
        // ça, le tiroir reste affiché sur une campagne qui n'existe plus (il
        // disparaît au refetch, mais `activeId` garderait un id fantôme).
        setActiveId((current) => (current === campaign.id ? null : current));
        await fetchCampaigns();
      } catch (err: unknown) {
        addToast((err as Error)?.message || t.deleteFailed, 'error');
      }
    },
    [confirm, run, addToast, fetchCampaigns, t]
  );

  const duplicateCampaign = useCallback(
    async (campaign: CampaignSummary) => {
      const ok = await confirm({
        title: t.confirmDuplicateTitle,
        subtitle: format(t.confirmDuplicateSubtitle, { name: campaign.name }),
        confirmLabel: t.confirmDuplicateLabel,
        cancelLabel: t.cancel,
      });
      if (!ok) return;
      try {
        await run(campaignsClient.duplicate(campaign.id));
        addToast(t.campaignDuplicated, 'success');
        await fetchCampaigns();
      } catch (err: unknown) {
        addToast((err as Error)?.message || t.duplicateFailed, 'error');
      }
    },
    [confirm, run, addToast, fetchCampaigns, t]
  );

  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
              {t.heading}
            </h2>
            <p className="text-neutral-400 text-sm mt-1">
              {t.subtitle}
              {total !== null
                ? format(
                    total > 1 ? t.subtitleCount_other : t.subtitleCount_one,
                    { total }
                  )
                : ''}
            </p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <AdminButton
              variant="primary"
              size="sm"
              onClick={() => setFormTarget('new')}
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
            </AdminButton>
            <div className="rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] px-3 py-2 text-xs text-neutral-500">
              {t.brevoQuota}
            </div>
          </div>
        </div>
      </div>

      {/* Synthèse des abonnements (opt-out global) */}
      <SubscriptionsCard />

      {/* Error */}
      {errorMsg && (
        <div className="mb-6 rounded-[var(--r-card,14px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] text-[#ffc2c2] px-4 py-3 text-sm flex items-center gap-2">
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
          <AdminButton
            variant="ghost"
            size="xs"
            onClick={() => fetchCampaigns()}
          >
            {t.retry}
          </AdminButton>
        </div>
      )}

      {/* Campaign list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-[var(--line2,rgba(194,196,201,.2))] border-t-[var(--or,#b467d1)] rounded-full animate-spin" />
        </div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-10 text-center text-neutral-400">
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
              onDuplicate={() => duplicateCampaign(c)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && campaigns.length > 0 && (
        <div className="flex justify-between items-center mt-6">
          <AdminButton
            variant="ghost"
            size="sm"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
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
          </AdminButton>

          <span className="text-neutral-400 text-sm">
            {offset + 1} – {offset + campaigns.length}
            {total ? format(t.paginationOf, { total }) : ''}
          </span>

          <AdminButton
            variant="ghost"
            size="sm"
            disabled={total !== null && offset + limit >= total}
            onClick={() => setOffset(offset + limit)}
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
          </AdminButton>
        </div>
      )}

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
          onDelete={() => deleteCampaign(activeCampaign)}
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

function CampaignCard({
  campaign,
  onOpen,
  onEdit,
  onDelete,
  onDuplicate,
}: {
  campaign: CampaignSummary;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void | Promise<void>;
}) {
  const t = useAdminT(nsAdminCampaigns);
  const [duplicating, setDuplicating] = useState(false);

  async function handleDuplicate() {
    if (duplicating) return;
    setDuplicating(true);
    try {
      await onDuplicate();
    } finally {
      setDuplicating(false);
    }
  }

  const status = getStatusStyles(t)[campaign.status] ?? {
    label: campaign.status,
    tone: 'neutral' as ChipTone,
  };
  const audience = getAudienceLabels(t)[campaign.audience] ?? campaign.audience;
  const isArchived = campaign.status === 'archived';
  const editable = campaign.source === 'db';

  return (
    <section className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-[260px]">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h2 className="text-lg font-semibold">{campaign.name}</h2>
            <Chip tone={status.tone}>{status.label}</Chip>
          </div>
          <p className="text-sm text-neutral-400 leading-relaxed">
            {campaign.description}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editable && (
            <>
              <AdminButton variant="ghost" size="sm" onClick={onEdit}>
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
              </AdminButton>
              <AdminButton variant="danger" size="sm" onClick={onDelete}>
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
              </AdminButton>
            </>
          )}
          <AdminButton
            variant="ghost"
            size="sm"
            onClick={handleDuplicate}
            disabled={duplicating}
            aria-label={format(t.duplicateAria, { name: campaign.name })}
          >
            {duplicating ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
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
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            )}
            {t.duplicate}
          </AdminButton>
          <AdminButton
            variant="secondary"
            size="sm"
            onClick={onOpen}
            disabled={isArchived}
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
          </AdminButton>
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
        <div className="mt-4 rounded-[var(--r-ctrl,4px)] border border-[rgba(245,165,36,.38)] bg-[rgba(245,165,36,.06)] p-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="rounded-[3px] border border-[rgba(245,165,36,.38)] bg-[rgba(245,165,36,.13)] px-2 py-0.5 font-[family-name:var(--fd)] text-[10px] font-bold uppercase tracking-[0.12em] text-[#ffd9a3] [font-stretch:75%]">
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
    <div className="rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] p-3">
      <div className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">
        {label}
      </div>
      <div className="text-sm font-medium text-white truncate">{value}</div>
    </div>
  );
}

/**
 * Carte de synthèse « Abonnements » : compteurs abonné·es / désabonné·es /
 * total confirmés (opt-out GLOBAL, pas par campagne) + disclosure listant les
 * désabonné·es. Alimentée par GET /api/admin/broadcast/subscriptions. Dégrade
 * proprement tant que l'endpoint n'est pas déployé (état erreur + réessai).
 */
function SubscriptionsCard() {
  const t = useAdminT(nsAdminCampaigns);
  const subs = useCampaignSubscriptions();
  const data = subs.data ?? null;
  // Un nouvel essai réaffiche le spinner, comme l'ancien `load()`.
  const loading = subs.isPending || (subs.isError && subs.isFetching);
  const error = subs.error ? subs.error.message || t.subsError : null;
  const load = subs.refetch;
  const [expanded, setExpanded] = useState(false);
  const listId = useId();

  const users = data?.unsubscribedUsers ?? [];
  const unsubCount = data?.unsubscribed ?? users.length;

  return (
    <section className="mb-6 rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold">{t.subsHeading}</h2>
          <p className="text-xs text-neutral-500 mt-0.5">{t.subsIntro}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-[var(--r-card,14px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] text-[#ffc2c2] px-4 py-3 text-sm flex items-center gap-2">
          <span className="flex-1">{error}</span>
          <AdminButton variant="ghost" size="xs" onClick={() => load()}>
            {t.retry}
          </AdminButton>
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Stat
              label={t.subsStatSubscribed}
              value={String(data.subscribed)}
            />
            <Stat
              label={t.subsStatUnsubscribed}
              value={String(data.unsubscribed)}
            />
            <Stat label={t.subsStatTotal} value={String(data.totalConfirmed)} />
          </div>

          <div className="mt-4">
            <AdminButton
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              aria-controls={listId}
            >
              <svg
                className={`w-4 h-4 transition-transform ${
                  expanded ? 'rotate-90' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
              {format(t.subsViewUnsubscribed, { count: unsubCount })}
            </AdminButton>

            {expanded && (
              <div id={listId} className="mt-3">
                {users.length === 0 ? (
                  <div className="rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] px-4 py-6 text-center text-sm text-neutral-400">
                    {t.subsUnsubEmpty}
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))]">
                    <table className="w-full text-sm">
                      <caption className="sr-only">
                        {t.subsUnsubCaption}
                      </caption>
                      <thead>
                        <tr className="bg-neutral-900/60 text-left text-[10px] text-neutral-500 uppercase tracking-wider">
                          <th scope="col" className="px-4 py-2 font-medium">
                            {t.subsUnsubColEmail}
                          </th>
                          <th scope="col" className="px-4 py-2 font-medium">
                            {t.subsUnsubColLabel}
                          </th>
                          <th scope="col" className="px-4 py-2 font-medium">
                            {t.subsUnsubColDate}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map((u) => (
                          <tr
                            key={u.email}
                            className="border-t border-neutral-800"
                          >
                            <td className="px-4 py-2 text-neutral-200 break-all">
                              {u.email}
                            </td>
                            <td className="px-4 py-2 text-neutral-300">
                              {u.label || '—'}
                            </td>
                            <td className="px-4 py-2 text-neutral-400 whitespace-nowrap">
                              {formatDateTime(u.unsubscribedAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      ) : null}
    </section>
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
  const t = useAdminT(nsAdminCampaigns);
  const isEdit = campaign !== null;
  const { run } = useIdempotentCall();
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
  const [audience, setAudience] = useState<string>(
    campaign?.audience ?? 'all-confirmed-users'
  );
  const [heading, setHeading] = useState(campaign?.body?.heading ?? '');
  const [greetingEnabled, setGreetingEnabled] = useState(
    campaign?.body?.greetingEnabled ?? true
  );
  const [bodyFormat, setBodyFormat] = useState<'structured' | 'html'>(
    campaign?.body?.bodyFormat === 'html' ? 'html' : 'structured'
  );
  const [bodyText, setBodyText] = useState(
    campaign?.body?.bodyParagraphs?.join('\n\n') ?? ''
  );
  const [bodyHtml, setBodyHtml] = useState(campaign?.body?.bodyHtml ?? '');
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
    if (bodyFormat === 'structured' && bodyParagraphs.length === 0) {
      setFormError(t.errorBodyRequired);
      return;
    }
    if (bodyFormat === 'html' && !bodyHtml.trim()) {
      setFormError(t.errorHtmlRequired);
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
      audience,
      heading: heading.trim(),
      greetingEnabled,
      bodyFormat,
      bodyParagraphs,
      bodyHtml: bodyFormat === 'html' ? bodyHtml.trim() : undefined,
      ctaLabel: ctaLabelTrimmed || undefined,
      ctaUrl: ctaUrlTrimmed || undefined,
      footerNote: footerNote.trim() || undefined,
    };

    setSubmitting(true);
    try {
      if (isEdit && campaign) {
        await run(campaignsClient.update(campaign.id, payload));
        addToast(format(t.campaignUpdated, { name: name.trim() }), 'success');
      } else {
        await run(campaignsClient.create(payload));
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
              {isEdit ? t.editKicker : t.newKicker}
            </p>
            <h2 id={titleId} className="text-lg font-semibold truncate">
              {isEdit ? campaign?.name : t.composeEmail}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--r-ctrl,4px)] p-2 text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
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
                className="w-full px-3 py-2.5 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] focus:border-[var(--or,#b467d1)] focus:outline-none text-sm"
              />
            </FormField>

            <FormField label={t.subjectLabel} required>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={200}
                placeholder={t.subjectPlaceholder}
                className="w-full px-3 py-2.5 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] focus:border-[var(--or,#b467d1)] focus:outline-none text-sm"
              />
            </FormField>

            <FormField label={t.descriptionLabel} hint={t.descriptionHint}>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={280}
                placeholder={t.descriptionPlaceholder}
                className="w-full px-3 py-2.5 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] focus:border-[var(--or,#b467d1)] focus:outline-none text-sm"
              />
            </FormField>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField label={t.statusLabel}>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] focus:border-[var(--or,#b467d1)] focus:outline-none text-sm"
                >
                  {getFormStatusOptions(t).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField label={t.audienceLabel} hint={t.audienceHint}>
                <select
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] focus:border-[var(--or,#b467d1)] focus:outline-none text-sm"
                >
                  {getAudienceOptions(t).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
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
              className="w-full px-3 py-2.5 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] focus:border-[var(--or,#b467d1)] focus:outline-none text-sm"
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

          {/* Mode de rédaction du corps. Le template structuré couvre la
              majorité des envois ; le mode HTML sert aux campagnes qui ont
              besoin d'images ou d'une vraie mise en page. */}
          <FormField label={t.bodyFormatLabel} hint={t.bodyFormatHint}>
            <div className="inline-flex rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] border border-[var(--line2,rgba(194,196,201,.2))] p-1 gap-1">
              {(['structured', 'html'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setBodyFormat(mode)}
                  aria-pressed={bodyFormat === mode}
                  className={`px-3 py-1.5 rounded-[3px] text-sm font-medium transition-colors ${
                    bodyFormat === mode
                      ? 'bg-[rgba(180,103,209,.18)] text-[var(--or-200,#eec4ff)]'
                      : 'text-neutral-300 hover:bg-neutral-800'
                  }`}
                >
                  {mode === 'structured'
                    ? t.bodyFormatStructured
                    : t.bodyFormatHtml}
                </button>
              ))}
            </div>
          </FormField>

          {bodyFormat === 'structured' ? (
            <FormField label={t.bodyLabel} required hint={t.bodyHint}>
              <textarea
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                rows={8}
                placeholder={t.bodyPlaceholder}
                className="w-full px-3 py-2.5 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] focus:border-[var(--or,#b467d1)] focus:outline-none text-sm resize-y leading-relaxed"
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
          ) : (
            <FormField label={t.htmlLabel} required hint={t.htmlHint}>
              <textarea
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
                rows={16}
                spellCheck={false}
                placeholder={t.htmlPlaceholder}
                className="w-full px-3 py-2.5 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] focus:border-[var(--or,#b467d1)] focus:outline-none text-xs font-mono resize-y leading-relaxed"
              />
              <p className="text-xs text-neutral-500 mt-1">
                {t.htmlSanitizeNote}
              </p>
            </FormField>
          )}

          {bodyFormat === 'structured' && (
            <>
              <FormField label={t.ctaLabel} hint={t.ctaHint}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={ctaLabel}
                    onChange={(e) => setCtaLabel(e.target.value)}
                    maxLength={80}
                    placeholder={t.ctaLabelPlaceholder}
                    className="w-full px-3 py-2.5 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] focus:border-[var(--or,#b467d1)] focus:outline-none text-sm"
                  />
                  <input
                    type="url"
                    value={ctaUrl}
                    onChange={(e) => setCtaUrl(e.target.value)}
                    placeholder={t.ctaUrlPlaceholder}
                    className="w-full px-3 py-2.5 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] focus:border-[var(--or,#b467d1)] focus:outline-none text-sm"
                  />
                </div>
                {ctaMismatch && (
                  <p className="text-xs text-amber-300 mt-1">
                    {t.ctaMismatchHint}
                  </p>
                )}
              </FormField>

              <FormField label={t.footerLabel}>
                <input
                  type="text"
                  value={footerNote}
                  onChange={(e) => setFooterNote(e.target.value)}
                  maxLength={280}
                  placeholder={t.footerPlaceholder}
                  className="w-full px-3 py-2.5 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] focus:border-[var(--or,#b467d1)] focus:outline-none text-sm"
                />
              </FormField>
            </>
          )}

          {formError && (
            <div className="px-3 py-2 rounded-[var(--r-card,14px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] text-[#ffc2c2] text-red-300 text-sm">
              {formError}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <AdminButton
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={submitting}
            >
              {t.cancel}
            </AdminButton>
            <AdminButton
              variant="primary"
              size="sm"
              type="submit"
              disabled={submitting}
            >
              {submitting ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : null}
              {isEdit ? t.save : t.createCampaignBtn}
            </AdminButton>
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
