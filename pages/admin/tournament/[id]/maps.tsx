/* eslint-disable @next/next/no-img-element */
// pages/admin/tournament/[id]/maps.tsx
// Gestion (lecture/ajout/suppression) du pool de maps d'un tournoi

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useToast } from '@/components/Toast';
import Modal from '@/components/admin/Modal';
import TournamentTabsNav from '@/components/admin/tournament/TournamentTabsNav';
import { getGame, type GameDef } from '@/config/games';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTournamentMaps from '@/lib/i18n/locales/admin-fr/adminTournamentMaps';

type Dict = typeof nsAdminTournamentMaps.fr;

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type StaffProps = { staff: StaffShape };

type TournamentMini = {
  id: string;
  name: string | null;
  slug: string | null;
  game: string | null;
};

type TournamentMapRow = {
  id: string;
  tournament_id: string;
  map_name: string;
  map_slug: string | null;
  map_type: string | null;
  image_url: string | null;
  enabled: boolean;
  order_index: number | null;
  created_at?: string;
};

type ApiResponse = {
  maps: TournamentMapRow[];
  tournament?: TournamentMini | null;
};

function getTypeLabels(t: Dict): Record<string, string> {
  return {
    // Overwatch
    control: t.typeControl,
    hybrid: t.typeHybrid,
    escort: t.typeEscort,
    push: t.typePush,
    flashpoint: t.typeFlashpoint,
    clash: t.typeClash,
    // Valorant
    standard: t.typeStandard,
    // CS2
    'active-duty': t.typeActiveDuty,
  };
}

function typeLabel(t: Dict, type: string | null | undefined) {
  if (!type) return '—';
  return getTypeLabels(t)[type] || type;
}

export const getServerSideProps = withStaffPage({ permission: 'manage_tournaments' });

function AdminTournamentMapsPage(_: StaffProps) {
  const t = useAdminT(nsAdminTournamentMaps);
  const router = useRouter();
  const { id } = router.query;
  const tournamentId = Array.isArray(id) ? id[0] : id;
  const { adminFetchJson } = useAdminFetch();
  const { mutate: addMapMutate } = useIdempotentMutation();
  const { mutate: addAllMapsMutate } = useIdempotentMutation();
  const { confirm, dialog } = useConfirmDialog();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [maps, setMaps] = useState<TournamentMapRow[]>([]);
  const [tournament, setTournament] = useState<TournamentMini | null>(null);
  // Fallback d'image géré par état React (jamais de mutation impérative du DOM).
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());

  function markImageBroken(id: string) {
    setBrokenImages((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  // États pour l'ajout de map
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedPoolMap, setSelectedPoolMap] = useState('');
  const [customMapName, setCustomMapName] = useState('');
  const [customMapType, setCustomMapType] = useState('control');
  const [customMapImage, setCustomMapImage] = useState('');
  const [useCustomMap, setUseCustomMap] = useState(false);
  const [adding, setAdding] = useState(false);

  // État pour l'ajout groupé
  const [addingAll, setAddingAll] = useState(false);

  // État pour la suppression
  const [deleting, setDeleting] = useState<string | null>(null);

  // États pour l'édition
  const [editingMap, setEditingMap] = useState<TournamentMapRow | null>(null);
  const [editMapName, setEditMapName] = useState('');
  const [editMapType, setEditMapType] = useState('control');
  const [editMapImage, setEditMapImage] = useState('');
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editImagePreview, setEditImagePreview] = useState('');
  const [updating, setUpdating] = useState(false);

  const fetchMaps = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const json = await adminFetchJson<ApiResponse>(
        `/api/tournament/${tournamentId}/maps`
      );
      setMaps(json.maps || []);
      setTournament(json.tournament ?? null);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message || t.errorLoad);
    } finally {
      setLoading(false);
    }
  }, [tournamentId, adminFetchJson, t]);

  useEffect(() => {
    if (!tournamentId) return;
    fetchMaps();
  }, [tournamentId, fetchMaps]);

  async function handleAddMap() {
    if (!tournamentId) return;

    let mapName = '';
    let mapType = '';
    let imageUrl = '';

    // Jeux sans veto : seule l'option "personnalisée" est exposée
    const forceCustom = useCustomMap || !hasMapVeto;

    if (forceCustom) {
      if (!customMapName.trim()) {
        addToast(t.alertEnterMapName, 'error');
        return;
      }
      mapName = customMapName.trim();
      mapType = customMapType;
      imageUrl = customMapImage.trim();
    } else {
      if (!selectedPoolMap) {
        addToast(t.alertSelectMap, 'error');
        return;
      }
      const selected = gamePool.find((m) => m.name === selectedPoolMap);
      if (!selected) return;
      mapName = selected.name;
      mapType = selected.type;
      imageUrl = selected.image;
    }

    setAdding(true);
    setErrorMsg(null);

    try {
      const res = await addMapMutate(`/api/tournament/${tournamentId}/maps`, {
        method: 'POST',
        body: JSON.stringify({
          map_name: mapName,
          map_type: mapType,
          image_url: imageUrl || null,
          enabled: true,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || t.errorAdd);
      }

      // Réinitialiser le formulaire
      setShowAddForm(false);
      setSelectedPoolMap('');
      setCustomMapName('');
      setCustomMapImage('');
      setUseCustomMap(false);

      // Recharger la liste
      await fetchMaps();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message || t.errorAdd);
    } finally {
      setAdding(false);
    }
  }

  async function handleDeleteMap(mapId: string) {
    if (!tournamentId) return;
    const ok = await confirm({ title: t.confirmDeleteMap, variant: 'danger' });
    if (!ok) return;

    setDeleting(mapId);
    setErrorMsg(null);

    try {
      await adminFetchJson(
        `/api/tournament/${tournamentId}/maps?mapId=${mapId}`,
        { method: 'DELETE' }
      );

      // Recharger la liste
      await fetchMaps();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message || t.errorDelete);
    } finally {
      setDeleting(null);
    }
  }

  async function handleDeleteAllMaps() {
    if (!tournamentId) return;
    const ok = await confirm({ title: t.confirmDeleteAll, variant: 'danger' });
    if (!ok) return;

    setErrorMsg(null);

    try {
      await adminFetchJson(`/api/tournament/${tournamentId}/maps`, {
        method: 'DELETE',
      });

      await fetchMaps();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message || t.errorDelete);
    }
  }

  function handleEditClick(map: TournamentMapRow) {
    setEditingMap(map);
    setEditMapName(map.map_name);
    setEditMapType(map.map_type || 'control');
    setEditMapImage(map.image_url || '');
    setEditImagePreview(map.image_url || '');
    setEditImageFile(null);
  }

  function handleImageFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setEditImageFile(file);
      // Créer une preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  async function handleUpdateMap() {
    if (!tournamentId || !editingMap) return;

    setUpdating(true);
    setErrorMsg(null);

    try {
      let imageUrl = editMapImage;

      // Si un fichier a été sélectionné, l'uploader d'abord
      if (editImageFile) {
        // Pour l'instant, on utilise un service d'upload d'image gratuit (imgur, cloudinary, etc.)
        // Ou on peut convertir en base64 (pas recommandé pour la production)
        // Ici je vais utiliser une approche simple avec base64 pour la démo
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(editImageFile);
        });
        imageUrl = await base64Promise;
      }

      await adminFetchJson(
        `/api/tournament/${tournamentId}/maps?mapId=${editingMap.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            map_name: editMapName,
            map_type: editMapType,
            image_url: imageUrl || null,
          }),
        }
      );

      // Fermer le modal et recharger
      setEditingMap(null);
      await fetchMaps();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message || t.errorUpdate);
    } finally {
      setUpdating(false);
    }
  }

  async function handleAddAllMaps() {
    if (!tournamentId) return;
    if (!gameDef || !gameDef.hasMapVeto) return;
    const ok = await confirm({
      title: format(t.confirmAddAll, { game: gameDef.label }),
      variant: 'info',
    });
    if (!ok) return;

    setAddingAll(true);
    setErrorMsg(null);

    try {
      // Le serveur source d'abord le pool tenant éditable (tenant_map_pool),
      // et retombe sur le catalogue statique config/games s'il est vide. Il
      // déduplique côté serveur (par lower(map_name)).
      const res = await addAllMapsMutate(
        `/api/tournament/${tournamentId}/maps`,
        {
          method: 'POST',
          body: JSON.stringify({ defaults: true }),
        }
      );

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || t.errorAddAll);
      }

      const json = (await res.json().catch(() => ({}))) as {
        imported?: number;
      };
      if ((json.imported ?? 0) === 0) {
        addToast(t.alertAllMapsPresent, 'info');
      }

      await fetchMaps();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message || t.errorAddAll);
    } finally {
      setAddingAll(false);
    }
  }

  // Game registry — dérive le pool selon le jeu du tournoi
  const gameDef: GameDef | null = tournament?.game
    ? getGame(tournament.game)
    : null;
  const gamePool = gameDef?.mapPool ?? [];
  const hasMapVeto = !!gameDef?.hasMapVeto;

  // Filtrer les maps du pool déjà ajoutées
  const availablePoolMaps = gamePool.filter(
    (poolMap) => !maps.some((m) => m.map_name === poolMap.name)
  );

  return (
    <>
      <Head>
        <title>{t.headTitle}</title>
      </Head>
      <div className="min-h-screen bg-neutral-950 text-white pt-24">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <TournamentTabsNav
            tournamentId={String(tournamentId ?? '')}
            active="settings"
          />
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-purple-200/80">
                {t.eyebrow}
              </p>
              <h1 className="text-2xl font-semibold flex items-center gap-3">
                <span>
                  {format(t.pageTitle, {
                    name: tournament?.name || t.defaultTournamentName,
                  })}
                </span>
                {tournament?.game && (
                  <span
                    className="px-2 py-0.5 rounded-full text-xs border border-purple-400/40 bg-purple-500/10 text-purple-200 font-normal"
                    title={format(t.slugTitle, { slug: tournament.game })}
                  >
                    {format(t.gameBadge, {
                      game: gameDef?.label ?? tournament.game,
                    })}
                  </span>
                )}
              </h1>
            </div>
            <div className="flex gap-2">
              <Link
                href={`/admin/tournament/${tournamentId}/bracket?tab=map-draw`}
                className="px-3 py-1.5 rounded-lg bg-purple-600/80 border border-purple-500/30 text-sm hover:bg-purple-600"
              >
                {t.linkMapDraw}
              </Link>
              <Link
                href={`/admin/tournament/${tournamentId}/matches`}
                className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/15 text-sm hover:bg-white/15"
              >
                {t.linkMatches}
              </Link>
              <button
                onClick={() => fetchMaps()}
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm hover:bg-white/10"
              >
                {t.refresh}
              </button>
            </div>
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

          {!loading && (
            <>
              {/* Bouton Ajouter une map */}
              <div className="mb-6">
                <button
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium text-sm transition-colors"
                >
                  {showAddForm ? t.cancelAddToggle : t.addMapToggle}
                </button>
                {hasMapVeto && availablePoolMaps.length > 0 && (
                  <button
                    onClick={handleAddAllMaps}
                    disabled={addingAll}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors"
                  >
                    {addingAll
                      ? t.addingAll
                      : format(t.addAllMaps, {
                          game: gameDef?.label ?? '',
                          count: availablePoolMaps.length,
                        })}
                  </button>
                )}
                {maps.length > 0 && (
                  <button
                    onClick={handleDeleteAllMaps}
                    className="px-4 py-2 rounded-lg bg-red-600/80 hover:bg-red-700 text-white font-medium text-sm transition-colors"
                  >
                    {t.deleteAllMaps}
                  </button>
                )}
              </div>

              {/* Formulaire d'ajout */}
              {showAddForm && (
                <div className="mb-6 p-5 rounded-xl bg-white/5 border border-white/10">
                  <h3 className="text-lg font-semibold mb-4">
                    {t.addMapTitle}
                  </h3>

                  {/* Bandeau info si le jeu n'a pas de veto (ou jeu inconnu) */}
                  {!hasMapVeto && (
                    <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-400/30 text-amber-100 text-sm">
                      {gameDef
                        ? format(t.noVetoGame, { game: gameDef.label })
                        : t.noPredefinedPool}{' '}
                      {t.canAddCustom}
                    </div>
                  )}

                  {/* Toggle entre map du pool et custom (caché si pas de veto) */}
                  {hasMapVeto && (
                    <div className="flex gap-4 mb-4">
                      <button
                        onClick={() => setUseCustomMap(false)}
                        className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                          !useCustomMap
                            ? 'bg-purple-600 text-white'
                            : 'bg-white/5 text-gray-300 hover:bg-white/10'
                        }`}
                      >
                        {format(t.mapGameToggle, {
                          game: gameDef?.label ?? '',
                        })}
                      </button>
                      <button
                        onClick={() => setUseCustomMap(true)}
                        className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                          useCustomMap
                            ? 'bg-purple-600 text-white'
                            : 'bg-white/5 text-gray-300 hover:bg-white/10'
                        }`}
                      >
                        {t.mapCustomToggle}
                      </button>
                    </div>
                  )}

                  {hasMapVeto && !useCustomMap ? (
                    // Sélection map dans le pool du jeu
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm text-gray-300 mb-2">
                          {format(t.selectMapLabel, {
                            game: gameDef?.label ?? '',
                          })}
                        </label>
                        <select
                          value={selectedPoolMap}
                          onChange={(e) => setSelectedPoolMap(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
                        >
                          <option value="">{t.chooseMapPlaceholder}</option>
                          {availablePoolMaps.map((poolMap) => (
                            <option key={poolMap.name} value={poolMap.name}>
                              {poolMap.name} ({typeLabel(t, poolMap.type)})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ) : (
                    // Map personnalisée
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm text-gray-300 mb-2">
                          {t.mapNameLabel}
                        </label>
                        <input
                          type="text"
                          value={customMapName}
                          onChange={(e) => setCustomMapName(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
                          placeholder={t.mapNamePlaceholder}
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-300 mb-2">
                          {t.mapTypeLabel}
                        </label>
                        <select
                          value={customMapType}
                          onChange={(e) => setCustomMapType(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
                        >
                          <option value="control">{t.typeControl}</option>
                          <option value="escort">{t.typeEscort}</option>
                          <option value="hybrid">{t.typeHybrid}</option>
                          <option value="push">{t.typePush}</option>
                          <option value="flashpoint">{t.typeFlashpoint}</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-300 mb-2">
                          {t.imageUrlLabel}
                        </label>
                        <input
                          type="text"
                          value={customMapImage}
                          onChange={(e) => setCustomMapImage(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
                          placeholder={t.imageUrlPlaceholder}
                        />
                      </div>
                    </div>
                  )}

                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={handleAddMap}
                      disabled={adding}
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors"
                    >
                      {adding ? t.addingAll : t.addButton}
                    </button>
                    <button
                      onClick={() => setShowAddForm(false)}
                      className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm transition-colors"
                    >
                      {t.cancel}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {!loading && !errorMsg && maps.length === 0 && (
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              {t.emptyMaps}
            </div>
          )}

          {maps.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {maps
                .slice()
                .sort(
                  (a, b) =>
                    (a.order_index ?? 0) - (b.order_index ?? 0) ||
                    a.map_name.localeCompare(b.map_name)
                )
                .map((m, idx) => (
                  <div
                    key={m.id || `${m.map_name}-${idx}`}
                    className="rounded-xl bg-white/5 border border-white/10 overflow-hidden relative group"
                  >
                    {/* Image de la map (fallback géré par état React) */}
                    {m.image_url && !brokenImages.has(m.id) && (
                      <div className="relative w-full h-40 bg-gradient-to-b from-purple-900/20 to-transparent">
                        <img
                          src={m.image_url}
                          alt={m.map_name}
                          width={640}
                          height={160}
                          loading="lazy"
                          className="w-full h-full object-cover"
                          onError={() => markImageBroken(m.id)}
                        />
                      </div>
                    )}

                    {/* Contenu */}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex-1">
                          <p className="text-sm font-semibold">{m.map_name}</p>
                          <p className="text-xs text-gray-400">
                            {typeLabel(t, m.map_type)}
                            {m.map_slug ? ` • ${m.map_slug}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleEditClick(m)}
                            className="px-2 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 text-blue-200 text-xs transition-colors flex-shrink-0"
                            title={t.editTitle}
                          >
                            ✎
                          </button>
                          <button
                            onClick={() => handleDeleteMap(m.id)}
                            disabled={deleting === m.id}
                            className="px-2 py-1 rounded-lg bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 text-red-200 text-xs transition-colors disabled:opacity-50 flex-shrink-0"
                            title={t.deleteTitle}
                          >
                            {deleting === m.id ? '...' : '✕'}
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs border ${
                            m.enabled
                              ? 'border-emerald-400/50 text-emerald-200'
                              : 'border-gray-500/50 text-gray-300'
                          }`}
                        >
                          {m.enabled ? t.enabled : t.disabled}
                        </span>
                        <span className="text-xs text-gray-400">
                          {format(t.orderLabel, {
                            order: m.order_index ?? '—',
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* Modal d'édition */}
          <Modal
            open={Boolean(editingMap)}
            onClose={() => setEditingMap(null)}
            title={<h2 className="text-xl font-semibold">{t.editMapTitle}</h2>}
            size="2xl"
            backdropClassName="bg-black/50 backdrop-blur-sm"
            panelChromeClassName="bg-neutral-900 rounded-xl border border-white/10"
            footer={
              <>
                <button
                  onClick={() => setEditingMap(null)}
                  className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm transition-colors"
                >
                  {t.cancel}
                </button>
                <button
                  onClick={handleUpdateMap}
                  disabled={updating}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors"
                >
                  {updating ? t.updating : t.save}
                </button>
              </>
            }
          >
            <div className="space-y-4">
              {/* Nom de la map */}
              <div>
                <label className="block text-sm text-gray-300 mb-2">
                  {t.mapNameLabel}
                </label>
                <input
                  type="text"
                  value={editMapName}
                  onChange={(e) => setEditMapName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
                />
              </div>

              {/* Type de map */}
              <div>
                <label className="block text-sm text-gray-300 mb-2">
                  {t.mapTypeLabel}
                </label>
                <select
                  value={editMapType}
                  onChange={(e) => setEditMapType(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
                >
                  <option value="control">{t.typeControl}</option>
                  <option value="escort">{t.typeEscort}</option>
                  <option value="hybrid">{t.typeHybrid}</option>
                  <option value="push">{t.typePush}</option>
                </select>
              </div>

              {/* Preview de l'image actuelle */}
              {editImagePreview && (
                <div>
                  <label className="block text-sm text-gray-300 mb-2">
                    {t.imagePreviewLabel}
                  </label>
                  <div className="relative w-full h-48 rounded-lg overflow-hidden bg-gradient-to-b from-purple-900/20 to-transparent">
                    <img
                      src={editImagePreview}
                      alt={t.previewAlt}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              )}

              {/* Upload d'image */}
              <div>
                <label className="block text-sm text-gray-300 mb-2">
                  {t.changeImageLabel}
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageFileChange}
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-purple-600 file:text-white file:cursor-pointer hover:file:bg-purple-700"
                />
                <p className="text-xs text-gray-400 mt-1">
                  {t.imageFormatHint}
                </p>
              </div>

              {/* URL alternative */}
              <div>
                <label className="block text-sm text-gray-300 mb-2">
                  {t.orEnterUrlLabel}
                </label>
                <input
                  type="text"
                  value={editMapImage}
                  onChange={(e) => {
                    setEditMapImage(e.target.value);
                    setEditImagePreview(e.target.value);
                    setEditImageFile(null);
                  }}
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
                  placeholder={t.imageUrlPlaceholder}
                />
              </div>
            </div>
          </Modal>

          {dialog}
        </div>
      </div>
    </>
  );
}

export default AdminTournamentMapsPage;
