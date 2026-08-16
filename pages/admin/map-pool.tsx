/* eslint-disable @next/next/no-img-element */
// pages/admin/map-pool.tsx
// Catalogue de maps GLOBAL au tenant (tenant_map_pool), éditable, un onglet par jeu.
// Miroir visuel de pages/admin/tournament/[id]/maps.tsx mais sans tournamentId :
// ici la source est le pool tenant, indexé par jeu (GameSlug).

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
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

type Dict = typeof nsAdminMapPool.fr;

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type StaffProps = { staff: StaffShape };

type MapPoolRow = {
  id: string;
  tenant_id: string;
  game: string;
  map_name: string;
  map_type: string | null;
  image_url: string | null;
  enabled: boolean;
  order_index: number | null;
  created_at?: string;
  updated_at?: string;
};

type GameMapsResponse = {
  game: string;
  maps: MapPoolRow[];
};

const ID_BASE = 'map-pool';

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

export const getServerSideProps = withStaffPage('admin');

function AdminMapPoolPage(_: StaffProps) {
  const t = useAdminT(nsAdminMapPool);
  const { adminFetchJson } = useAdminFetch();
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

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [maps, setMaps] = useState<MapPoolRow[]>([]);
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

  const fetchMaps = useCallback(async () => {
    if (!activeGame) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const json = await adminFetchJson<GameMapsResponse>(
        `/api/admin/map-pool?game=${encodeURIComponent(activeGame)}`
      );
      setMaps(json.maps || []);
      setBrokenImages(new Set());
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message || t.errorLoad);
    } finally {
      setLoading(false);
    }
  }, [activeGame, adminFetchJson, t]);

  useEffect(() => {
    fetchMaps();
  }, [fetchMaps]);

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
        await editMutation.mutateJson(
          `/api/admin/map-pool/${encodeURIComponent(editingId)}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              map_name: formName.trim(),
              map_type: formType.trim() || null,
              image_url: formImage.trim() || null,
            }),
          }
        );
        addToast(t.toastUpdated, 'success');
      } else {
        await addMutation.mutateJson('/api/admin/map-pool', {
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
        `/api/admin/map-pool/${encodeURIComponent(m.id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ enabled: !m.enabled }),
        }
      );
      setMaps((prev) => prev.map((row) => (row.id === m.id ? res.map : row)));
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
      await deleteMutation.mutateJson(
        `/api/admin/map-pool/${encodeURIComponent(m.id)}`,
        { method: 'DELETE' }
      );
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
      }>('/api/admin/map-pool/import-defaults', {
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
      <div className="min-h-screen bg-neutral-950 text-white pt-24">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-purple-200/80">
                {t.eyebrow}
              </p>
              <h1 className="text-2xl font-semibold">{t.pageTitle}</h1>
              <p className="text-sm text-gray-400 mt-1">{t.subtitle}</p>
            </div>
            <button
              onClick={() => fetchMaps()}
              className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm hover:bg-white/10 flex-shrink-0"
            >
              {t.refresh}
            </button>
          </div>

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
            <div className="flex flex-wrap items-center gap-2 mb-6">
              <button
                onClick={openAdd}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium text-sm transition-colors"
              >
                {t.addMapButton}
              </button>
              <button
                onClick={handleImport}
                disabled={importing}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors"
              >
                {importing ? t.importing : t.importDefaults}
              </button>
              <span
                className="ml-auto px-2 py-0.5 rounded-full text-xs border border-purple-400/40 bg-purple-500/10 text-purple-200"
                title={format(t.gameBadge, {
                  game: activeGameDef?.label ?? activeGame,
                })}
              >
                {format(t.mapCount, { count: maps.length })}
              </span>
            </div>

            {loading && (
              <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                {t.loading}
              </div>
            )}

            {errorMsg && !loading && (
              <div className="p-4 rounded-lg bg-red-900/60 border border-red-500/40 text-red-100">
                {errorMsg}
              </div>
            )}

            {!loading && !errorMsg && maps.length === 0 && (
              <div className="p-6 rounded-lg bg-white/5 border border-white/10 text-center">
                <p className="text-sm text-gray-200">{t.empty}</p>
                <p className="text-xs text-gray-400 mt-1">{t.emptyHint}</p>
              </div>
            )}

            {!loading && !errorMsg && maps.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sortedMaps.map((m) => {
                  const showImage = m.image_url && !brokenImages.has(m.id);
                  return (
                    <div
                      key={m.id}
                      className="rounded-xl bg-white/5 border border-white/10 overflow-hidden relative group"
                    >
                      {/* Image / fallback géré par état React (pas de mutation DOM) */}
                      <div className="relative w-full h-40 bg-gradient-to-b from-purple-900/20 to-transparent flex items-center justify-center">
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
                          <span className="text-xs text-gray-500">
                            {t.imageFallback}
                          </span>
                        )}
                      </div>

                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">
                              {m.map_name}
                            </p>
                            <p className="text-xs text-gray-400">
                              {typeLabel(t, m.map_type)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => openEdit(m)}
                              className="px-2 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 text-blue-200 text-xs transition-colors"
                              title={t.editTitle}
                              aria-label={t.editTitle}
                            >
                              ✎
                            </button>
                            <button
                              onClick={() => handleDelete(m)}
                              disabled={deletingId === m.id}
                              className="px-2 py-1 rounded-lg bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 text-red-200 text-xs transition-colors disabled:opacity-50"
                              title={t.deleteTitle}
                              aria-label={t.deleteTitle}
                            >
                              {deletingId === m.id ? '…' : '✕'}
                            </button>
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
                            className={`inline-flex items-center gap-2 px-2 py-0.5 rounded-full text-xs border transition-colors disabled:opacity-50 ${
                              m.enabled
                                ? 'border-emerald-400/50 text-emerald-200 bg-emerald-500/10'
                                : 'border-gray-500/50 text-gray-300 bg-white/5'
                            }`}
                          >
                            <span
                              aria-hidden="true"
                              className={`w-2 h-2 rounded-full ${
                                m.enabled ? 'bg-emerald-400' : 'bg-gray-500'
                              }`}
                            />
                            {m.enabled ? t.enabled : t.disabled}
                          </button>
                          <span className="text-xs text-gray-400">
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
              <h2 className="text-xl font-semibold">
                {editingId ? t.editMapTitle : t.addMapTitle}
              </h2>
            }
            size="2xl"
            backdropClassName="bg-black/50 backdrop-blur-sm"
            panelChromeClassName="bg-neutral-900 rounded-xl border border-white/10"
            footer={
              <>
                <button
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm transition-colors"
                >
                  {t.cancel}
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors"
                >
                  {saving
                    ? editingId
                      ? t.saving
                      : t.adding
                    : editingId
                      ? t.save
                      : t.add}
                </button>
              </>
            }
          >
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="map-pool-name"
                  className="block text-sm text-gray-300 mb-2"
                >
                  {t.mapNameLabel}
                </label>
                <input
                  id="map-pool-name"
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  aria-label={t.mapNameLabel}
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
                  placeholder={t.mapNamePlaceholder}
                />
              </div>

              <div>
                <label
                  htmlFor="map-pool-type"
                  className="block text-sm text-gray-300 mb-2"
                >
                  {t.mapTypeLabel}
                </label>
                <input
                  id="map-pool-type"
                  type="text"
                  value={formType}
                  onChange={(e) => setFormType(e.target.value)}
                  aria-label={t.mapTypeLabel}
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
                  placeholder={t.mapTypePlaceholder}
                />
              </div>

              <div>
                <label
                  htmlFor="map-pool-image"
                  className="block text-sm text-gray-300 mb-2"
                >
                  {t.imageUrlLabel}
                </label>
                <input
                  id="map-pool-image"
                  type="text"
                  value={formImage}
                  onChange={(e) => setFormImage(e.target.value)}
                  aria-label={t.imageUrlLabel}
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
                  placeholder={t.imageUrlPlaceholder}
                />
              </div>

              {formImage.trim() && (
                <div>
                  <p className="block text-sm text-gray-300 mb-2">
                    {t.imagePreviewLabel}
                  </p>
                  <div className="relative w-full h-48 rounded-lg overflow-hidden bg-gradient-to-b from-purple-900/20 to-transparent flex items-center justify-center">
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

export default AdminMapPoolPage;
