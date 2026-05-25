// pages/admin/onboarding-queue/index.tsx
//
// Lot 6 — Unified queue regrouping the two onboarding inboxes :
//   - tenant_requests   (`/admin/tenant-requests`)        — owner-only
//   - pending guild links (`/admin/pending-guild-links`) — manager+
//
// Goal : ONE page for staff to see "what's waiting on the door" without
// flipping between two screens. Actions (reject / claim) keep living on
// the dedicated pages — this view focuses on triage : list + filter +
// deep-link to the row's action surface.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch, AdminFetchError } from '@/hooks/useAdminFetch';
import type { StaffProps } from '@/types/admin';

type TenantRequestStatus =
  | 'pending_email_verification'
  | 'pending_bot_invite'
  | 'completed'
  | 'rejected'
  | 'expired';

type TenantRequestRow = {
  id: string;
  status: TenantRequestStatus;
  requestedSlug: string;
  requestedName: string;
  requesterEmail: string;
  requesterDiscordUserId: string;
  requesterDiscordDisplayName: string | null;
  createdAt: string;
  createdTenantId: string | null;
  createdGuildId: string | null;
  rejectionReason: string | null;
};

type PendingGuildLink = {
  guild_id: string;
  guild_name: string | null;
  owner_discord_id: string | null;
  requested_at: string | null;
};

type UnifiedItem =
  | {
      kind: 'tenant_request';
      id: string;
      title: string;
      subtitle: string;
      status: TenantRequestStatus;
      requestedAt: string | null;
      detailHref: string;
      raw: TenantRequestRow;
    }
  | {
      kind: 'guild_link';
      id: string;
      title: string;
      subtitle: string;
      status: 'awaiting_claim';
      requestedAt: string | null;
      detailHref: string;
      raw: PendingGuildLink;
    };

type Filter = 'all' | 'tenant_request' | 'guild_link';

export const getServerSideProps = withStaffPage('manager');

const STATUS_BADGE: Record<
  TenantRequestStatus | 'awaiting_claim',
  { label: string; className: string }
> = {
  pending_email_verification: {
    label: 'Vérif email',
    className: 'bg-amber-500/15 text-amber-200 border-amber-500/30',
  },
  pending_bot_invite: {
    label: 'Invitation bot',
    className: 'bg-blue-500/15 text-blue-200 border-blue-500/30',
  },
  completed: {
    label: 'Complétée',
    className: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/30',
  },
  rejected: {
    label: 'Rejetée',
    className: 'bg-red-500/15 text-red-200 border-red-500/30',
  },
  expired: {
    label: 'Expirée',
    className: 'bg-neutral-500/15 text-neutral-300 border-neutral-500/30',
  },
  awaiting_claim: {
    label: 'À claim',
    className: 'bg-purple-500/15 text-purple-200 border-purple-500/30',
  },
};

function formatDate(s: string | null): string {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return s;
  }
}

function OnboardingQueuePage(_props: StaffProps) {
  const { adminFetchJson } = useAdminFetch();

  const [items, setItems] = useState<UnifiedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch en parallèle pour minimiser le délai d'affichage.
      const [tenantResp, guildResp] = await Promise.allSettled([
        adminFetchJson<{ requests: TenantRequestRow[]; total: number }>(
          '/api/admin/tenant-requests?status=all&limit=50&offset=0'
        ),
        adminFetchJson<{ links: PendingGuildLink[] }>(
          '/api/admin/pending-guild-links'
        ),
      ]);

      const merged: UnifiedItem[] = [];

      if (tenantResp.status === 'fulfilled') {
        for (const r of tenantResp.value.requests) {
          merged.push({
            kind: 'tenant_request',
            id: r.id,
            title: r.requestedName || r.requestedSlug,
            subtitle:
              r.requesterDiscordDisplayName ||
              r.requesterEmail ||
              r.requesterDiscordUserId,
            status: r.status,
            requestedAt: r.createdAt ?? null,
            detailHref: `/admin/tenant-requests?focus=${encodeURIComponent(r.id)}`,
            raw: r,
          });
        }
      } else {
        // 403 owner-only is expected for managers — we just show the
        // guild-link rows then.
        const err = tenantResp.reason as AdminFetchError;
        if (err?.status && err.status !== 403) {
          setError(err.message || 'Erreur tenant-requests');
        }
      }

      if (guildResp.status === 'fulfilled') {
        for (const g of guildResp.value.links) {
          merged.push({
            kind: 'guild_link',
            id: g.guild_id,
            title: g.guild_name || `Guild ${g.guild_id}`,
            subtitle: g.owner_discord_id
              ? `Owner: ${g.owner_discord_id}`
              : '—',
            status: 'awaiting_claim',
            requestedAt: g.requested_at ?? null,
            detailHref: `/admin/pending-guild-links#${encodeURIComponent(g.guild_id)}`,
            raw: g,
          });
        }
      } else {
        const err = guildResp.reason as AdminFetchError;
        if (err?.status && err.status !== 403) {
          setError((prev) =>
            prev ?? err.message ?? 'Erreur pending-guild-links'
          );
        }
      }

      merged.sort((a, b) => {
        const ta = a.requestedAt ? Date.parse(a.requestedAt) : 0;
        const tb = b.requestedAt ? Date.parse(b.requestedAt) : 0;
        return tb - ta; // plus récents en premier
      });

      setItems(merged);
    } catch (e) {
      setError((e as Error)?.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson]);

  useEffect(() => {
    fetchAll();
    const handle = setInterval(fetchAll, 60_000);
    return () => clearInterval(handle);
  }, [fetchAll]);

  const visible = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((i) => i.kind === filter);
  }, [items, filter]);

  const counts = useMemo(() => {
    const tenantPending = items.filter(
      (i) =>
        i.kind === 'tenant_request' &&
        (i.status === 'pending_email_verification' ||
          i.status === 'pending_bot_invite')
    ).length;
    const guildPending = items.filter((i) => i.kind === 'guild_link').length;
    return {
      total: items.length,
      tenantPending,
      guildPending,
    };
  }, [items]);

  return (
    <>
      <Head>
        <title>Admin – Onboarding queue</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                Onboarding queue
              </h1>
              <p className="text-sm text-neutral-400 mt-1">
                Vue unifiée des demandes de tenant + des guilds Discord en
                attente de claim. Les actions détaillées (reject, claim,
                expire) restent sur les pages dédiées.
              </p>
            </div>
            <button
              type="button"
              onClick={fetchAll}
              className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors"
            >
              Rafraîchir
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
            <Stat
              label="Total"
              value={counts.total}
              active={filter === 'all'}
              onClick={() => setFilter('all')}
            />
            <Stat
              label="Tenant requests (pending)"
              value={counts.tenantPending}
              accent="amber"
              active={filter === 'tenant_request'}
              onClick={() => setFilter('tenant_request')}
              href="/admin/tenant-requests"
            />
            <Stat
              label="Guild links (claim)"
              value={counts.guildPending}
              accent="purple"
              active={filter === 'guild_link'}
              onClick={() => setFilter('guild_link')}
              href="/admin/pending-guild-links"
            />
          </div>

          {error && (
            <div className="mb-4 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {loading && items.length === 0 && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 px-4 py-8 text-center text-sm text-neutral-400">
              Chargement…
            </div>
          )}

          {!loading && visible.length === 0 && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-8 text-center text-sm text-neutral-500">
              Rien en attente. ✨
            </div>
          )}

          <div className="space-y-2">
            {visible.map((item) => (
              <ItemRow key={`${item.kind}:${item.id}`} item={item} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  accent,
  active,
  onClick,
  href,
}: {
  label: string;
  value: number;
  accent?: 'amber' | 'purple';
  active?: boolean;
  onClick?: () => void;
  href?: string;
}) {
  const accentClass =
    accent === 'amber'
      ? 'border-amber-500/50 bg-amber-900/20 text-amber-200'
      : accent === 'purple'
        ? 'border-purple-500/50 bg-purple-900/20 text-purple-200'
        : 'border-neutral-800 bg-neutral-900/60 text-neutral-200';
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${accentClass} ${
        active ? 'ring-2 ring-white/30' : ''
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left"
      >
        <div className="text-xs uppercase tracking-wide opacity-80">
          {label}
        </div>
        <div className="text-2xl font-bold mt-1">{value}</div>
      </button>
      {href && (
        <Link
          href={href}
          className="block text-[10px] uppercase tracking-widest opacity-70 hover:opacity-100 mt-2"
        >
          Voir la file dédiée →
        </Link>
      )}
    </div>
  );
}

function ItemRow({ item }: { item: UnifiedItem }) {
  const badge = STATUS_BADGE[item.status];
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-neutral-400 mb-1">
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-medium border ${badge.className}`}
            >
              {badge.label}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-neutral-500">
              {item.kind === 'tenant_request'
                ? 'Tenant request'
                : 'Guild link'}
            </span>
            <span className="text-neutral-600">·</span>
            <span>{formatDate(item.requestedAt)}</span>
          </div>
          <div className="text-base font-semibold">{item.title}</div>
          <div className="text-xs text-neutral-400 mt-0.5">{item.subtitle}</div>
        </div>
        <Link
          href={item.detailHref}
          className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium"
        >
          Détail →
        </Link>
      </div>
    </div>
  );
}

export default OnboardingQueuePage;
