// pages/admin/tournament/[id]/map-draw.tsx
// Tirage de maps pour BO3/BO5 — 3 choix par match (même catégorie) — avec export PDF

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

const CHOICES_PER_SLOT = 3;

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

function typeBadgeColor(t: string | null | undefined): string {
  switch (t) {
    case 'control': return 'border-blue-400/50 text-blue-200 bg-blue-600/20';
    case 'escort': return 'border-amber-400/50 text-amber-200 bg-amber-600/20';
    case 'hybrid': return 'border-emerald-400/50 text-emerald-200 bg-emerald-600/20';
    case 'push': return 'border-pink-400/50 text-pink-200 bg-pink-600/20';
    case 'flashpoint': return 'border-orange-400/50 text-orange-200 bg-orange-600/20';
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

function makeEmptySlots(count: number): (TournamentMapRow | null)[][] {
  return Array.from({ length: count }, () => Array<TournamentMapRow | null>(CHOICES_PER_SLOT).fill(null));
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
  // Each slot = array of 3 map choices (same category)
  const [selectedSlots, setSelectedSlots] = useState<(TournamentMapRow | null)[][]>(makeEmptySlots(3));
  const [matchLabel, setMatchLabel] = useState('');

  const slotCount = format === 'bo3' ? 3 : 5;
  const totalMapsNeeded = slotCount * CHOICES_PER_SLOT;

  useEffect(() => {
    if (!tournamentId) return;
    fetchMaps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId]);

  // Reset slots when format changes
  useEffect(() => {
    setSelectedSlots(makeEmptySlots(slotCount));
  }, [slotCount]);

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

  /** Random draw — picks 3 maps of the same category per slot, different category per slot */
  function handleRandomDraw() {
    if (maps.length < totalMapsNeeded) {
      setErrorMsg(`Il faut au moins ${totalMapsNeeded} maps activées dans le pool pour un ${format.toUpperCase()} (${CHOICES_PER_SLOT} choix × ${slotCount} matchs).`);
      return;
    }

    // Group maps by type
    const byType: Record<string, TournamentMapRow[]> = {};
    for (const m of maps) {
      const t = m.map_type || 'other';
      (byType[t] ??= []).push(m);
    }

    // Shuffle maps within each type
    for (const t of Object.keys(byType)) {
      byType[t] = shuffle(byType[t]);
    }

    // Find types with at least CHOICES_PER_SLOT maps
    const eligibleTypes = Object.keys(byType).filter((t) => byType[t].length >= CHOICES_PER_SLOT);

    const result: (TournamentMapRow | null)[][] = [];
    const usedIds = new Set<string>();

    // Try to assign one distinct category per slot
    const shuffledTypes = shuffle(eligibleTypes);
    for (let s = 0; s < slotCount; s++) {
      let assigned = false;

      // Try to find an eligible type with enough unused maps
      for (const t of shuffledTypes) {
        const available = byType[t].filter((m) => !usedIds.has(m.id));
        if (available.length >= CHOICES_PER_SLOT) {
          const picks = available.slice(0, CHOICES_PER_SLOT);
          result.push(picks);
          picks.forEach((p) => usedIds.add(p.id));
          assigned = true;
          break;
        }
      }

      if (!assigned) {
        // Fallback: pick any CHOICES_PER_SLOT maps from any type that has enough remaining
        for (const t of Object.keys(byType)) {
          const available = byType[t].filter((m) => !usedIds.has(m.id));
          if (available.length >= CHOICES_PER_SLOT) {
            const picks = available.slice(0, CHOICES_PER_SLOT);
            result.push(picks);
            picks.forEach((p) => usedIds.add(p.id));
            assigned = true;
            break;
          }
        }
      }

      if (!assigned) {
        // Last resort: pick any remaining maps regardless of type
        const remaining = maps.filter((m) => !usedIds.has(m.id));
        const picks = remaining.slice(0, CHOICES_PER_SLOT);
        while (picks.length < CHOICES_PER_SLOT) picks.push(null as unknown as TournamentMapRow);
        result.push(picks);
        picks.filter(Boolean).forEach((p) => usedIds.add(p.id));
      }
    }

    // Shuffle slot order
    setSelectedSlots(shuffle(result));
    setErrorMsg(null);
  }

  function handleSetChoice(slotIndex: number, choiceIndex: number, mapId: string | '') {
    const next = selectedSlots.map((slot) => [...slot]);
    if (mapId === '') {
      next[slotIndex][choiceIndex] = null;
    } else {
      const map = maps.find((m) => m.id === mapId) ?? null;
      next[slotIndex][choiceIndex] = map;
    }
    setSelectedSlots(next);
  }

  function handleClearAll() {
    setSelectedSlots(makeEmptySlots(slotCount));
  }

  // All map IDs used across all slots, excluding a specific (slot, choice) position
  function usedMapIds(excludeSlot: number, excludeChoice: number): Set<string> {
    const ids = new Set<string>();
    selectedSlots.forEach((slot, si) => {
      slot.forEach((m, ci) => {
        if (m && !(si === excludeSlot && ci === excludeChoice)) ids.add(m.id);
      });
    });
    return ids;
  }

  // All map IDs used anywhere (for pool highlight)
  function allUsedMapIds(): Set<string> {
    const ids = new Set<string>();
    selectedSlots.forEach((slot) => {
      slot.forEach((m) => { if (m) ids.add(m.id); });
    });
    return ids;
  }

  const allSlotsFilled = selectedSlots.every((slot) => slot.every((m) => m !== null));

  // Determine the category of a slot (from the first non-null map)
  function slotCategory(slotIndex: number): string | null {
    for (const m of selectedSlots[slotIndex]) {
      if (m?.map_type) return m.map_type;
    }
    return null;
  }

  /** Generate printable PDF */
  const handleExportPDF = useCallback(() => {
    const hasAny = selectedSlots.some((slot) => slot.some((m) => m !== null));
    if (!hasAny) return;

    const totalFilled = selectedSlots.flat().filter(Boolean).length;
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
  .slots { display: flex; gap: 24px; flex-wrap: wrap; justify-content: center; }
  .slot { page-break-inside: avoid; }
  .slot-title {
    background: #7c3aed;
    color: white;
    text-align: center;
    font-weight: 700;
    font-size: 14px;
    padding: 8px 16px;
    border-radius: 10px 10px 0 0;
    letter-spacing: 1px;
  }
  .slot-body {
    border: 2px solid #e5e7eb;
    border-top: none;
    border-radius: 0 0 10px 10px;
    padding: 12px;
    background: #fafafa;
  }
  .choice { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
  .choice:last-child { border-bottom: none; }
  .choice-img { width: 80px; height: 45px; object-fit: cover; border-radius: 6px; background: #e5e7eb; flex-shrink: 0; }
  .choice-info { flex: 1; }
  .choice-name { font-size: 13px; font-weight: 700; }
  .choice-type { font-size: 10px; color: #7c3aed; font-weight: 600; }
  .meta { font-size: 10px; color: #999; text-align: center; margin-top: 32px; }
  @media print {
    body { padding: 20px; }
    .slots { gap: 16px; }
  }
</style>
</head>
<body>
<h1>${title}</h1>
<p class="subtitle">${format.toUpperCase()} · ${totalFilled} maps · ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>

<div class="slots">
${selectedSlots.map((slot, si) => `
  <div class="slot">
    <div class="slot-title">MAP ${si + 1}</div>
    <div class="slot-body">
      ${slot.filter(Boolean).map((m) => `
        <div class="choice">
          ${m!.image_url ? `<img class="choice-img" src="${m!.image_url}" alt="${m!.map_name}" />` : ''}
          <div class="choice-info">
            <div class="choice-name">${m!.map_name}</div>
            <div class="choice-type">${typeLabel(m!.map_type)}</div>
          </div>
        </div>
      `).join('')}
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
  }, [selectedSlots, tournament, format, matchLabel]);

  return (
    <>
      <Head>
        <title>Admin · Tirage de maps</title>
      </Head>
      <div className="min-h-screen bg-neutral-950 text-white pt-24">
        <div className="max-w-7xl mx-auto px-6 py-10">
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
                    ({CHOICES_PER_SLOT} choix × {slotCount} matchs = {totalMapsNeeded} maps · {maps.length} disponibles)
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
                    disabled={maps.length < totalMapsNeeded}
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

              {/* Map slots — 3 or 5 columns, each with 3 choices */}
              <div className="mb-8">
                <h2 className="text-lg font-semibold mb-4">
                  Maps sélectionnées
                  <span className="text-sm font-normal text-gray-400 ml-2">
                    ({CHOICES_PER_SLOT} choix par match)
                  </span>
                </h2>
                <div className={`grid grid-cols-1 gap-4 ${slotCount === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-3 lg:grid-cols-5'}`}>
                  {selectedSlots.map((slot, si) => {
                    const cat = slotCategory(si);
                    return (
                      <div
                        key={si}
                        className="rounded-xl border border-white/10 overflow-hidden bg-white/5"
                      >
                        {/* Slot header */}
                        <div className="bg-purple-600/30 border-b border-purple-500/30 px-3 py-2 text-center">
                          <span className="text-xs font-bold uppercase tracking-wider text-purple-200">
                            Map {si + 1}
                          </span>
                          {cat && (
                            <span className={`ml-2 inline-block px-2 py-0.5 rounded-full text-[10px] border ${typeBadgeColor(cat)}`}>
                              {typeLabel(cat)}
                            </span>
                          )}
                        </div>

                        {/* 3 choices */}
                        <div className="divide-y divide-white/5">
                          {slot.map((choice, ci) => (
                            <div key={ci} className="p-3">
                              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">
                                Choix {ci + 1}
                              </p>

                              {/* Map image or placeholder */}
                              {choice?.image_url ? (
                                <div className="relative w-full h-20 rounded-lg overflow-hidden mb-2 bg-gradient-to-b from-purple-900/20 to-transparent">
                                  <img
                                    src={choice.image_url}
                                    alt={choice.map_name}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).style.display = 'none';
                                    }}
                                  />
                                </div>
                              ) : (
                                <div className="w-full h-20 rounded-lg flex items-center justify-center bg-gradient-to-b from-purple-900/10 to-transparent text-gray-600 text-xl mb-2">
                                  {choice ? '🗺' : '?'}
                                </div>
                              )}

                              {choice && (
                                <div className="text-center mb-1.5">
                                  <p className="text-xs font-semibold">{choice.map_name}</p>
                                  <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] border ${typeBadgeColor(choice.map_type)}`}>
                                    {typeLabel(choice.map_type)}
                                  </span>
                                </div>
                              )}

                              {/* Manual selector */}
                              <select
                                value={choice?.id ?? ''}
                                onChange={(e) => handleSetChoice(si, ci, e.target.value)}
                                className="w-full px-2 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-xs"
                              >
                                <option value="">— Choisir —</option>
                                {maps
                                  .filter((m) => !usedMapIds(si, ci).has(m.id))
                                  .sort((a, b) => a.map_name.localeCompare(b.map_name))
                                  .map((m) => (
                                    <option key={m.id} value={m.id}>
                                      {m.map_name} ({typeLabel(m.map_type)})
                                    </option>
                                  ))}
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
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
                      const isUsed = allUsedMapIds().has(m.id);
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
