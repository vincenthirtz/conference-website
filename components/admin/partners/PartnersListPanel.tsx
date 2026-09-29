// components/admin/partners/PartnersListPanel.tsx
// Admin: liste des partenaires du tenant courant + modale de création.
// Rendered as the "Partenaires" tab of the /admin/partners hub.
//
// Données : features/admin/partners (client typé + cache partagé, lot L10) —
// liste paginée, bascule actif/inactif et suppression invalident la liste.
//
// Deep-link `?new=1` (ex-route /admin/partners/new) ouvre la modale de création.
// minRole 'admin' (miroir des routes API).

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useUrlFilters } from '@/utils/useUrlFilters';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import {
  useInvalidatePartners,
  usePartnersList,
  useRemovePartner,
  useTogglePartnerActive,
} from '@/features/admin/partners/hooks/usePartners';
import type { PartnerListRow } from '@/features/admin/partners/client';
import PartnerFormModal from '@/components/admin/partners/PartnerFormModal';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminPartnersList from '@/lib/i18n/locales/admin-fr/adminPartnersList';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import ListToolbar, {
  FilterSelect,
  ListSearch,
} from '@/features/admin/_shared/ui/ListToolbar';
import Chip, { type ChipTone } from '@/features/admin/_shared/ui/Chip';

type Dict = typeof nsAdminPartnersList.fr;

type PartnerRow = PartnerListRow;

const P_FILTER_KEYS = ['category', 'active', 'search'] as const;

const PAGE_LIMIT = 50;

const getCategoryLabels = (tx: Dict): Record<string, string> => ({
  super: tx.categorySuper,
  major: tx.categoryMajor,
  cultural: tx.categoryCultural,
});

const categoryTones: Record<string, ChipTone> = {
  super: 'brand',
  major: 'neutral',
  cultural: 'neutral',
};

export default function PartnersListPanel() {
  const tx = useAdminT(nsAdminPartnersList);
  const categoryLabels = getCategoryLabels(tx);
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();
  const { filters, setFilters } = useUrlFilters(P_FILTER_KEYS);

  const categoryFilter = filters.category ?? '';
  const activeFilter = filters.active ?? '';
  const searchFilter = filters.search ?? '';

  // Champ de recherche local (debounce → query param `search`)
  const [searchInput, setSearchInput] = useState(searchFilter);

  // Filtres (category/active/search) restent pilotés par l'URL (partage de
  // lien) et passés en params serveur ; la pagination reste un état d'UI.
  const [offset, setOffsetState] = useState(0);
  const setOffset = useCallback(
    (next: number) => setOffsetState(Math.max(0, next)),
    []
  );
  const resetOffset = useCallback(() => setOffsetState(0), []);
  const list = usePartnersList({
    limit: PAGE_LIMIT,
    offset,
    category: categoryFilter,
    active: activeFilter,
    search: searchFilter,
  });
  const partners: PartnerRow[] = list.data?.items ?? [];
  const total = list.data?.total ?? null;
  // `isFetching` et non `isPending` : chaque rechargement repasse par l'état
  // de chargement, comme avant la migration.
  const loading = list.isFetching;
  const errorMsg = list.isError && !list.isFetching ? list.error.message : null;
  const fetchPartners = useInvalidatePartners();
  const removePartner = useRemovePartner();
  const toggleActiveMutation = useTogglePartnerActive();

  // Garde le champ local en phase si l'URL change (navigation, partage de lien)
  useEffect(() => {
    setSearchInput(searchFilter);
  }, [searchFilter]);

  // Debounce ~300ms : propage la saisie vers le query param `search`
  // biome-ignore lint/correctness/useExhaustiveDependencies: debounce piloté par la seule saisie utilisateur ; ajouter searchFilter/setFilters/resetOffset réinitialiserait le timer
  useEffect(() => {
    if (searchInput === searchFilter) return;
    const t = setTimeout(() => {
      resetOffset();
      setFilters({ search: searchInput.trim() || null });
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Tout changement de filtre serveur revient à la première page
  useEffect(() => {
    resetOffset();
  }, [categoryFilter, activeFilter, searchFilter, resetOffset]);

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
      title: tx.deleteConfirmTitle,
      variant: 'danger',
      confirmLabel: tx.delete,
    });
    if (!ok) return;
    try {
      await removePartner.mutateAsync(id);
    } catch (err: unknown) {
      addToast((err as Error)?.message || tx.errorDelete, 'error');
    }
  };

  const toggleActive = async (partner: PartnerRow) => {
    try {
      await toggleActiveMutation.mutateAsync({
        id: partner.id,
        isActive: !partner.is_active,
      });
    } catch (err: unknown) {
      addToast((err as Error)?.message || tx.errorUpdate, 'error');
    }
  };

  const showingFrom = partners.length > 0 ? offset + 1 : 0;
  const showingTo = offset + partners.length;

  return (
    <>
      {dialog}
      <PartnerFormModal
        open={modalOpen}
        onClose={closeModal}
        onCreated={() => void fetchPartners()}
      />

      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              {tx.heading}
            </h1>
            <p className="text-neutral-400 text-sm mt-1">
              {total !== null
                ? format(total > 1 ? tx.count_other : tx.count_one, {
                    count: total,
                  })
                : tx.loading}
            </p>
          </div>

          <AdminButton
            variant="primary"
            size="md"
            type="button"
            onClick={() => setModalOpen(true)}
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
                d="M12 4v16m8-8H4"
              />
            </svg>
            {tx.newButton}
          </AdminButton>
        </div>
      </div>

      {/* Error Message */}
      {errorMsg && (
        <div className="mb-6 rounded-[var(--r-card,14px)] bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm flex items-center gap-2">
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
          {errorMsg}
        </div>
      )}

      {/* Filters */}
      <ListToolbar
        search={
          <ListSearch
            value={searchInput}
            onChange={setSearchInput}
            placeholder={tx.searchPlaceholder}
            label={tx.searchLabel}
          />
        }
        filters={
          <>
            <FilterSelect
              label={tx.categoryLabel}
              allLabel={tx.categoryAll}
              value={categoryFilter}
              onChange={(v) => setFilters({ category: v })}
              options={[
                { value: 'super', label: tx.categorySuper },
                { value: 'major', label: tx.categoryMajor },
                { value: 'cultural', label: tx.categoryCultural },
              ]}
            />
            <FilterSelect
              label={tx.statusLabel}
              allLabel={tx.statusAll}
              value={activeFilter}
              onChange={(v) => setFilters({ active: v })}
              options={[
                { value: 'true', label: tx.statusActive },
                { value: 'false', label: tx.statusInactive },
              ]}
            />
          </>
        }
      />

      {/* Partners List */}
      <section className="bg-[var(--s1,#100812)] backdrop-blur border border-[var(--line2,rgba(194,196,201,.2))] rounded-[var(--r-card,14px)] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
          </div>
        ) : partners.length === 0 ? (
          <div className="text-center py-20 text-neutral-400">
            <svg
              className="w-12 h-12 mx-auto mb-4 text-neutral-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            {tx.emptyState}
          </div>
        ) : (
          <div className="divide-y divide-neutral-700/50">
            {partners.map((p) => (
              <div
                key={p.id}
                className={`flex items-center gap-4 p-4 hover:bg-neutral-700/30 transition-colors group ${
                  !p.is_active ? 'opacity-60' : ''
                }`}
              >
                {/* Logo or icon */}
                <div className="flex-shrink-0">
                  {p.logo_url ? (
                    // biome-ignore lint/performance/noImgElement: image hors next/image (exclusion reprise d’ESLint)
                    <img
                      src={p.logo_url}
                      alt={p.name}
                      className="w-12 h-12 rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] object-cover bg-white/5"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-[var(--r-card,14px)] bg-[var(--s3,#2f2732)] flex items-center justify-center border border-[var(--line2,rgba(194,196,201,.2))]">
                      <svg
                        className="w-6 h-6 text-neutral-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                        />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-white group-hover:text-blue-400 transition-colors truncate">
                      {p.name}
                    </h3>
                    <Chip tone={categoryTones[p.category]}>
                      {categoryLabels[p.category]}
                    </Chip>
                    {p.note && <Chip tone="warn">{p.note}</Chip>}
                    {!p.is_active && <Chip>{tx.statusInactive}</Chip>}
                  </div>
                  <p className="text-sm text-neutral-400 truncate">
                    {p.description}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-neutral-500 mt-1">
                    <span>
                      {format(tx.order, { order: String(p.display_order) })}
                    </span>
                    {p.website_url && (
                      <>
                        <span>•</span>
                        <a
                          href={p.website_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-blue-400 transition"
                        >
                          {tx.website}
                        </a>
                      </>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => toggleActive(p)}
                    className={`px-3 py-1.5 rounded-[var(--r-ctrl,4px)] border text-sm transition-colors ${
                      p.is_active
                        ? 'border-amber-500/40 text-amber-300 hover:border-amber-400'
                        : 'border-emerald-500/40 text-emerald-300 hover:border-emerald-400'
                    }`}
                  >
                    {p.is_active ? tx.deactivate : tx.activate}
                  </button>
                  <AdminButtonLink
                    variant="ghost"
                    size="xs"
                    href={`/admin/partners/${p.id}`}
                  >
                    {tx.edit}
                  </AdminButtonLink>
                  <AdminButton
                    variant="danger"
                    size="xs"
                    onClick={() => onDelete(p.id)}
                  >
                    {tx.delete}
                  </AdminButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Pagination */}
      {partners.length > 0 && (
        <div className="flex justify-between items-center mt-6">
          <AdminButton
            variant="ghost"
            size="md"
            type="button"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_LIMIT))}
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
            {tx.previous}
          </AdminButton>

          <span className="text-neutral-400 text-sm">
            {showingFrom} – {showingTo}
            {total !== null ? format(tx.paginationOf, { total }) : ''}
          </span>

          <AdminButton
            variant="ghost"
            size="md"
            type="button"
            disabled={total !== null && offset + PAGE_LIMIT >= total}
            onClick={() => setOffset(offset + PAGE_LIMIT)}
          >
            {tx.next}
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
    </>
  );
}
