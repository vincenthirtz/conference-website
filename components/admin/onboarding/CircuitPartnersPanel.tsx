// components/admin/onboarding/CircuitPartnersPanel.tsx
//
// Les candidatures à l'offre partenaire des circuits féminins et mixtes, dans
// l'onglet « À traiter » de /admin/onboarding.
//
// Endpoints :
//   voir features/admin/circuit-partners/client.ts (liste + décision)
//
// ACCORDER POSE UN PLAN SUR UN ESPACE : l'action demande le slug (prérempli
// avec celui que le circuit a indiqué) et une confirmation qui le répète. Le
// serveur refuse de rétrograder un espace déjà mieux couvert et ne laisse
// passer qu'une décision.

import { useCallback, useState } from 'react';
import type {
  CircuitApplication,
  CircuitApplicationList,
  CircuitApplicationStatus,
  CircuitDecision,
} from '@/features/admin/circuit-partners/client';
import {
  useCircuitApplications,
  useDecideCircuitApplication,
} from '@/features/admin/circuit-partners/hooks/useCircuitPartners';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminCircuitPartners from '@/lib/i18n/locales/admin-fr/adminCircuitPartners';
import { CIRCUIT_PARTNER_OFFER } from '@/config/circuitPartnerOffer';
import { PLAN_LABELS } from '@/utils/billing/planFeatures';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip, { type ChipTone } from '@/features/admin/_shared/ui/Chip';

type Status = CircuitApplicationStatus;
type ListResponse = CircuitApplicationList;
export type { CircuitApplication };

const STATUS_TONE: Record<Status, ChipTone> = {
  new: 'brand',
  reviewing: 'warn',
  approved: 'ok',
  rejected: 'neutral',
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
}

export default function CircuitPartnersPanel() {
  const t = useAdminT(nsAdminCircuitPartners);
  const { addToast } = useToast();

  const [filter, setFilter] = useState<Status | 'all'>('new');
  const list = useCircuitApplications(filter);
  const decideMutation = useDecideCircuitApplication();
  const data: ListResponse | null = list.data ?? null;
  const state: 'loading' | 'ready' | 'error' = list.isFetching
    ? 'loading'
    : list.isError
      ? 'error'
      : 'ready';

  const statusLabel: Record<Status, string> = {
    new: t.statusNew,
    reviewing: t.statusReviewing,
    approved: t.statusApproved,
    rejected: t.statusRejected,
  };

  const decide = useCallback(
    async (
      id: string,
      body: Record<string, unknown>,
      success: string
    ): Promise<boolean> => {
      try {
        await decideMutation.mutateAsync({
          id,
          body: body as CircuitDecision,
        });
        addToast(success, 'success');
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        addToast(format(t.toastError, { error: message }), 'error');
        return false;
      }
    },
    [decideMutation, addToast, t]
  );

  const filters: Array<Status | 'all'> = [
    'new',
    'reviewing',
    'approved',
    'rejected',
    'all',
  ];

  return (
    <section aria-labelledby="circuit-partners-title">
      <h2 id="circuit-partners-title" className="text-xl font-semibold">
        {t.title}
      </h2>
      <p className="mt-1 text-sm text-neutral-400">
        {format(t.intro, {
          plan: PLAN_LABELS[CIRCUIT_PARTNER_OFFER.plan],
          months: CIRCUIT_PARTNER_OFFER.months,
        })}
      </p>

      <div className="mt-4 flex flex-wrap gap-2" role="group">
        {filters.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={`rounded-[var(--r-ctrl,4px)] border px-3 py-1 font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.12em] transition ${
              filter === value
                ? 'border-[var(--or,#b467d1)] bg-[rgba(180,103,209,.12)] text-[var(--or-200,#eec4ff)]'
                : 'border-[var(--line2,rgba(194,196,201,.2))] text-[var(--t3,#a39ba6)] hover:text-[var(--t1,#f4edf7)]'
            }`}
          >
            {value === 'all' ? t.filterAll : statusLabel[value]}
            {value !== 'all' && data ? ` (${data.counts[value] ?? 0})` : ''}
          </button>
        ))}
      </div>

      {state === 'error' && (
        <div role="alert" className="mt-4 text-sm text-red-300">
          {t.loadError}{' '}
          <button
            type="button"
            onClick={() => void list.refetch()}
            className="underline"
          >
            {t.retry}
          </button>
        </div>
      )}

      {state === 'ready' && data && data.items.length === 0 && (
        <p className="mt-4 text-sm text-neutral-400">{t.empty}</p>
      )}

      {state === 'ready' && data && data.items.length > 0 && (
        <ul className="mt-4 space-y-3">
          {data.items.map((item) => (
            <ApplicationCard
              key={item.id}
              item={item}
              statusLabel={statusLabel[item.status]}
              onDecide={decide}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ApplicationCard({
  item,
  statusLabel,
  onDecide,
}: {
  item: CircuitApplication;
  statusLabel: string;
  onDecide: (
    id: string,
    body: Record<string, unknown>,
    success: string
  ) => Promise<boolean>;
}) {
  const t = useAdminT(nsAdminCircuitPartners);
  const [slug, setSlug] = useState(item.existing_tenant_slug ?? '');
  const [notes, setNotes] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notesError, setNotesError] = useState(false);
  const open = item.status === 'new' || item.status === 'reviewing';

  const run = async (body: Record<string, unknown>, success: string) => {
    setBusy(true);
    await onDecide(item.id, body, success);
    setBusy(false);
    setConfirming(false);
  };

  const rows: Array<[string, string]> = [
    [t.fieldContact, `${item.contact_name} · ${item.email}`],
    [t.fieldGame, item.game],
    [
      t.fieldFormat,
      item.format === 'feminin' ? t.formatFeminin : t.formatMixte,
    ],
  ];
  if (item.expected_teams)
    rows.push([t.fieldTeams, String(item.expected_teams)]);
  if (item.season_start) rows.push([t.fieldSeason, item.season_start]);
  if (item.existing_tenant_slug)
    rows.push([t.fieldSpace, item.existing_tenant_slug]);
  const links = [item.website, item.community_url].filter(Boolean).join(' · ');
  if (links) rows.push([t.fieldLinks, links]);
  if (item.commits_code_of_conduct && item.commits_safety_lead)
    rows.push([t.fieldCommitments, t.commitmentsBoth]);
  if (item.admin_notes) rows.push([t.fieldNotes, item.admin_notes]);

  return (
    <li className="rounded-[var(--r-card,14px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-white">{item.organization_name}</p>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-neutral-400">
            {format(t.receivedOn, { date: formatDate(item.created_at) })}
          </span>
          <Chip tone={STATUS_TONE[item.status]}>{statusLabel}</Chip>
        </div>
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-2">
            <dt className="shrink-0 text-neutral-400">{label}</dt>
            <dd className="break-words text-neutral-100">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 whitespace-pre-wrap text-sm text-neutral-200">
        {item.message}
      </p>

      {item.status === 'approved' && item.granted_until && (
        <p className="mt-3 text-sm text-emerald-200">
          {format(t.grantedUntil, {
            slug: item.granted_tenant_slug ?? '—',
            date: formatDate(item.granted_until),
          })}
        </p>
      )}

      {open && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label
              htmlFor={`slug-${item.id}`}
              className="block text-xs text-neutral-400"
            >
              {t.labelTenantSlug}
            </label>
            <input
              id={`slug-${item.id}`}
              value={slug}
              onChange={(e) => setSlug(e.target.value.trim().toLowerCase())}
              className="mt-1 w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label
              htmlFor={`notes-${item.id}`}
              className="block text-xs text-neutral-400"
            >
              {t.labelNotes}
            </label>
            <input
              id={`notes-${item.id}`}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setNotesError(false);
              }}
              aria-invalid={notesError}
              className="mt-1 w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-sm text-white"
            />
            {notesError && (
              <p role="alert" className="mt-1 text-xs text-red-300">
                {t.notesRequired}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            {item.status === 'new' && (
              <AdminButton
                variant="ghost"
                size="sm"
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(
                    { action: 'review', notes: notes || undefined },
                    t.toastReviewed
                  )
                }
              >
                {t.actionReview}
              </AdminButton>
            )}
            <AdminButton
              variant="danger"
              size="sm"
              type="button"
              disabled={busy}
              onClick={() => {
                if (notes.trim().length < 3) {
                  setNotesError(true);
                  return;
                }
                void run({ action: 'reject', notes }, t.toastRejected);
              }}
            >
              {t.actionReject}
            </AdminButton>
            {confirming ? (
              <>
                <AdminButton
                  variant="primary"
                  size="sm"
                  type="button"
                  disabled={busy || slug.length < 2}
                  onClick={() =>
                    void run(
                      {
                        action: 'approve',
                        tenantSlug: slug,
                        notes: notes || undefined,
                      },
                      format(t.toastApproved, { slug })
                    )
                  }
                >
                  {format(t.confirmApprove, { slug })}
                </AdminButton>
                <AdminButton
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => setConfirming(false)}
                >
                  {t.cancel}
                </AdminButton>
              </>
            ) : (
              <AdminButton
                variant="secondary"
                size="sm"
                type="button"
                disabled={busy || slug.length < 2}
                onClick={() => setConfirming(true)}
              >
                {t.actionApprove}
              </AdminButton>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
