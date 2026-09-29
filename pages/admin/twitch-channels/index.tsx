import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import { useTwitchLiveStatuses } from '@/hooks/useTwitchLiveStatuses';
import DiffusionTabsNav from '@/components/admin/broadcast/DiffusionTabsNav';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminResource } from '@/hooks/useAdminResource';
import TwitchChannelFormModal from '@/components/admin/twitch-channels/TwitchChannelFormModal';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import ListToolbar, {
  ListSearch,
} from '@/features/admin/_shared/ui/ListToolbar';

import { logger } from '../../../utils/logger';
import nsAdminTwitchChannelsList from '@/lib/i18n/locales/admin-fr/adminTwitchChannelsList';
type Dict = typeof nsAdminTwitchChannelsList.fr;

type TwitchChannelRow = {
  id: string;
  channel: string;
  label: string;
  badge: string | null;
  description: string | null;
  background_url: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type ApiResponse = {
  items: TwitchChannelRow[];
};

type Props = {
  staff: {
    id: string;
    role: string;
    display_name: string;
  };
};

function statusLabel(t: Dict, isActive: boolean) {
  return isActive ? t.statusActive : t.statusInactive;
}

function AdminTwitchChannelsPage(_props: Props) {
  const t = useAdminT(nsAdminTwitchChannelsList);
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const { adminFetch, adminFetchJson } = useAdminFetch();
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();
  const [search, setSearch] = useState('');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Liste complète chargée en une fois : la recherche est filtrée côté client
  // (voir `filteredChannels`). `limit: 100` réplique le défaut de
  // /api/admin/twitch-channels (l'ancienne requête n'envoyait pas de limite) ;
  // pas de COUNT nécessaire (includeTotal: false).
  const {
    data: channels,
    loading,
    error: loadError,
    refresh: fetchData,
    mutate,
  } = useAdminResource<TwitchChannelRow, ApiResponse>(
    '/api/admin/twitch-channels',
    {
      limit: 100,
      includeTotal: false,
      params: { includeInactive: true },
      select: (res) => res.items || [],
    }
  );

  // Qui est en direct MAINTENANT : la liste disait « active / inactive »,
  // jamais « à l'antenne ». Chaînes actives seulement (les autres ne sont
  // pas suivies par le site).
  const { statuses: liveStatuses } = useTwitchLiveStatuses(
    channels.filter((c) => c.is_active).map((c) => c.channel)
  );

  // Deep-link : `?new=1` (ancienne route /new) ouvre la modale de création.
  useEffect(() => {
    if (!router.isReady) return;
    if (router.query.new) setModalOpen(true);
  }, [router.isReady, router.query.new]);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    if (router.query.new) {
      const { new: _omit, ...rest } = router.query;
      void router.replace(
        { pathname: router.pathname, query: rest },
        undefined,
        { shallow: true }
      );
    }
  }, [router]);

  const onDelete = async (id: string) => {
    const ok = await confirm({
      title: t.deleteConfirmTitle,
      variant: 'danger',
      confirmLabel: t.delete,
    });
    if (!ok) return;
    try {
      await adminFetchJson(`/api/admin/twitch-channels/${id}`, {
        method: 'DELETE',
      });
      fetchData();
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.errorDelete, 'error');
    }
  };

  const onToggleActive = async (channel: TwitchChannelRow) => {
    try {
      await adminFetchJson(`/api/admin/twitch-channels/${channel.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !channel.is_active }),
      });
      fetchData();
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.errorUpdate, 'error');
    }
  };

  const onDrop = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      const reordered = [...channels];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);

      const updates: { id: string; sortOrder: number }[] = [];
      reordered.forEach((c, i) => {
        if (c.sort_order !== i) {
          updates.push({ id: c.id, sortOrder: i });
        }
      });

      // Optimistic update (patch local des rows, écrasé au prochain fetch).
      mutate(reordered.map((c, i) => ({ ...c, sort_order: i })));
      setDragIdx(null);
      setOverIdx(null);

      if (updates.length === 0) return;

      setSaving(true);
      try {
        await Promise.all(
          updates.map((u) =>
            adminFetch(`/api/admin/twitch-channels/${u.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ sortOrder: u.sortOrder }),
            })
          )
        );
      } catch (err: unknown) {
        logger.error('Reorder error', err);
        addToast(t.errorReorder, 'error');
        // Rollback : re-fetch la source de vérité (annule l'ordre optimiste).
        fetchData();
      } finally {
        setSaving(false);
      }
    },
    [channels, fetchData, mutate, adminFetch, addToast, t]
  );

  const filteredChannels = channels.filter(
    (c) =>
      c.label.toLowerCase().includes(search.toLowerCase()) ||
      c.channel.toLowerCase().includes(search.toLowerCase()) ||
      (c.badge && c.badge.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <>
      {dialog}
      <TwitchChannelFormModal
        open={modalOpen}
        onClose={closeModal}
        onCreated={fetchData}
      />
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <DiffusionTabsNav active="twitch" />
        <AdminPageHeader
          title={t.heading}
          subtitle={format(channels.length > 1 ? t.count_other : t.count_one, {
            count: channels.length,
          })}
          actions={
            <AdminButton variant="primary" onClick={() => setModalOpen(true)}>
              <svg
                aria-hidden
                className="h-4 w-4"
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
              {t.addButton}
            </AdminButton>
          }
        />

        <ListToolbar
          search={
            <ListSearch
              value={search}
              onChange={setSearch}
              placeholder={t.searchPlaceholder}
              label={t.searchLabel}
            />
          }
        />

        {/* Liste des chaînes */}
        <section className="overflow-hidden rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)]">
          {loading ? (
            <LoadingSpinner className="py-20" />
          ) : loadError && channels.length === 0 ? (
            // UNE LECTURE RATÉE N'EST PAS UNE LISTE VIDE. Sans cette branche,
            // une panne affichait l'état « aucun élément » — et on en recréait
            // un qui existait déjà.
            <div role="alert" className="py-16 text-center">
              <p className="text-sm text-[var(--err,#ff6b6b)]">{t.loadError}</p>
              <AdminButton
                size="sm"
                className="mt-4"
                onClick={() => void fetchData()}
              >
                {t.retry}
              </AdminButton>
            </div>
          ) : filteredChannels.length === 0 ? (
            <div className="py-20 text-center text-[var(--t3,#a39ba6)]">
              <svg
                aria-hidden
                className="mx-auto mb-4 h-12 w-12 text-[var(--t4,#807984)]"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
              </svg>
              {search ? t.emptyFiltered : t.emptyState}
            </div>
          ) : (
            <div className="divide-y divide-[var(--line2,rgba(194,196,201,.2))]">
              {saving && (
                <div className="bg-[rgba(180,103,209,.1)] px-4 py-2 text-center text-xs text-[var(--or-200,#eec4ff)]">
                  {t.savingOrder}
                </div>
              )}
              {filteredChannels.map((c, idx) => {
                const isDragging = dragIdx === idx;
                const isOver = overIdx === idx;
                const canDrag = !search;
                return (
                  <div
                    key={c.id}
                    draggable={canDrag}
                    onDragStart={(e) => {
                      setDragIdx(idx);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      setOverIdx(idx);
                    }}
                    onDragLeave={() => {
                      if (overIdx === idx) setOverIdx(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragIdx !== null) onDrop(dragIdx, idx);
                    }}
                    onDragEnd={() => {
                      setDragIdx(null);
                      setOverIdx(null);
                    }}
                    className={`group flex items-center gap-4 p-4 transition-colors ${
                      isDragging
                        ? 'bg-[var(--s2,#1d1520)] opacity-40'
                        : isOver
                          ? 'border-t-2 border-[var(--or,#b467d1)] bg-[rgba(180,103,209,.08)]'
                          : 'hover:bg-[var(--s2,#1d1520)]'
                    }`}
                    style={{ cursor: canDrag ? 'grab' : undefined }}
                  >
                    {/* Poignée de glisser-déposer */}
                    {canDrag && (
                      <div className="flex-shrink-0 cursor-grab text-[var(--t4,#807984)] hover:text-[var(--t2,#c7bfca)] active:cursor-grabbing">
                        <svg
                          aria-hidden
                          className="h-5 w-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 8h16M4 16h16"
                          />
                        </svg>
                      </div>
                    )}
                    {/* Visuel */}
                    <div className="flex-shrink-0">
                      {c.background_url ? (
                        <Image
                          src={c.background_url}
                          alt={c.label}
                          width={48}
                          height={48}
                          className="h-12 w-12 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-[var(--r-ctrl,4px)] border border-[rgba(180,103,209,.4)] bg-[rgba(180,103,209,.12)]">
                          <svg
                            aria-hidden
                            className="h-6 w-6 text-[var(--or-300,#dea3f6)]"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Infos */}
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-[var(--t1,#f4edf7)]">
                          {c.label}
                        </h3>
                        {liveStatuses[c.channel.toLowerCase()]?.live && (
                          <Chip tone="live">{t.liveNow}</Chip>
                        )}
                        <Chip tone={c.is_active ? 'ok' : 'neutral'}>
                          {statusLabel(t, c.is_active)}
                        </Chip>
                        {c.badge && <Chip tone="brand">{c.badge}</Chip>}
                      </div>
                      <p className="mb-1 text-sm text-[var(--t3,#a39ba6)]">
                        <a
                          href={`https://twitch.tv/${c.channel}`}
                          target="_blank"
                          rel="noreferrer"
                          className="transition-colors hover:text-[var(--or-200,#eec4ff)]"
                        >
                          twitch.tv/{c.channel}
                        </a>
                      </p>
                      {c.description && (
                        <p className="truncate text-sm text-[var(--t2,#c7bfca)]">
                          {c.description}
                        </p>
                      )}
                    </div>

                    {/* Ordre */}
                    <div className="flex-shrink-0 text-center">
                      <span className="font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--t4,#807984)] [font-stretch:75%]">
                        {t.order}
                      </span>
                      <div
                        className="text-lg font-bold text-[var(--t2,#c7bfca)]"
                        data-numeric
                      >
                        {c.sort_order}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <AdminButton size="sm" onClick={() => onToggleActive(c)}>
                        {c.is_active ? t.deactivate : t.activate}
                      </AdminButton>
                      <AdminButtonLink
                        size="sm"
                        href={`/admin/twitch-channels/${c.id}`}
                      >
                        {t.edit}
                      </AdminButtonLink>
                      <AdminButton
                        size="sm"
                        variant="danger"
                        onClick={() => onDelete(c.id)}
                      >
                        {t.delete}
                      </AdminButton>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

export const getServerSideProps = withStaffPage({
  permission: 'manage_broadcast',
});

export default AdminTwitchChannelsPage;
