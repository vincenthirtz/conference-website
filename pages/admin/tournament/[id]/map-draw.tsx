// pages/admin/tournament/[id]/map-draw.tsx
// Tirage de maps pour BO3/BO5 — random ou manuel — avec export PDF

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';

type StaffShape = { id: string; role: string; display_name: string | null };
type StaffProps = { staff: StaffShape };

type TournamentMini = { id: string; name: string | null; slug: string | null };

type TournamentMapRow = {
  id: string;
  tournament_id: string;
  map_name: string;
  map_slug: string | null;
  map_type: string | null;
  image_url: string | null;
  enabled: boolean;
  order_index: number | null;
};

type BoFormat = 'bo3' | 'bo5';

const TYPE_LABEL: Record<string, string> = {
  control: 'Contrôle',
  hybrid: 'Hybride',
  escort: 'Convoi',
  push: 'Push',
};

function typeLabel(t: string | null | undefined) {
  if (!t) return '—';
  return TYPE_LABEL[t] || t;
}

function typeBadgeColor(t: string | null | undefined): string {
  switch (t) {
    case 'control': return 'border-blue-400/50 text-blue-200 bg-blue-600/20';
    case 'escort': return 'border-amber-400/50 text-amber-200 bg-amber-600/20';
    case 'hybrid': return 'border-emerald-400/50 text-emerald-200 bg-emerald-600/20';
    case 'push': return 'border-pink-400/50 text-pink-200 bg-pink-600/20';
    default: return 'border-gray-400/50 text-gray-200 bg-gray-600/20';
  }
}

/** Fisher-Yates shuffle */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const getServerSideProps = withStaffPage('manager');

function AdminMapDrawPage(_: StaffProps) {
  const router = useRouter();
  const { id } = router.query;
  const tournamentId = Array.isArray(id) ? id[0] : id;

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [maps, setMaps] = useState<TournamentMapRow[]>([]);
  const [tournament, setTournament] = useState<TournamentMini | null>(null);

  const [format, setFormat] = useState<BoFormat>('bo3');
  const [selectedMaps, setSelectedMaps] = useState<(TournamentMapRow | null)[]>([null, null, null]);
  const [matchLabel, setMatchLabel] = useState('');

  const mapCount = format === 'bo3' ? 3 : 5;

  useEffect(() => {
    if (!tournamentId) return;
    fetchMaps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId]);

  // Reset slots when format changes
  useEffect(() => {
    setSelectedMaps(Array(mapCount).fill(null));
  }, [mapCount]);

  async function fetchMaps() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/tournament/${tournamentId}/maps`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Impossible de charger les maps');
      }
      const json = await res.json();
      const enabledMaps = (json.maps || []).filter((m: TournamentMapRow) => m.enabled);
      setMaps(enabledMaps);
      setTournament(json.tournament ?? null);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }

  /** Random draw — tries to avoid repeating map types when possible */
  function handleRandomDraw() {
    if (maps.length < mapCount) {
      setErrorMsg(`Il faut au moins ${mapCount} maps activées dans le pool pour un ${format.toUpperCase()}.`);
      return;
    }

    // Group maps by type
    const byType: Record<string, TournamentMapRow[]> = {};
    for (const m of maps) {
      const t = m.map_type || 'other';
      (byType[t] ??= []).push(m);
    }

    const types = Object.keys(byType);
    const drawn: TournamentMapRow[] = [];
    const usedIds = new Set<string>();

    // Try to pick one from each type first for variety
    const shuffledTypes = shuffle(types);
    for (const t of shuffledTypes) {
      if (drawn.length >= mapCount) break;
      const candidates = byType[t].filter((m) => !usedIds.has(m.id));
      if (candidates.length > 0) {
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        drawn.push(pick);
        usedIds.add(pick.id);
      }
    }

    // Fill remaining slots randomly from unused maps
    if (drawn.length < mapCount) {
      const remaining = shuffle(maps.filter((m) => !usedIds.has(m.id)));
      for (const m of remaining) {
        if (drawn.length >= mapCount) break;
        drawn.push(m);
      }
    }

    // Final shuffle so the type order isn't predictable
    setSelectedMaps(shuffle(drawn));
    setErrorMsg(null);
  }

  function handleSetSlot(slotIndex: number, mapId: string | '') {
    const next = [...selectedMaps];
    if (mapId === '') {
      next[slotIndex] = null;
    } else {
      const map = maps.find((m) => m.id === mapId) ?? null;
      next[slotIndex] = map;
    }
    setSelectedMaps(next);
  }

  function handleClearAll() {
    setSelectedMaps(Array(mapCount).fill(null));
  }

  // Maps already used in another slot
  function usedMapIds(excludeSlot: number): Set<string> {
    const ids = new Set<string>();
    selectedMaps.forEach((m, i) => {
      if (m && i !== excludeSlot) ids.add(m.id);
    });
    return ids;
  }

  const allSlotsFilled = selectedMaps.every((m) => m !== null);

  /** Generate printable PDF */
  const handleExportPDF = useCallback(() => {
    const filledMaps = selectedMaps.filter((m): m is TournamentMapRow => m !== null);
    if (filledMaps.length === 0) return;

    const title = matchLabel.trim()
      ? `${tournament?.name ?? 'Tournoi'} — ${matchLabel.trim()}`
      : `${tournament?.name ?? 'Tournoi'} — Tirage ${format.toUpperCase()}`;

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<title>${title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 32px; color: #1a1a1a; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .subtitle { color: #666; font-size: 13px; margin-bottom: 28px; }
  .maps-grid { display: flex; gap: 16px; flex-wrap: wrap; justify-content: center; }
  .map-card {
    width: 220px;
    border: 2px solid #e5e7eb;
    border-radius: 12px;
    overflow: hidden;
    background: #fafafa;
    page-break-inside: avoid;
  }
  .map-number {
    background: #7c3aed;
    color: white;
    text-align: center;
    font-weight: 700;
    font-size: 14px;
    padding: 6px 0;
    letter-spacing: 1px;
  }
  .map-image {
    width: 100%;
    height: 130px;
    object-fit: cover;
    display: block;
    background: #e5e7eb;
  }
  .map-image-placeholder {
    width: 100%;
    height: 130px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #ede9fe, #e0e7ff);
    color: #7c3aed;
    font-size: 40px;
  }
  .map-info {
    padding: 12px;
    text-align: center;
  }
  .map-name {
    font-size: 15px;
    font-weight: 700;
    margin-bottom: 4px;
  }
  .map-type {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 600;
    background: #f3f0ff;
    color: #7c3aed;
  }
  .meta { font-size: 10px; color: #999; text-align: center; margin-top: 32px; }
  @media print {
    body { padding: 20px; }
    .maps-grid { gap: 12px; }
  }
</style>
</head>
<body>
<h1>${title}</h1>
<p class="subtitle">${format.toUpperCase()} · ${filledMaps.length} maps · ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>

<div class="maps-grid">
${filledMaps.map((m, i) => `
  <div class="map-card">
    <div class="map-number">MAP ${i + 1}</div>
    ${m.image_url
      ? `<img class="map-image" src="${m.image_url}" alt="${m.map_name}" />`
      : `<div class="map-image-placeholder">&#x1f5fa;</div>`}
    <div class="map-info">
      <div class="map-name">${m.map_name}</div>
      <span class="map-type">${typeLabel(m.map_type)}</span>
    </div>
  </div>
`).join('')}
</div>

<p class="meta">${tournament?.name ?? 'Tournoi'} · Tirage de maps</p>
</body></html>`;

    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.onload = () => {
      setTimeout(() => w.print(), 300);
    };
  }, [selectedMaps, tournament, format, matchLabel]);

  return (
    <>
      <Head>
        <title>Admin · Tirage de maps</title>
      </Head>
      <div className="min-h-screen bg-neutral-950 text-white pt-24">
        <div className="max-w-6xl mx-auto px-6 py-10">
          {/* Header */}
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-purple-200/80">
                Admin · Tirage de maps
              </p>
              <h1 className="text-2xl font-semibold">
                {tournament?.name || 'Tournoi'} · Tirage de maps
              </h1>
            </div>
            <div className="flex gap-2">
              <Link
                href={`/admin/tournament/${tournamentId}/veto`}
                className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/15 text-sm hover:bg-white/15"
              >
                Pick / Ban
              </Link>
              <Link
                href={`/admin/tournament/${tournamentId}/maps`}
                className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/15 text-sm hover:bg-white/15"
              >
                Pool de maps
              </Link>
              <Link
                href={`/admin/tournament/${tournamentId}/matches`}
                className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/15 text-sm hover:bg-white/15"
              >
                Matchs
              </Link>
            </div>
          </div>

          {loading && (
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              Chargement…
            </div>
          )}

          {errorMsg && (
            <div className="mb-4 p-4 rounded-lg bg-red-900/60 border border-red-500/40 text-red-100">
              {errorMsg}
            </div>
          )}

          {!loading && maps.length === 0 && !errorMsg && (
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              Aucune map activée dans le pool.{' '}
              <Link
                href={`/admin/tournament/${tournamentId}/maps`}
                className="text-purple-300 underline"
              >
                Configurer le pool de maps
              </Link>
            </div>
          )}

          {!loading && maps.length > 0 && (
            <>
              {/* Controls */}
              <div className="mb-6 p-5 rounded-xl bg-white/5 border border-white/10 space-y-4">
                {/* Format selector */}
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-300 font-medium">Format :</span>
                  <div className="flex gap-2">
                    {(['bo3', 'bo5'] as BoFormat[]).map((f) => (
                      <button
                        key={f}
                        onClick={() => setFormat(f)}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                          format === f
                            ? 'bg-purple-600 text-white'
                            : 'bg-white/5 text-gray-300 hover:bg-white/10'
                        }`}
                      >
                        {f.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-gray-500">
                    ({mapCount} maps · {maps.length} disponibles)
                  </span>
                </div>

                {/* Match label */}
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-300 font-medium whitespace-nowrap">
                    Libellé du match :
                  </label>
                  <input
                    type="text"
                    value={matchLabel}
                    onChange={(e) => setMatchLabel(e.target.value)}
                    className="flex-1 max-w-md px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm"
                    placeholder="Ex: Demi-finale — Équipe A vs Équipe B"
                  />
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={handleRandomDraw}
                    disabled={maps.length < mapCount}
                    className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium text-sm transition-colors"
                  >
                    Tirage aléatoire
                  </button>
                  <button
                    onClick={handleClearAll}
                    className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm transition-colors"
                  >
                    Réinitialiser
                  </button>
                  {allSlotsFilled && (
                    <button
                      onClick={handleExportPDF}
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm transition-colors"
                    >
                      Exporter en PDF
                    </button>
                  )}
                </div>
              </div>

              {/* Map slots */}
              <div className="mb-8">
                <h2 className="text-lg font-semibold mb-4">
                  Maps sélectionnées
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                  {selectedMaps.map((slot, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-white/10 overflow-hidden bg-white/5"
                    >
                      {/* Slot header */}
                      <div className="bg-purple-600/30 border-b border-purple-500/30 px-3 py-2 text-center">
                        <span className="text-xs font-bold uppercase tracking-wider text-purple-200">
                          Map {i + 1}
                        </span>
                      </div>

                      {/* Map image or placeholder */}
                      {slot?.image_url ? (
                        <div className="relative w-full h-32 bg-gradient-to-b from-purple-900/20 to-transparent">
                          <img
                            src={slot.image_url}
                            alt={slot.map_name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        </div>
                      ) : (
                        <div className="w-full h-32 flex items-center justify-center bg-gradient-to-b from-purple-900/10 to-transparent text-gray-500 text-3xl">
                          {slot ? '🗺' : '?'}
                        </div>
                      )}

                      {/* Map info */}
                      <div className="p-3">
                        {slot ? (
                          <div className="text-center mb-2">
                            <p className="text-sm font-semibold">{slot.map_name}</p>
                            <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs border ${typeBadgeColor(slot.map_type)}`}>
                              {typeLabel(slot.map_type)}
                            </span>
                          </div>
                        ) : (
                          <p className="text-center text-xs text-gray-500 mb-2">
                            Aucune map
                          </p>
                        )}

                        {/* Manual selector */}
                        <select
                          value={slot?.id ?? ''}
                          onChange={(e) => handleSetSlot(i, e.target.value)}
                          className="w-full px-2 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-xs"
                        >
                          <option value="">— Choisir —</option>
                          {maps
                            .filter((m) => !usedMapIds(i).has(m.id))
                            .sort((a, b) => a.map_name.localeCompare(b.map_name))
                            .map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.map_name} ({typeLabel(m.map_type)})
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pool overview */}
              <div>
                <h2 className="text-lg font-semibold mb-4">
                  Pool de maps ({maps.length})
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {maps
                    .sort((a, b) =>
                      (a.order_index ?? 0) - (b.order_index ?? 0) ||
                      a.map_name.localeCompare(b.map_name)
                    )
                    .map((m) => {
                      const isUsed = selectedMaps.some((s) => s?.id === m.id);
                      return (
                        <div
                          key={m.id}
                          className={`rounded-lg border overflow-hidden transition-opacity ${
                            isUsed
                              ? 'border-purple-500/50 opacity-50'
                              : 'border-white/10 opacity-100'
                          }`}
                        >
                          {m.image_url && (
                            <div className="w-full h-20 bg-gradient-to-b from-purple-900/20 to-transparent">
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
                          <div className="p-2">
                            <p className="text-xs font-semibold truncate">{m.map_name}</p>
                            <p className="text-[10px] text-gray-400">{typeLabel(m.map_type)}</p>
                            {isUsed && (
                              <p className="text-[10px] text-purple-300 font-medium mt-0.5">
                                Sélectionnée
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default AdminMapDrawPage;
