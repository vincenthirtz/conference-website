// pages/admin/tournament/[id]/bulk-ops.tsx
// Page d'operations en masse au niveau tournoi :
// - Decaler tout un round (offset en minutes)
// - Reassigner des matchs vers un autre stage

import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import Breadcrumb from '@/components/admin/Breadcrumb';
import type { StaffProps, StageSummary, TournamentMini } from '@/types/admin';

export const getServerSideProps = withStaffPage('manager');

type RoundOption = { stageId: string; roundNumber: number; matchCount: number };

function BulkOpsPage(_: StaffProps) {
  const router = useRouter();
  const { id } = router.query;
  const tournamentId = Array.isArray(id) ? id[0] : id;
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [tournament, setTournament] = useState<TournamentMini | null>(null);
  const [stages, setStages] = useState<StageSummary[]>([]);
  const [roundOptions, setRoundOptions] = useState<RoundOption[]>([]);

  // Shift round form
  const [shiftStageId, setShiftStageId] = useState('');
  const [shiftRoundNumber, setShiftRoundNumber] = useState('');
  const [shiftOffset, setShiftOffset] = useState('60');
  const [shiftBusy, setShiftBusy] = useState(false);

  // Reassign form
  const [reassignSourceStageId, setReassignSourceStageId] = useState('');
  const [reassignTargetStageId, setReassignTargetStageId] = useState('');
  const [reassignMatches, setReassignMatches] = useState<
    {
      id: string;
      round_name: string | null;
      round_number: number | null;
      status: string;
    }[]
  >([]);
  const [reassignSelected, setReassignSelected] = useState<Set<string>>(
    new Set()
  );
  const [reassignBusy, setReassignBusy] = useState(false);

  const loadStages = useCallback(async () => {
    if (!tournamentId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(
        `/api/admin/tournament/${tournamentId}/matches?limit=1000`
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Erreur chargement');
      }
      const json = await res.json();
      setTournament(json.tournament || null);
      setStages(json.stages || []);

      // Compute round options from matches
      const buckets = new Map<string, RoundOption>();
      for (const m of json.matches || []) {
        if (!m.stage_id || m.round_number === null) continue;
        const key = `${m.stage_id}:${m.round_number}`;
        const cur = buckets.get(key);
        if (cur) cur.matchCount += 1;
        else
          buckets.set(key, {
            stageId: m.stage_id,
            roundNumber: m.round_number,
            matchCount: 1,
          });
      }
      setRoundOptions(
        Array.from(buckets.values()).sort((a, b) => {
          if (a.stageId !== b.stageId)
            return a.stageId.localeCompare(b.stageId);
          return a.roundNumber - b.roundNumber;
        })
      );
    } catch (err: unknown) {
      setErrorMsg((err as Error).message || 'Erreur');
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    if (tournamentId) loadStages();
  }, [tournamentId, loadStages]);

  // Load matches of source stage for reassign form
  useEffect(() => {
    if (!reassignSourceStageId || !tournamentId) {
      setReassignMatches([]);
      setReassignSelected(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/tournament/${tournamentId}/matches?stageId=${reassignSourceStageId}&limit=500`
        );
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        const list = (json.matches || []).map((m: any) => ({
          id: m.id,
          round_name: m.round_name,
          round_number: m.round_number,
          status: m.status,
        }));
        setReassignMatches(list);
        setReassignSelected(new Set());
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reassignSourceStageId, tournamentId]);

  async function submitShift() {
    if (!tournamentId) return;
    if (!shiftStageId || !shiftRoundNumber) {
      addToast('Sélectionne un round', 'error');
      return;
    }
    const offset = Number(shiftOffset);
    if (!Number.isFinite(offset) || offset === 0) {
      addToast('Offset invalide (entier ≠ 0)', 'error');
      return;
    }
    if (
      !confirm(
        `Décaler ce round de ${offset > 0 ? '+' : ''}${offset} minutes ? Les matchs sans horaire seront ignorés.`
      )
    )
      return;
    setShiftBusy(true);
    try {
      const res = await fetch(
        `/api/admin/tournament/${tournamentId}/bulk-matches`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'shift_round',
            stageId: shiftStageId,
            roundNumber: Number(shiftRoundNumber),
            offsetMinutes: offset,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur');
      addToast(
        `${json.shifted} match(s) décalés (${json.ignored} ignorés)`,
        'success'
      );
      await loadStages();
    } catch (e: unknown) {
      addToast((e as Error).message || 'Erreur', 'error');
    } finally {
      setShiftBusy(false);
    }
  }

  async function submitReassign() {
    if (!tournamentId) return;
    if (!reassignTargetStageId) {
      addToast('Sélectionne une phase cible', 'error');
      return;
    }
    if (reassignSelected.size === 0) {
      addToast('Sélectionne au moins un match', 'error');
      return;
    }
    if (reassignSourceStageId === reassignTargetStageId) {
      addToast('La phase source et cible doivent être différentes', 'error');
      return;
    }
    if (
      !confirm(
        `Déplacer ${reassignSelected.size} match(s) vers la phase cible ? Le group_key sera réinitialisé.`
      )
    )
      return;
    setReassignBusy(true);
    try {
      const res = await fetch(
        `/api/admin/tournament/${tournamentId}/bulk-matches`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'reassign_stage',
            matchIds: Array.from(reassignSelected),
            targetStageId: reassignTargetStageId,
          }),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur');
      const skippedReasons = (json.skipped || [])
        .map((s: any) => `${s.matchId.slice(0, 6)}: ${s.reason}`)
        .join(', ');
      addToast(
        `${json.moved.length} match(s) déplacés${
          skippedReasons ? `. Ignorés: ${skippedReasons}` : ''
        }`,
        json.moved.length > 0 ? 'success' : 'error'
      );
      // Refresh
      setReassignSelected(new Set());
      const refreshed = await fetch(
        `/api/admin/tournament/${tournamentId}/matches?stageId=${reassignSourceStageId}&limit=500`
      );
      if (refreshed.ok) {
        const j = await refreshed.json();
        setReassignMatches(
          (j.matches || []).map((m: any) => ({
            id: m.id,
            round_name: m.round_name,
            round_number: m.round_number,
            status: m.status,
          }))
        );
      }
    } catch (e: unknown) {
      addToast((e as Error).message || 'Erreur', 'error');
    } finally {
      setReassignBusy(false);
    }
  }

  function toggleMatch(matchId: string) {
    setReassignSelected((prev) => {
      const next = new Set(prev);
      if (next.has(matchId)) next.delete(matchId);
      else next.add(matchId);
      return next;
    });
  }

  function selectAllVisible() {
    setReassignSelected(new Set(reassignMatches.map((m) => m.id)));
  }

  function selectNone() {
    setReassignSelected(new Set());
  }

  const stageById = new Map(stages.map((s) => [s.id, s]));

  return (
    <>
      <Head>
        <title>Admin · Opérations groupées</title>
      </Head>
      <div className="min-h-screen bg-neutral-950 text-white pt-24">
        <div className="max-w-5xl mx-auto px-6 py-10">
          <Breadcrumb
            items={[
              { label: 'Tournois', href: '/admin/tournaments' },
              {
                label: tournament?.name || 'Tournoi',
                href: `/admin/tournament/${tournamentId}`,
              },
              { label: 'Opérations groupées' },
            ]}
          />

          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-purple-200/80">
                Admin · Bulk
              </p>
              <h1 className="text-2xl font-semibold">Opérations groupées</h1>
              <p className="text-sm text-gray-400 mt-1">
                Décale un round entier ou déplace des matchs entre phases.
              </p>
            </div>
            <Link
              href={`/admin/tournament/${tournamentId}/matches`}
              className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/15 text-sm hover:bg-white/15"
            >
              ← Liste des matchs
            </Link>
          </div>

          {loading && (
            <div className="p-4 rounded-lg bg-white/5 border border-white/10">
              Chargement…
            </div>
          )}

          {errorMsg && !loading && (
            <div className="p-4 rounded-lg bg-red-900/60 border border-red-500/40 text-red-100 mb-6">
              {errorMsg}
            </div>
          )}

          {!loading && !errorMsg && (
            <div className="space-y-8">
              {/* Shift round */}
              <section className="bg-neutral-800/50 border border-neutral-700/50 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-1">Décaler un round</h2>
                <p className="text-xs text-neutral-400 mb-4">
                  Applique un offset (en minutes) à tous les matchs planifiés du
                  round sélectionné. Les matchs sans horaire ou annulés sont
                  ignorés.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-neutral-400 mb-1">
                      Phase
                    </label>
                    <select
                      className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-sm"
                      value={shiftStageId}
                      onChange={(e) => {
                        setShiftStageId(e.target.value);
                        setShiftRoundNumber('');
                      }}
                    >
                      <option value="">— Sélectionner —</option>
                      {stages.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-400 mb-1">
                      Round
                    </label>
                    <select
                      className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-sm"
                      value={shiftRoundNumber}
                      onChange={(e) => setShiftRoundNumber(e.target.value)}
                      disabled={!shiftStageId}
                    >
                      <option value="">— Sélectionner —</option>
                      {roundOptions
                        .filter((r) => r.stageId === shiftStageId)
                        .map((r) => (
                          <option key={r.roundNumber} value={r.roundNumber}>
                            Round {r.roundNumber} ({r.matchCount} match)
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-400 mb-1">
                      Offset en minutes (négatif = avancer)
                    </label>
                    <input
                      type="number"
                      step="15"
                      className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-sm"
                      value={shiftOffset}
                      onChange={(e) => setShiftOffset(e.target.value)}
                    />
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={submitShift}
                    disabled={shiftBusy || !shiftStageId || !shiftRoundNumber}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-medium disabled:opacity-50"
                  >
                    {shiftBusy ? 'Décalage…' : 'Appliquer le décalage'}
                  </button>
                </div>
              </section>

              {/* Reassign stage */}
              <section className="bg-neutral-800/50 border border-neutral-700/50 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-1">
                  Réassigner des matchs vers une autre phase
                </h2>
                <p className="text-xs text-neutral-400 mb-4">
                  Les matchs avec liens bracket actifs ou en dispute sont
                  rejetés. Le group_key est réinitialisé après le déplacement.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="block text-xs text-neutral-400 mb-1">
                      Phase source
                    </label>
                    <select
                      className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-sm"
                      value={reassignSourceStageId}
                      onChange={(e) => setReassignSourceStageId(e.target.value)}
                    >
                      <option value="">— Sélectionner —</option>
                      {stages.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-neutral-400 mb-1">
                      Phase cible
                    </label>
                    <select
                      className="w-full px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-700 text-sm"
                      value={reassignTargetStageId}
                      onChange={(e) => setReassignTargetStageId(e.target.value)}
                    >
                      <option value="">— Sélectionner —</option>
                      {stages
                        .filter((s) => s.id !== reassignSourceStageId)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                {reassignSourceStageId && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-neutral-400">
                      <span>
                        {reassignMatches.length} match(s) —{' '}
                        {reassignSelected.size} sélectionné(s)
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={selectAllVisible}
                          disabled={reassignMatches.length === 0}
                          className="px-2 py-1 rounded bg-white/10 hover:bg-white/15 disabled:opacity-50"
                        >
                          Tout sélectionner
                        </button>
                        <button
                          onClick={selectNone}
                          disabled={reassignSelected.size === 0}
                          className="px-2 py-1 rounded bg-white/10 hover:bg-white/15 disabled:opacity-50"
                        >
                          Tout désélectionner
                        </button>
                      </div>
                    </div>
                    <div className="max-h-72 overflow-y-auto rounded-lg border border-neutral-700/50">
                      {reassignMatches.length === 0 ? (
                        <p className="p-4 text-sm text-neutral-500 text-center">
                          Aucun match dans cette phase.
                        </p>
                      ) : (
                        <ul className="divide-y divide-neutral-800">
                          {reassignMatches.map((m) => (
                            <li
                              key={m.id}
                              className={`flex items-center gap-3 px-3 py-2 hover:bg-white/5 cursor-pointer ${
                                reassignSelected.has(m.id)
                                  ? 'bg-blue-500/10'
                                  : ''
                              }`}
                              onClick={() => toggleMatch(m.id)}
                            >
                              <input
                                type="checkbox"
                                checked={reassignSelected.has(m.id)}
                                onChange={() => toggleMatch(m.id)}
                                className="rounded border-neutral-600 bg-neutral-700 text-blue-500"
                              />
                              <span className="text-sm flex-1 truncate">
                                {m.round_name || `Round ${m.round_number}`}
                                <span className="text-xs text-neutral-500 ml-2 font-mono">
                                  {m.id.slice(0, 8)}
                                </span>
                              </span>
                              <span className="text-xs text-neutral-400">
                                {m.status}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}

                <div className="mt-4 flex items-center justify-between">
                  <p className="text-xs text-neutral-500">
                    {reassignTargetStageId &&
                      `Cible : ${stageById.get(reassignTargetStageId)?.name ?? '—'}`}
                  </p>
                  <button
                    onClick={submitReassign}
                    disabled={
                      reassignBusy ||
                      reassignSelected.size === 0 ||
                      !reassignTargetStageId
                    }
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
                  >
                    {reassignBusy
                      ? 'Déplacement…'
                      : `Déplacer ${reassignSelected.size} match(s)`}
                  </button>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default BulkOpsPage;
