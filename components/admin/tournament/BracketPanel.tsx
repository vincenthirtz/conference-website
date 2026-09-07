// components/admin/tournament/BracketPanel.tsx
// Tournament "bracket view" panel (create bracket + entry to the builder).
// Extracted from the former /admin/tournament/[id]/bracket page; now the
// `view` sub-tab of the merged bracket route. Client-only: reads the tournament
// id from the router and fetches its own data (no gssp, no <Head>, no page
// wrapper, no TournamentTabsNav — the host route provides those).

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTournamentBracket from '@/lib/i18n/locales/admin-fr/adminTournamentBracket';

export default function BracketPanel() {
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
  const { addToast } = useToast();
  const { adminFetchJson } = useAdminFetch();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { mutate: generateBracket } = useIdempotentMutation();
  const t = useAdminT(nsAdminTournamentBracket);

  // Vérifier s'il y a déjà des matchs bracket
  useEffect(() => {
    if (!tournamentId) return;
    setLoading(true);
    // `useAdminFetch` et non un `fetch` brut : il porte le jeton et renvoie à la
    // connexion sur 401. Le repli cookie sauvait la mise ici, mais une session
    // expirée aurait fait répondre « aucun match » — et ce panneau propose
    // ALORS de générer un bracket, sur un tournoi qui en a déjà un.
    // `layout=bracket` retiré : aucun endpoint ne lit ce paramètre.
    adminFetchJson<{ matches?: unknown[] }>(
      `/api/admin/tournament/${tournamentId}/matches?limit=1`
    )
      .then((json) => setHasMatches((json.matches || []).length > 0))
      .catch(() => setHasMatches(false))
      .finally(() => setLoading(false));
  }, [tournamentId, adminFetchJson]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!tournamentId) return;

    // Recap explicite des choix avant insertion massive en base.
    // (Le formulaire est masque quand hasMatches=true ; on garde quand meme
    // une garde au cas ou l'API serait sollicitee depuis un autre flow.)
    const ok = await confirm({
      title:
        bracketType === 'double'
          ? format(t.confirmTitleDouble, { size })
          : format(t.confirmTitleSingle, { size }),
      subtitle: format(t.confirmSubtitle, {
        count: totalMatches,
        format: bestOf ? `BO${bestOf}` : '—',
        reset:
          bracketType === 'double' && grandFinalReset
            ? t.confirmResetSuffix
            : '',
      }),
      variant: 'info',
      confirmLabel: t.confirmLabel,
    });
    if (!ok) return;

    setGenerating(true);
    setErrorMsg(null);

    try {
      const res = await generateBracket(
        `/api/admin/tournament/${tournamentId}/bracket`,
        {
          method: 'POST',
          body: JSON.stringify({
            action:
              bracketType === 'double' ? 'generate_double_elim' : 'generate',
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
        throw new Error(json.error || t.errorGenerate);
      }

      const json = await res.json();
      addToast(format(t.toastCreated, { count: json.match_count }), 'success');
      setTimeout(() => {
        router.push(`/admin/tournament/${tournamentId}/bracket?tab=builder`);
      }, 1000);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errorUnknown);
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
      if (lbR === 1) {
        lbTotal += lbCurrentTeams / 2;
        lbCurrentTeams = lbCurrentTeams / 2;
      } else if (lbR % 2 === 0) {
        lbTotal += lbCurrentTeams;
      } else {
        lbTotal += lbCurrentTeams / 2;
        lbCurrentTeams = lbCurrentTeams / 2;
      }
    }
    return singleElimMatches + lbTotal + 1 + (grandFinalReset ? 1 : 0);
  }

  const totalMatches =
    bracketType === 'double' ? computeDoubleElimMatches() : singleElimMatches;

  return (
    <>
      {confirmDialog}
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-purple-200/80">
              {t.eyebrow}
            </p>
            <h1 className="text-2xl font-semibold">
              {format(t.title, { id: tournamentId?.slice(0, 8) ?? '—' })}
            </h1>
          </div>
          {hasMatches && (
            <div className="flex gap-2">
              <Link
                href={`/admin/tournament/${tournamentId}/bracket?tab=builder`}
                className="px-3 py-2 rounded-lg bg-purple-600/80 hover:bg-purple-600 text-sm font-semibold shadow"
              >
                {t.openBuilder}
              </Link>
              <Link
                href={`/admin/tournament/${tournamentId}/matches`}
                className="px-3 py-2 rounded-lg bg-white/10 border border-white/15 hover:bg-white/15 text-sm"
              >
                {t.viewMatches}
              </Link>
            </div>
          )}
        </div>

        {loading && <div className="text-neutral-400 text-sm">{t.loading}</div>}

        {/* Formulaire de création quand aucun bracket n'existe */}
        {!loading && !hasMatches && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-1">{t.createHeading}</h2>
              <p className="text-sm text-neutral-400">{t.createDesc}</p>
            </div>

            {errorMsg && (
              <div className="rounded bg-red-900/60 border border-red-600 px-4 py-3 text-sm">
                {errorMsg}
              </div>
            )}
            <form onSubmit={handleGenerate} className="space-y-5">
              {/* Type de bracket */}
              <div>
                <label className="block text-sm font-medium text-neutral-200 mb-2">
                  {t.bracketTypeLabel}
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
                    {t.singleElim}
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
                    {t.doubleElim}
                  </button>
                </div>
              </div>

              {/* Taille du bracket */}
              <div>
                <label className="block text-sm font-medium text-neutral-200 mb-2">
                  {t.slotsLabel}
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
                  {format(t.roundsSummary, {
                    rounds: totalRounds,
                    matches: totalMatches,
                  })}
                </p>
              </div>

              {/* Format (Best of) */}
              <div>
                <label className="block text-sm font-medium text-neutral-200 mb-2">
                  {t.defaultFormatLabel}
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
                  {t.firstMatchLabel}
                </label>
                <input
                  id="startDate"
                  type="datetime-local"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <p className="mt-1 text-xs text-neutral-500">
                  {t.firstMatchHelp}
                </p>
              </div>

              {/* Intervalle */}
              <div>
                <label
                  htmlFor="interval"
                  className="block text-sm font-medium text-neutral-200 mb-2"
                >
                  {t.intervalLabel}
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
                    <span className="font-medium text-neutral-200">
                      {t.grandFinalReset}
                    </span>
                  </label>
                  <p className="mt-1 text-xs text-neutral-500 ml-6">
                    {t.grandFinalResetHelp}
                  </p>
                </div>
              )}

              {/* Aperçu visuel */}
              <div className="rounded-lg border border-neutral-700 bg-neutral-900/50 p-4">
                <h3 className="text-sm font-medium text-neutral-300 mb-3">
                  {t.structurePreview}
                </h3>
                {/* Winners bracket preview */}
                {bracketType === 'double' && (
                  <p className="text-xs text-purple-300 uppercase tracking-wider mb-2 font-semibold">
                    {t.winnersBracket}
                  </p>
                )}
                <div className="flex items-center gap-4 overflow-x-auto pb-2">
                  {Array.from({ length: totalRounds }, (_, r) => {
                    const matchesInRound = size / Math.pow(2, r + 1);
                    let label: string;
                    if (r + 1 === totalRounds)
                      label =
                        bracketType === 'double'
                          ? `WB ${t.roundFinal}`
                          : t.roundFinal;
                    else if (r + 1 === totalRounds - 1)
                      label =
                        bracketType === 'double'
                          ? `WB ${t.roundSemi}`
                          : t.roundSemi;
                    else if (r + 1 === totalRounds - 2 && totalRounds >= 3)
                      label =
                        bracketType === 'double'
                          ? `WB ${t.roundQuarter}`
                          : t.roundQuarter;
                    else
                      label =
                        bracketType === 'double' ? `WB R${r + 1}` : `R${r + 1}`;

                    return (
                      <div key={r} className="flex-shrink-0 text-center">
                        <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-2">
                          {label}
                        </div>
                        <div className="flex flex-col gap-1">
                          {Array.from({ length: matchesInRound }, (_, i) => (
                            <div
                              key={i}
                              className="w-20 h-8 rounded border border-neutral-700 bg-neutral-800 flex items-center justify-center text-[10px] text-neutral-500"
                            >
                              M{i + 1}
                            </div>
                          ))}
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
                    <p className="text-xs text-red-300 uppercase tracking-wider mb-2 mt-4 font-semibold">
                      {t.losersBracket}
                    </p>
                    <div className="flex items-center gap-4 overflow-x-auto pb-2">
                      {(() => {
                        const lbRoundsCount = 2 * (wbRounds - 1);
                        const rounds: { label: string; count: number }[] = [];
                        let lbTeams = size / 2;
                        for (let lbR = 1; lbR <= lbRoundsCount; lbR++) {
                          let count: number;
                          if (lbR === 1) {
                            count = lbTeams / 2;
                            lbTeams = lbTeams / 2;
                          } else if (lbR % 2 === 0) {
                            count = lbTeams;
                          } else {
                            count = lbTeams / 2;
                            lbTeams = lbTeams / 2;
                          }
                          rounds.push({
                            label:
                              lbR === lbRoundsCount
                                ? `LB ${t.roundFinal}`
                                : `LB R${lbR}`,
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
                  ? t.generating
                  : format(t.generateBtn, { matches: totalMatches })}
              </button>
            </form>
          </div>
        )}

        {/* Quand un bracket existe déjà */}
        {!loading && hasMatches && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-4">
            <p className="text-sm text-neutral-300">{t.existsNotice}</p>
            <Link
              href={`/admin/tournament/${tournamentId}/bracket?tab=builder`}
              className="inline-block px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-sm font-semibold"
            >
              {t.openBuilder}
            </Link>
          </div>
        )}
      </div>
    </>
  );
}
