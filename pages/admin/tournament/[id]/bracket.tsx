// pages/admin/tournament/[id]/bracket.tsx
// Vue bracket (admin) : création de bracket + accès au builder

import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';

type StaffProps = {
  staff: {
    id: string | null;
    role: string | null;
    display_name: string | null;
  };
};

export const getServerSideProps = withStaffPage('manager');

function AdminBracketPage(_: StaffProps) {
  const router = useRouter();
  const { id } = router.query;
  const tournamentId = Array.isArray(id) ? id[0] : id;

  const [hasMatches, setHasMatches] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  // Formulaire de création
  const [bracketType, setBracketType] = useState<'single' | 'double'>('single');
  const [size, setSize] = useState(8);
  const [bestOf, setBestOf] = useState(3);
  const [startDate, setStartDate] = useState('');
  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [grandFinalReset, setGrandFinalReset] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Vérifier s'il y a déjà des matchs bracket
  useEffect(() => {
    if (!tournamentId) return;
    setLoading(true);
    fetch(
      `/api/admin/tournament/${tournamentId}/matches?layout=bracket&limit=1`
    )
      .then((r) => r.json())
      .then((json) => {
        const matches = json.matches || [];
        setHasMatches(matches.length > 0);
      })
      .catch(() => setHasMatches(false))
      .finally(() => setLoading(false));
  }, [tournamentId]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!tournamentId) return;

    setGenerating(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(
        `/api/admin/tournament/${tournamentId}/bracket`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: bracketType === 'double' ? 'generate_double_elim' : 'generate',
            size,
            bestOf,
            startDate: startDate || undefined,
            intervalMinutes,
            ...(bracketType === 'double' ? { grandFinalReset } : {}),
          }),
        }
      );

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Erreur lors de la génération');
      }

      const json = await res.json();
      setSuccessMsg(
        `Bracket créé avec ${json.match_count} matchs. Redirection...`
      );
      setTimeout(() => {
        router.push(
          `/admin/tournament/${tournamentId}/bracket-builder`
        );
      }, 1000);
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Erreur inconnue');
    } finally {
      setGenerating(false);
    }
  }

  const wbRounds = Math.log2(size);
  const totalRounds = wbRounds;
  const singleElimMatches = size - 1;

  // Double elim: WB matches + LB matches + GF (+ optional reset)
  function computeDoubleElimMatches() {
    const lbRounds = 2 * (wbRounds - 1);
    let lbTotal = 0;
    let lbCurrentTeams = size / 2;
    for (let lbR = 1; lbR <= lbRounds; lbR++) {
      if (lbR === 1) { lbTotal += lbCurrentTeams / 2; lbCurrentTeams = lbCurrentTeams / 2; }
      else if (lbR % 2 === 0) { lbTotal += lbCurrentTeams; }
      else { lbTotal += lbCurrentTeams / 2; lbCurrentTeams = lbCurrentTeams / 2; }
    }
    return singleElimMatches + lbTotal + 1 + (grandFinalReset ? 1 : 0);
  }

  const totalMatches = bracketType === 'double' ? computeDoubleElimMatches() : singleElimMatches;

  return (
    <>
      <Head>
        <title>Admin · Bracket</title>
      </Head>
      <div className="min-h-screen bg-neutral-950 text-white pt-24">
        <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <button
                type="button"
                onClick={() =>
                  router.push(`/admin/tournament/${tournamentId}`)
                }
                className="mb-2 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white"
              >
                &larr; Retour au tournoi
              </button>
              <p className="text-xs uppercase tracking-[0.18em] text-purple-200/80">
                Admin · Bracket
              </p>
              <h1 className="text-2xl font-semibold">
                Tournoi {tournamentId?.slice(0, 8) ?? '—'}
              </h1>
            </div>
            {hasMatches && (
              <div className="flex gap-2">
                <Link
                  href={`/admin/tournament/${tournamentId}/bracket-builder`}
                  className="px-3 py-2 rounded-lg bg-purple-600/80 hover:bg-purple-600 text-sm font-semibold shadow"
                >
                  Ouvrir le bracket builder
                </Link>
                <Link
                  href={`/admin/tournament/${tournamentId}/matches`}
                  className="px-3 py-2 rounded-lg bg-white/10 border border-white/15 hover:bg-white/15 text-sm"
                >
                  Voir les matchs
                </Link>
              </div>
            )}
          </div>

          {loading && (
            <div className="text-neutral-400 text-sm">Chargement...</div>
          )}

          {/* Formulaire de création quand aucun bracket n'existe */}
          {!loading && !hasMatches && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-1">
                  Créer un nouveau bracket
                </h2>
                <p className="text-sm text-neutral-400">
                  Genere la structure du bracket sans equipes. Les slots
                  pourront etre remplis ensuite.
                </p>
              </div>

              {errorMsg && (
                <div className="rounded bg-red-900/60 border border-red-600 px-4 py-3 text-sm">
                  {errorMsg}
                </div>
              )}
              {successMsg && (
                <div className="rounded bg-emerald-900/60 border border-emerald-600 px-4 py-3 text-sm">
                  {successMsg}
                </div>
              )}

              <form onSubmit={handleGenerate} className="space-y-5">
                {/* Type de bracket */}
                <div>
                  <label className="block text-sm font-medium text-neutral-200 mb-2">
                    Type de bracket
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setBracketType('single')}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                        bracketType === 'single'
                          ? 'bg-purple-600 border-purple-500 text-white'
                          : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700'
                      }`}
                    >
                      Single Elimination
                    </button>
                    <button
                      type="button"
                      onClick={() => setBracketType('double')}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                        bracketType === 'double'
                          ? 'bg-purple-600 border-purple-500 text-white'
                          : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700'
                      }`}
                    >
                      Double Elimination
                    </button>
                  </div>
                </div>

                {/* Taille du bracket */}
                <div>
                  <label className="block text-sm font-medium text-neutral-200 mb-2">
                    Nombre de slots (équipes)
                  </label>
                  <div className="flex gap-2">
                    {[4, 8, 16, 32].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSize(s)}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                          size === s
                            ? 'bg-purple-600 border-purple-500 text-white'
                            : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    {totalRounds} rounds, {totalMatches} matchs au total
                  </p>
                </div>

                {/* Format (Best of) */}
                <div>
                  <label className="block text-sm font-medium text-neutral-200 mb-2">
                    Format par défaut
                  </label>
                  <div className="flex gap-2">
                    {[1, 3, 5].map((bo) => (
                      <button
                        key={bo}
                        type="button"
                        onClick={() => setBestOf(bo)}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                          bestOf === bo
                            ? 'bg-purple-600 border-purple-500 text-white'
                            : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:bg-neutral-700'
                        }`}
                      >
                        BO{bo}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Date de début */}
                <div>
                  <label
                    htmlFor="startDate"
                    className="block text-sm font-medium text-neutral-200 mb-2"
                  >
                    Date et heure du premier match
                  </label>
                  <input
                    id="startDate"
                    type="datetime-local"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <p className="mt-1 text-xs text-neutral-500">
                    Optionnel. Les horaires pourront aussi être modifiés dans
                    le bracket builder.
                  </p>
                </div>

                {/* Intervalle */}
                <div>
                  <label
                    htmlFor="interval"
                    className="block text-sm font-medium text-neutral-200 mb-2"
                  >
                    Intervalle entre les matchs (minutes)
                  </label>
                  <input
                    id="interval"
                    type="number"
                    min={5}
                    max={1440}
                    value={intervalMinutes}
                    onChange={(e) =>
                      setIntervalMinutes(parseInt(e.target.value, 10) || 60)
                    }
                    className="w-32 px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                {/* Double elim options */}
                {bracketType === 'double' && (
                  <div>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={grandFinalReset}
                        onChange={(e) => setGrandFinalReset(e.target.checked)}
                        className="rounded border-neutral-500 bg-neutral-700"
                      />
                      <span className="font-medium text-neutral-200">Grand Final Reset</span>
                    </label>
                    <p className="mt-1 text-xs text-neutral-500 ml-6">
                      Si le joueur venant du Loser Bracket gagne la Grande Finale,
                      un match supplementaire est joue pour departager.
                    </p>
                  </div>
                )}

                {/* Aperçu visuel */}
                <div className="rounded-lg border border-neutral-700 bg-neutral-900/50 p-4">
                  <h3 className="text-sm font-medium text-neutral-300 mb-3">
                    Apercu de la structure
                  </h3>
                  {/* Winners bracket preview */}
                  {bracketType === 'double' && (
                    <p className="text-xs text-purple-300 uppercase tracking-wider mb-2 font-semibold">Winners Bracket</p>
                  )}
                  <div className="flex items-center gap-4 overflow-x-auto pb-2">
                    {Array.from({ length: totalRounds }, (_, r) => {
                      const matchesInRound = size / Math.pow(2, r + 1);
                      let label: string;
                      if (r + 1 === totalRounds) label = bracketType === 'double' ? 'WB Finale' : 'Finale';
                      else if (r + 1 === totalRounds - 1) label = bracketType === 'double' ? 'WB Demi' : 'Demi';
                      else if (r + 1 === totalRounds - 2 && totalRounds >= 3) label = bracketType === 'double' ? 'WB Quarts' : 'Quarts';
                      else label = bracketType === 'double' ? `WB R${r + 1}` : `R${r + 1}`;

                      return (
                        <div key={r} className="flex-shrink-0 text-center">
                          <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-2">
                            {label}
                          </div>
                          <div className="flex flex-col gap-1">
                            {Array.from(
                              { length: matchesInRound },
                              (_, i) => (
                                <div
                                  key={i}
                                  className="w-20 h-8 rounded border border-neutral-700 bg-neutral-800 flex items-center justify-center text-[10px] text-neutral-500"
                                >
                                  M{i + 1}
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {bracketType === 'double' && (
                      <div className="flex-shrink-0 text-center">
                        <div className="text-[10px] uppercase tracking-wider text-amber-400 mb-2">
                          GF{grandFinalReset ? ' + Reset' : ''}
                        </div>
                        <div className="flex flex-col gap-1">
                          <div className="w-20 h-8 rounded border border-amber-700/50 bg-amber-900/20 flex items-center justify-center text-[10px] text-amber-300">
                            GF
                          </div>
                          {grandFinalReset && (
                            <div className="w-20 h-8 rounded border border-amber-700/30 bg-amber-900/10 flex items-center justify-center text-[10px] text-amber-400/70">
                              Reset
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Losers bracket preview */}
                  {bracketType === 'double' && (
                    <>
                      <p className="text-xs text-red-300 uppercase tracking-wider mb-2 mt-4 font-semibold">Losers Bracket</p>
                      <div className="flex items-center gap-4 overflow-x-auto pb-2">
                        {(() => {
                          const lbRoundsCount = 2 * (wbRounds - 1);
                          const rounds: { label: string; count: number }[] = [];
                          let lbTeams = size / 2;
                          for (let lbR = 1; lbR <= lbRoundsCount; lbR++) {
                            let count: number;
                            if (lbR === 1) { count = lbTeams / 2; lbTeams = lbTeams / 2; }
                            else if (lbR % 2 === 0) { count = lbTeams; }
                            else { count = lbTeams / 2; lbTeams = lbTeams / 2; }
                            rounds.push({
                              label: lbR === lbRoundsCount ? 'LB Finale' : `LB R${lbR}`,
                              count,
                            });
                          }
                          return rounds.map((rd, idx) => (
                            <div key={idx} className="flex-shrink-0 text-center">
                              <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-2">
                                {rd.label}
                              </div>
                              <div className="flex flex-col gap-1">
                                {Array.from({ length: rd.count }, (_, i) => (
                                  <div
                                    key={i}
                                    className="w-20 h-8 rounded border border-red-800/40 bg-red-900/10 flex items-center justify-center text-[10px] text-red-400/70"
                                  >
                                    M{i + 1}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ));
                        })()}
                      </div>
                    </>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={generating}
                  className={`w-full px-4 py-3 rounded-lg text-sm font-semibold transition-colors ${
                    generating
                      ? 'bg-purple-900/70 cursor-wait'
                      : 'bg-purple-600 hover:bg-purple-700'
                  }`}
                >
                  {generating
                    ? 'Génération en cours...'
                    : `Générer le bracket (${totalMatches} matchs)`}
                </button>
              </form>
            </div>
          )}

          {/* Quand un bracket existe déjà */}
          {!loading && hasMatches && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-4">
              <p className="text-sm text-neutral-300">
                Un bracket existe déjà pour ce tournoi. Utilisez le bracket
                builder pour modifier les slots, les dates et les résultats.
              </p>
              <Link
                href={`/admin/tournament/${tournamentId}/bracket-builder`}
                className="inline-block px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-sm font-semibold"
              >
                Ouvrir le bracket builder
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default AdminBracketPage;
