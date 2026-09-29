/* biome-ignore-all lint/performance/noImgElement: image hors next/image (exclusion reprise d’ESLint) */
// pages/admin/map-pool.tsx
// Catalogue de maps GLOBAL au tenant (tenant_map_pool), éditable, un onglet par jeu.
// Miroir visuel de pages/admin/tournament/[id]/maps.tsx mais sans tournamentId :
// ici la source est le pool tenant, indexé par jeu (GameSlug).

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import { withStaffPage } from '@/utils/staff';
import { useQueryClient } from '@tanstack/react-query';
import { withAdminQuery } from '@/features/admin/_shared/query';
import {
  type MapPoolEntry,
  mapPoolPaths,
} from '@/features/admin/map-pool/client';
import {
  mapPoolKeys,
  useMapPool,
} from '@/features/admin/map-pool/hooks/useMapPool';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useToast } from '@/components/Toast';
import Modal from '@/components/admin/Modal';
import Tabs, {
  useQueryTab,
  tabButtonId,
  tabPanelId,
  type TabItem,
} from '@/components/admin/Tabs';
import { listGames } from '@/config/games';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminMapPool from '@/lib/i18n/locales/admin-fr/adminMapPool';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';

type Dict = typeof nsAdminMapPool.fr;

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type StaffProps = { staff: StaffShape };

type MapPoolRow = MapPoolEntry;

const EMPTY_MAPS: MapPoolRow[] = [];

const ID_BASE = 'map-pool';

const CARD =
  'rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4';
const EYEBROW =
  'mb-2 font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--t3,#a39ba6)] [font-stretch:75%]';
const LABEL = 'mb-2 block text-sm text-[var(--t3,#a39ba6)]';
const INPUT =
  'w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-sm text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none';

function typeLabel(t: Dict, type: string | null | undefined) {
  if (!type) return '—';
  const labels: Record<string, string> = {
    control: t.typeControl,
    hybrid: t.typeHybrid,
    escort: t.typeEscort,
    push: t.typePush,
    flashpoint: t.typeFlashpoint,
    clash: t.typeClash,
    standard: t.typeStandard,
    'active-duty': t.typeActiveDuty,
  };
  return labels[type] || type;
}

export const getServerSideProps = withStaffPage({
  permission: 'manage_tournaments',
});

function AdminMapPoolPage(_: StaffProps) {
  const t = useAdminT(nsAdminMapPool);
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirmDialog();
  const { addToast } = useToast();

  // Une intention par type d'écriture (clés d'idempotence indépendantes).
  const addMutation = useIdempotentMutation();
  const editMutation = useIdempotentMutation();
  const toggleMutation = useIdempotentMutation();
  const deleteMutation = useIdempotentMutation();
  const importMutation = useIdempotentMutation();

  // Onglets = un par jeu de listGames(), état deep-linkable via ?game=.
  const tabs: TabItem[] = listGames().map((g) => ({
    id: g.slug,
    label: g.label,
  }));
  const [activeGame, setActiveGame] = useQueryTab(tabs, 'game');
  const activeGameDef = listGames().find((g) => g.slug === activeGame) ?? null;

  const mapsQuery = useMapPool(activeGame);
  const loading = mapsQuery.isFetching || mapsQuery.isPending;
  const errorMsg = mapsQuery.error
    ? mapsQuery.error.message || t.errorLoad
    : null;
  const maps: MapPoolRow[] = mapsQuery.data ?? EMPTY_MAPS;
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());

  const [importing, setImporting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Modale ajout / édition
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('');
  const [formImage, setFormImage] = useState('');
  const [saving, setSaving] = useState(false);

  // Chaque relecture repart d'images saines (une URL corrigée se réessaie).
  useEffect(() => {
    setBrokenImages(new Set());
  }, [mapsQuery.dataUpdatedAt]);

  const fetchMaps = useCallback(
    () => qc.invalidateQueries({ queryKey: mapPoolKeys.game(activeGame) }),
    [qc, activeGame]
  );

  function markImageBroken(id: string) {
    setBrokenImages((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  function openAdd() {
    setEditingId(null);
    setFormName('');
    setFormType('');
    setFormImage('');
    setModalOpen(true);
  }

  function openEdit(m: MapPoolRow) {
    setEditingId(m.id);
    setFormName(m.map_name);
    setFormType(m.map_type || '');
    setFormImage(m.image_url || '');
    setModalOpen(true);
  }

  async function handleSave() {
    if (!formName.trim()) {
      addToast(t.alertEnterMapName, 'error');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await editMutation.mutateJson(mapPoolPaths.byId(editingId), {
          method: 'PATCH',
          body: JSON.stringify({
            map_name: formName.trim(),
            map_type: formType.trim() || null,
            image_url: formImage.trim() || null,
          }),
        });
        addToast(t.toastUpdated, 'success');
      } else {
        await addMutation.mutateJson(mapPoolPaths.list, {
          method: 'POST',
          body: JSON.stringify({
            game: activeGame,
            map_name: formName.trim(),
            map_type: formType.trim() || null,
            image_url: formImage.trim() || null,
            enabled: true,
          }),
        });
        addToast(t.toastCreated, 'success');
      }
      setModalOpen(false);
      await fetchMaps();
    } catch (err: unknown) {
      addToast(
        (err as Error)?.message || (editingId ? t.errorUpdate : t.errorAdd),
        'error'
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(m: MapPoolRow) {
    setTogglingId(m.id);
    try {
      const res = await toggleMutation.mutateJson<{ map: MapPoolRow }>(
        mapPoolPaths.byId(m.id),
        {
          method: 'PATCH',
          body: JSON.stringify({ enabled: !m.enabled }),
        }
      );
      qc.setQueryData<MapPoolRow[]>(mapPoolKeys.game(activeGame), (prev) =>
        prev?.map((row) => (row.id === m.id ? res.map : row))
      );
      addToast(!m.enabled ? t.toastEnabled : t.toastDisabled, 'success');
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.errorToggle, 'error');
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(m: MapPoolRow) {
    const ok = await confirm({
      title: t.confirmDeleteMap,
      subtitle: t.confirmDeleteSubtitle,
      variant: 'danger',
    });
    if (!ok) return;
    setDeletingId(m.id);
    try {
      await deleteMutation.mutateJson(mapPoolPaths.byId(m.id), {
        method: 'DELETE',
      });
      addToast(t.toastDeleted, 'success');
      await fetchMaps();
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.errorDelete, 'error');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleImport() {
    setImporting(true);
    try {
      const res = await importMutation.mutateJson<{
        imported: number;
        skipped: number;
      }>(mapPoolPaths.importDefaults, {
        method: 'POST',
        body: JSON.stringify({ game: activeGame }),
      });
      addToast(
        format(t.importResult, {
          imported: res.imported,
          skipped: res.skipped,
        }),
        'success'
      );
      await fetchMaps();
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.importError, 'error');
    } finally {
      setImporting(false);
    }
  }

  const sortedMaps = maps
    .slice()
    .sort(
      (a, b) =>
        (a.order_index ?? Number.MAX_SAFE_INTEGER) -
          (b.order_index ?? Number.MAX_SAFE_INTEGER) ||
        a.map_name.localeCompare(b.map_name)
    );

  return (
    <>
      <Head>
        <title>{t.headTitle}</title>
      </Head>
      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <div>
          <p className={EYEBROW}>{t.eyebrow}</p>
          <AdminPageHeader
            title={t.pageTitle}
            subtitle={t.subtitle}
            actions={
              <AdminButton size="sm" onClick={() => fetchMaps()}>
                {t.refresh}
              </AdminButton>
            }
          />

          <Tabs
            tabs={tabs}
            active={activeGame}
            onChange={setActiveGame}
            ariaLabel={t.tablistLabel}
            idBase={ID_BASE}
            className="mb-6"
          />

          <div
            role="tabpanel"
            id={tabPanelId(ID_BASE, activeGame)}
            aria-labelledby={tabButtonId(ID_BASE, activeGame)}
          >
            {/* Barre d'actions */}
            <div className="mb-6 flex flex-wrap items-center gap-2">
              <AdminButton variant="primary" size="sm" onClick={openAdd}>
                {t.addMapButton}
              </AdminButton>
              <AdminButton
                size="sm"
                onClick={handleImport}
                disabled={importing}
              >
                {importing ? t.importing : t.importDefaults}
              </AdminButton>
              <span className="ml-auto">
                <Chip
                  tone="brand"
                  title={format(t.gameBadge, {
                    game: activeGameDef?.label ?? activeGame,
                  })}
                >
                  {format(t.mapCount, { count: maps.length })}
                </Chip>
              </span>
            </div>

            {loading && (
              <div className={`${CARD} text-sm text-[var(--t3,#a39ba6)]`}>
                {t.loading}
              </div>
            )}

            {errorMsg && !loading && (
              <div
                role="alert"
                className="rounded-[var(--r-card,14px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] p-4 text-sm text-[#ffc2c2]"
              >
                {errorMsg}
              </div>
            )}

            {!loading && !errorMsg && maps.length === 0 && (
              <div className={`${CARD} p-6 text-center`}>
                <p className="text-sm text-[var(--t1,#f4edf7)]">{t.empty}</p>
                <p className="mt-1 text-xs text-[var(--t3,#a39ba6)]">
                  {t.emptyHint}
                </p>
              </div>
            )}

            {!loading && !errorMsg && maps.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sortedMaps.map((m) => {
                  const showImage = m.image_url && !brokenImages.has(m.id);
                  return (
                    <div
                      key={m.id}
                      className="group relative overflow-hidden rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)]"
                    >
                      {/* Image / fallback géré par état React (pas de mutation DOM) */}
                      <div className="relative flex h-40 w-full items-center justify-center bg-[var(--s2,#1d1520)]">
                        {showImage ? (
                          <img
                            src={m.image_url as string}
                            alt={m.map_name}
                            width={640}
                            height={160}
                            className="w-full h-full object-cover"
                            onError={() => markImageBroken(m.id)}
                          />
                        ) : (
                          <span className="text-xs text-[var(--t4,#807984)]">
                            {t.imageFallback}
                          </span>
                        )}
                      </div>

                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex-1 min-w-0">
                            <p className="truncate text-sm font-semibold text-[var(--t1,#f4edf7)]">
                              {m.map_name}
                            </p>
                            <p className="text-xs text-[var(--t3,#a39ba6)]">
                              {typeLabel(t, m.map_type)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <AdminButton
                              size="xs"
                              onClick={() => openEdit(m)}
                              title={t.editTitle}
                              aria-label={t.editTitle}
                            >
                              ✎
                            </AdminButton>
                            <AdminButton
                              size="xs"
                              variant="danger"
                              onClick={() => handleDelete(m)}
                              disabled={deletingId === m.id}
                              title={t.deleteTitle}
                              aria-label={t.deleteTitle}
                            >
                              {deletingId === m.id ? '…' : '✕'}
                            </AdminButton>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={m.enabled}
                            aria-label={format(t.toggleEnabledLabel, {
                              name: m.map_name,
                            })}
                            onClick={() => handleToggle(m)}
                            disabled={togglingId === m.id}
                            className={`inline-flex h-[22px] items-center gap-1.5 rounded-[3px] border px-2 font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.12em] transition-colors [font-stretch:75%] disabled:opacity-50 ${
                              m.enabled
                                ? 'border-[rgba(127,202,101,.36)] bg-[rgba(127,202,101,.13)] text-[var(--lf-200,#b3e7a3)]'
                                : 'border-[var(--line2,rgba(194,196,201,.2))] text-[var(--t3,#a39ba6)]'
                            }`}
                          >
                            <span
                              aria-hidden="true"
                              className={`h-2 w-2 rounded-full ${
                                m.enabled
                                  ? 'bg-[var(--lf,#7fca65)]'
                                  : 'bg-[var(--t4,#807984)]'
                              }`}
                            />
                            {m.enabled ? t.enabled : t.disabled}
                          </button>
                          <span
                            className="text-xs text-[var(--t3,#a39ba6)]"
                            data-numeric
                          >
                            {format(t.orderLabel, {
                              order: m.order_index ?? '—',
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Modale ajout / édition */}
          <Modal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            title={
              <h2 className="font-[family-name:var(--fd)] text-xl font-extrabold uppercase text-[var(--t1,#f4edf7)]">
                {editingId ? t.editMapTitle : t.addMapTitle}
              </h2>
            }
            size="2xl"
            backdropClassName="bg-black/50 backdrop-blur-sm"
            panelChromeClassName="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)]"
            footer={
              <>
                <AdminButton size="sm" onClick={() => setModalOpen(false)}>
                  {t.cancel}
                </AdminButton>
                <AdminButton
                  size="sm"
                  variant="primary"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving
                    ? editingId
                      ? t.saving
                      : t.adding
                    : editingId
                      ? t.save
                      : t.add}
                </AdminButton>
              </>
            }
          >
            <div className="space-y-4">
              <div>
                <label htmlFor="map-pool-name" className={LABEL}>
                  {t.mapNameLabel}
                </label>
                <input
                  id="map-pool-name"
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  aria-label={t.mapNameLabel}
                  className={INPUT}
                  placeholder={t.mapNamePlaceholder}
                />
              </div>

              <div>
                <label htmlFor="map-pool-type" className={LABEL}>
                  {t.mapTypeLabel}
                </label>
                <input
                  id="map-pool-type"
                  type="text"
                  value={formType}
                  onChange={(e) => setFormType(e.target.value)}
                  aria-label={t.mapTypeLabel}
                  className={INPUT}
                  placeholder={t.mapTypePlaceholder}
                />
              </div>

              <div>
                <label htmlFor="map-pool-image" className={LABEL}>
                  {t.imageUrlLabel}
                </label>
                <input
                  id="map-pool-image"
                  type="text"
                  value={formImage}
                  onChange={(e) => setFormImage(e.target.value)}
                  aria-label={t.imageUrlLabel}
                  className={INPUT}
                  placeholder={t.imageUrlPlaceholder}
                />
              </div>

              {formImage.trim() && (
                <div>
                  <p className={LABEL}>{t.imagePreviewLabel}</p>
                  <div className="relative flex h-48 w-full items-center justify-center overflow-hidden rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)]">
                    <img
                      src={formImage.trim()}
                      alt={t.previewAlt}
                      width={640}
                      height={192}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              )}
            </div>
          </Modal>

          {dialog}
        </div>
      </div>
    </>
  );
}

export default withAdminQuery(AdminMapPoolPage);
