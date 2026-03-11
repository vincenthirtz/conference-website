// pages/admin/tournament/[id]/maps.tsx
// Gestion (lecture/ajout/suppression) du pool de maps d'un tournoi

import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { OVERWATCH_MAPS } from '@/config/overwatch-maps';

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

const TYPE_LABEL: Record<string, string> = {
  control: 'Contrôle',
  hybrid: 'Hybride',
  escort: 'Convoi',
  push: 'Push',
  flashpoint: 'Flashpoint',
};

function typeLabel(t: string | null | undefined) {
  if (!t) return '—';
  return TYPE_LABEL[t] || t;
}

export const getServerSideProps = withStaffPage('manager');

function AdminTournamentMapsPage(_: StaffProps) {
  const router = useRouter();
  const { id } = router.query;
  const tournamentId = Array.isArray(id) ? id[0] : id;

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [maps, setMaps] = useState<TournamentMapRow[]>([]);
  const [tournament, setTournament] = useState<TournamentMini | null>(null);

  // États pour l'ajout de map
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedOWMap, setSelectedOWMap] = useState('');
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

  useEffect(() => {
    if (!tournamentId) return;
    fetchMaps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId]);

  async function fetchMaps() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/tournament/${tournamentId}/maps`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Impossible de charger les maps');
      }
      const json: ApiResponse = await res.json();
      setMaps(json.maps || []);
      setTournament(json.tournament ?? null);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddMap() {
    if (!tournamentId) return;

    let mapName = '';
    let mapType = '';
    let imageUrl = '';

    if (useCustomMap) {
      if (!customMapName.trim()) {
        alert('Veuillez entrer un nom de map');
        return;
      }
      mapName = customMapName.trim();
      mapType = customMapType;
      imageUrl = customMapImage.trim();
    } else {
      if (!selectedOWMap) {
        alert('Veuillez sélectionner une map');
        return;
      }
      const selected = OVERWATCH_MAPS.find((m) => m.name === selectedOWMap);
      if (!selected) return;
      mapName = selected.name;
      mapType = selected.type;
      imageUrl = selected.image;
    }

    setAdding(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/tournament/${tournamentId}/maps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          map_name: mapName,
          map_type: mapType,
          image_url: imageUrl || null,
          enabled: true,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Erreur lors de l\'ajout');
      }

      // Réinitialiser le formulaire
      setShowAddForm(false);
      setSelectedOWMap('');
      setCustomMapName('');
      setCustomMapImage('');
      setUseCustomMap(false);

      // Recharger la liste
      await fetchMaps();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erreur lors de l\'ajout');
    } finally {
      setAdding(false);
    }
  }

  async function handleDeleteMap(mapId: string) {
    if (!tournamentId) return;
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette map ?')) return;

    setDeleting(mapId);
    setErrorMsg(null);

    try {
      const res = await fetch(
        `/api/tournament/${tournamentId}/maps?mapId=${mapId}`,
        { method: 'DELETE' }
      );

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Erreur lors de la suppression');
      }

      // Recharger la liste
      await fetchMaps();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erreur lors de la suppression');
    } finally {
      setDeleting(null);
    }
  }

  async function handleDeleteAllMaps() {
    if (!tournamentId) return;
    if (!confirm('Supprimer TOUTES les maps du pool ? Cette action est irréversible.')) return;

    setErrorMsg(null);

    try {
      const res = await fetch(`/api/tournament/${tournamentId}/maps`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Erreur lors de la suppression');
      }

      await fetchMaps();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erreur lors de la suppression');
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

      const res = await fetch(
        `/api/tournament/${tournamentId}/maps?mapId=${editingMap.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            map_name: editMapName,
            map_type: editMapType,
            image_url: imageUrl || null,
          }),
        }
      );

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Erreur lors de la mise à jour');
      }

      // Fermer le modal et recharger
      setEditingMap(null);
      await fetchMaps();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erreur lors de la mise à jour');
    } finally {
      setUpdating(false);
    }
  }

  async function handleAddAllMaps() {
    if (!tournamentId) return;
    if (!confirm('Ajouter toutes les maps OW manquantes au pool ?')) return;

    setAddingAll(true);
    setErrorMsg(null);

    try {
      // Maps déjà présentes
      const existingNames = new Set(maps.map((m) => m.map_name));
      const missing = OVERWATCH_MAPS.filter((m) => !existingNames.has(m.name));

      if (missing.length === 0) {
        alert('Toutes les maps sont déjà dans le pool.');
        setAddingAll(false);
        return;
      }

      // Construire la liste complète : existantes + manquantes
      const allMaps = [
        ...maps.map((m) => ({
          map_name: m.map_name,
          map_slug: m.map_slug,
          map_type: m.map_type,
          image_url: m.image_url,
          enabled: m.enabled,
          order_index: m.order_index,
        })),
        ...missing.map((m, idx) => ({
          map_name: m.name,
          map_slug: null,
          map_type: m.type,
          image_url: m.image,
          enabled: true,
          order_index: maps.length + idx,
        })),
      ];

      const res = await fetch(`/api/tournament/${tournamentId}/maps`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maps: allMaps }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Erreur lors de l'ajout groupé");
      }

      await fetchMaps();
    } catch (err: any) {
      setErrorMsg(err?.message || "Erreur lors de l'ajout groupé");
    } finally {
      setAddingAll(false);
    }
  }

  // Filtrer les maps OW déjà ajoutées
  const availableOWMaps = OVERWATCH_MAPS.filter(
    (owMap) => !maps.some((m) => m.map_name === owMap.name)
  );

  return (
    <>
      <Head>
        <title>Admin · Pool de maps</title>
      </Head>
      <div className="min-h-screen bg-neutral-950 text-white pt-24">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-purple-200/80">
                Admin · Pool de maps
              </p>
              <h1 className="text-2xl font-semibold">
                {tournament?.name || 'Tournoi'} · Maps
              </h1>
            </div>
            <div className="flex gap-2">
              <Link
                href={`/admin/tournament/${tournamentId}/map-draw`}
                className="px-3 py-1.5 rounded-lg bg-purple-600/80 border border-purple-500/30 text-sm hover:bg-purple-600"
              >
                Tirage de maps
              </Link>
              <Link
                href={`/admin/tournament/${tournamentId}/matches`}
                className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/15 text-sm hover:bg-white/15"
              >
                Voir les matchs
              </Link>
              <button
                onClick={() => fetchMaps()}
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm hover:bg-white/10"
              >
                Rafraîchir
              </button>
            </div>
          </div>

          {loading && (
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              Chargement…
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
                  {showAddForm ? '✕ Annuler' : '+ Ajouter une map'}
                </button>
                {availableOWMaps.length > 0 && (
                  <button
                    onClick={handleAddAllMaps}
                    disabled={addingAll}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors"
                  >
                    {addingAll
                      ? 'Ajout en cours…'
                      : `+ Ajouter toutes les maps (${availableOWMaps.length})`}
                  </button>
                )}
                {maps.length > 0 && (
                  <button
                    onClick={handleDeleteAllMaps}
                    className="px-4 py-2 rounded-lg bg-red-600/80 hover:bg-red-700 text-white font-medium text-sm transition-colors"
                  >
                    Supprimer toutes les maps
                  </button>
                )}
              </div>

              {/* Formulaire d'ajout */}
              {showAddForm && (
                <div className="mb-6 p-5 rounded-xl bg-white/5 border border-white/10">
                  <h3 className="text-lg font-semibold mb-4">
                    Ajouter une map
                  </h3>

                  {/* Toggle entre map OW et custom */}
                  <div className="flex gap-4 mb-4">
                    <button
                      onClick={() => setUseCustomMap(false)}
                      className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                        !useCustomMap
                          ? 'bg-purple-600 text-white'
                          : 'bg-white/5 text-gray-300 hover:bg-white/10'
                      }`}
                    >
                      Map Overwatch 2
                    </button>
                    <button
                      onClick={() => setUseCustomMap(true)}
                      className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                        useCustomMap
                          ? 'bg-purple-600 text-white'
                          : 'bg-white/5 text-gray-300 hover:bg-white/10'
                      }`}
                    >
                      Map personnalisée
                    </button>
                  </div>

                  {!useCustomMap ? (
                    // Sélection map OW
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm text-gray-300 mb-2">
                          Sélectionner une map Overwatch 2
                        </label>
                        <select
                          value={selectedOWMap}
                          onChange={(e) => setSelectedOWMap(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
                        >
                          <option value="">-- Choisir une map --</option>
                          {availableOWMaps.map((owMap) => (
                            <option key={owMap.name} value={owMap.name}>
                              {owMap.name} ({typeLabel(owMap.type)})
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
                          Nom de la map
                        </label>
                        <input
                          type="text"
                          value={customMapName}
                          onChange={(e) => setCustomMapName(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
                          placeholder="Ex: Custom Arena"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-300 mb-2">
                          Type de map
                        </label>
                        <select
                          value={customMapType}
                          onChange={(e) => setCustomMapType(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
                        >
                          <option value="control">Contrôle</option>
                          <option value="escort">Convoi</option>
                          <option value="hybrid">Hybride</option>
                          <option value="push">Push</option>
                          <option value="flashpoint">Flashpoint</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-300 mb-2">
                          URL de l'image (optionnel)
                        </label>
                        <input
                          type="text"
                          value={customMapImage}
                          onChange={(e) => setCustomMapImage(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
                          placeholder="https://exemple.com/image.jpg"
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
                      {adding ? 'Ajout en cours…' : 'Ajouter'}
                    </button>
                    <button
                      onClick={() => setShowAddForm(false)}
                      className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm transition-colors"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {!loading && !errorMsg && maps.length === 0 && (
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              Aucune map configurée pour ce tournoi.
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
                    {/* Image de la map */}
                    {m.image_url && (
                      <div className="relative w-full h-40 bg-gradient-to-b from-purple-900/20 to-transparent">
                        <img
                          src={m.image_url}
                          alt={m.map_name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                    )}

                    {/* Contenu */}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex-1">
                          <p className="text-sm font-semibold">{m.map_name}</p>
                          <p className="text-xs text-gray-400">
                            {typeLabel(m.map_type)}
                            {m.map_slug ? ` • ${m.map_slug}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleEditClick(m)}
                            className="px-2 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 text-blue-200 text-xs transition-colors flex-shrink-0"
                            title="Éditer"
                          >
                            ✎
                          </button>
                          <button
                            onClick={() => handleDeleteMap(m.id)}
                            disabled={deleting === m.id}
                            className="px-2 py-1 rounded-lg bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 text-red-200 text-xs transition-colors disabled:opacity-50 flex-shrink-0"
                            title="Supprimer"
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
                          {m.enabled ? 'Activée' : 'Désactivée'}
                        </span>
                        <span className="text-xs text-gray-400">
                          Ordre : {m.order_index ?? '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* Modal d'édition */}
          {editingMap && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-neutral-900 rounded-xl border border-white/10 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <div className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl font-semibold">Éditer la map</h2>
                    <button
                      onClick={() => setEditingMap(null)}
                      className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm transition-colors"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="space-y-4">
                    {/* Nom de la map */}
                    <div>
                      <label className="block text-sm text-gray-300 mb-2">
                        Nom de la map
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
                        Type de map
                      </label>
                      <select
                        value={editMapType}
                        onChange={(e) => setEditMapType(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
                      >
                        <option value="control">Contrôle</option>
                        <option value="escort">Convoi</option>
                        <option value="hybrid">Hybride</option>
                        <option value="push">Push</option>
                      </select>
                    </div>

                    {/* Preview de l'image actuelle */}
                    {editImagePreview && (
                      <div>
                        <label className="block text-sm text-gray-300 mb-2">
                          Aperçu de l'image
                        </label>
                        <div className="relative w-full h-48 rounded-lg overflow-hidden bg-gradient-to-b from-purple-900/20 to-transparent">
                          <img
                            src={editImagePreview}
                            alt="Preview"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      </div>
                    )}

                    {/* Upload d'image */}
                    <div>
                      <label className="block text-sm text-gray-300 mb-2">
                        Changer l'image
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageFileChange}
                        className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-purple-600 file:text-white file:cursor-pointer hover:file:bg-purple-700"
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        Format accepté : JPG, PNG, WebP (max 5 MB)
                      </p>
                    </div>

                    {/* URL alternative */}
                    <div>
                      <label className="block text-sm text-gray-300 mb-2">
                        Ou entrer une URL d'image
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
                        placeholder="https://exemple.com/image.jpg"
                      />
                    </div>
                  </div>

                  {/* Boutons */}
                  <div className="mt-6 flex gap-2">
                    <button
                      onClick={handleUpdateMap}
                      disabled={updating}
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors"
                    >
                      {updating ? 'Mise à jour…' : 'Enregistrer'}
                    </button>
                    <button
                      onClick={() => setEditingMap(null)}
                      className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm transition-colors"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default AdminTournamentMapsPage;
