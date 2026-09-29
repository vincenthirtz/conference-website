// components/admin/tournament/BracketPanel.tsx
// Tournament "bracket view" panel (create bracket + entry to the builder).
// Extracted from the former /admin/tournament/[id]/bracket page; now the
// `view` sub-tab of the merged bracket route. Client-only: reads the tournament
// id from the router and fetches its own data (no gssp, no <Head>, no page
// wrapper, no TournamentTabsNav — the host route provides those).

import { useState } from 'react';
import { useRouter } from 'next/router';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import { tournamentUrls } from '@/features/admin/tournaments/client';
import { useTournamentRead } from '@/features/admin/tournaments/hooks/useTournamentRead';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTournamentBracket from '@/lib/i18n/locales/admin-fr/adminTournamentBracket';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import {
  rubanCardPadded,
  rubanErrBox,
  rubanEyebrowSnug,
  rubanFaint,
  rubanFormInput,
  rubanFormLabel,
  rubanInset,
  rubanMuted,
} from '@/features/admin/_shared/ui/ruban';

export default function BracketPanel() {
  const router = useRouter();
  const { id } = router.query;
  const tournamentId = Array.isArray(id) ? id[0] : id;

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
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { mutate: generateBracket } = useIdempotentMutation();
  const t = useAdminT(nsAdminTournamentBracket);

  // Vérifier s'il y a déjà des matchs bracket. Requête AUTHENTIFIÉE (jeton,
  // renvoi à la connexion sur 401) : une session expirée ferait répondre
  // « aucun match » — et ce panneau proposerait ALORS de générer un bracket,
  // sur un tournoi qui en a déjà un. Un échec vaut « aucun match », comme
  // avant.
  const existing = useTournamentRead<{ matches?: unknown[] }>(
    tournamentId ?? '',
    'has-bracket-matches',
    (tid) => tournamentUrls.matches(tid, { limit: 1 })
  );
  const loading = existing.isPending;
  const hasMatches: boolean | null = existing.error
    ? false
    : existing.data
      ? (existing.data.matches || []).length > 0
      : null;

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
      const res = await generateBracket(tournamentUrls.bracket(tournamentId), {
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
      });

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
            <p className={rubanEyebrowSnug}>{t.eyebrow}</p>
            <h1 className="text-2xl font-semibold">
              {format(t.title, { id: tournamentId?.slice(0, 8) ?? '—' })}
            </h1>
          </div>
          {hasMatches && (
            <div className="flex gap-2">
              <AdminButtonLink
                href={`/admin/tournament/${tournamentId}/bracket?tab=builder`}
                variant="secondary"
                size="sm"
              >
                {t.openBuilder}
              </AdminButtonLink>
              <AdminButtonLink
                href={`/admin/tournament/${tournamentId}/matches`}
                size="sm"
              >
                {t.viewMatches}
              </AdminButtonLink>
            </div>
          )}
        </div>

        {loading && <div className={`text-sm ${rubanMuted}`}>{t.loading}</div>}

        {/* Formulaire de création quand aucun bracket n'existe */}
        {!loading && !hasMatches && (
          <div className={`space-y-6 ${rubanCardPadded}`}>
            <div>
              <h2 className="text-lg font-semibold mb-1">{t.createHeading}</h2>
              <p className={`text-sm ${rubanMuted}`}>{t.createDesc}</p>
            </div>

            {errorMsg && <div className={rubanErrBox}>{errorMsg}</div>}
            <form onSubmit={handleGenerate} className="space-y-5">
              {/* Type de bracket */}
              <div>
                <label className={rubanFormLabel}>{t.bracketTypeLabel}</label>
                <div className="flex gap-2">
                  <AdminButton
                    size="sm"
                    variant={bracketType === 'single' ? 'secondary' : 'ghost'}
                    onClick={() => setBracketType('single')}
                  >
                    {t.singleElim}
                  </AdminButton>
                  <AdminButton
                    size="sm"
                    variant={bracketType === 'double' ? 'secondary' : 'ghost'}
                    onClick={() => setBracketType('double')}
                  >
                    {t.doubleElim}
                  </AdminButton>
                </div>
              </div>

              {/* Taille du bracket */}
              <div>
                <label className={rubanFormLabel}>{t.slotsLabel}</label>
                <div className="flex gap-2">
                  {[4, 8, 16, 32].map((s) => (
                    <AdminButton
                      key={s}
                      size="sm"
                      variant={size === s ? 'secondary' : 'ghost'}
                      onClick={() => setSize(s)}
                    >
                      {s}
                    </AdminButton>
                  ))}
                </div>
                <p className={`mt-1 text-xs ${rubanFaint}`}>
                  {format(t.roundsSummary, {
                    rounds: totalRounds,
                    matches: totalMatches,
                  })}
                </p>
              </div>

              {/* Format (Best of) */}
              <div>
                <label className={rubanFormLabel}>{t.defaultFormatLabel}</label>
                <div className="flex gap-2">
                  {[1, 3, 5].map((bo) => (
                    <AdminButton
                      key={bo}
                      size="sm"
                      variant={bestOf === bo ? 'secondary' : 'ghost'}
                      onClick={() => setBestOf(bo)}
                    >
                      BO{bo}
                    </AdminButton>
                  ))}
                </div>
              </div>

              {/* Date de début */}
              <div>
                <label htmlFor="startDate" className={rubanFormLabel}>
                  {t.firstMatchLabel}
                </label>
                <input
                  id="startDate"
                  type="datetime-local"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={rubanFormInput}
                />
                <p className={`mt-1 text-xs ${rubanFaint}`}>
                  {t.firstMatchHelp}
                </p>
              </div>

              {/* Intervalle */}
              <div>
                <label htmlFor="interval" className={rubanFormLabel}>
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
                  className={`!w-32 ${rubanFormInput}`}
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
                    <span className="font-medium text-[var(--t2,#c7bfca)]">
                      {t.grandFinalReset}
                    </span>
                  </label>
                  <p className={`mt-1 ml-6 text-xs ${rubanFaint}`}>
                    {t.grandFinalResetHelp}
                  </p>
                </div>
              )}

              {/* Aperçu visuel */}
              <div className={`${rubanInset} p-4`}>
                <h3 className={`mb-3 ${rubanEyebrowSnug}`}>
                  {t.structurePreview}
                </h3>
                {/* Winners bracket preview */}
                {bracketType === 'double' && (
                  <p className={`mb-2 ${rubanEyebrowSnug}`}>
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
                        <div
                          className={`mb-2 text-[10px] uppercase tracking-wider ${rubanFaint}`}
                        >
                          {label}
                        </div>
                        <div className="flex flex-col gap-1">
                          {Array.from({ length: matchesInRound }, (_, i) => (
                            <div
                              key={i}
                              className="flex h-8 w-20 items-center justify-center rounded-[3px] border font-mono text-[10px] border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] text-[var(--t3,#a39ba6)]"
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
                      <div className="mb-2 text-[10px] uppercase tracking-wider text-[var(--or-300,#dea3f6)]">
                        GF{grandFinalReset ? ' + Reset' : ''}
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex h-8 w-20 items-center justify-center rounded-[3px] border font-mono text-[10px] border-[rgba(180,103,209,.45)] bg-[rgba(180,103,209,.12)] text-[var(--or-200,#eec4ff)]">
                          GF
                        </div>
                        {grandFinalReset && (
                          <div className="flex h-8 w-20 items-center justify-center rounded-[3px] border font-mono text-[10px] border-dashed border-[rgba(180,103,209,.35)] bg-[var(--s1,#100812)] text-[var(--or-300,#dea3f6)]">
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
                    <p className={`mt-4 mb-2 ${rubanEyebrowSnug}`}>
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
                            <div
                              className={`mb-2 text-[10px] uppercase tracking-wider ${rubanFaint}`}
                            >
                              {rd.label}
                            </div>
                            <div className="flex flex-col gap-1">
                              {Array.from({ length: rd.count }, (_, i) => (
                                <div
                                  key={i}
                                  className="flex h-8 w-20 items-center justify-center rounded-[3px] border font-mono text-[10px] border-dashed border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] text-[var(--t4,#807984)]"
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

              <AdminButton
                type="submit"
                variant="primary"
                disabled={generating}
                className={`w-full ${generating ? 'cursor-wait' : ''}`}
              >
                {generating
                  ? t.generating
                  : format(t.generateBtn, { matches: totalMatches })}
              </AdminButton>
            </form>
          </div>
        )}

        {/* Quand un bracket existe déjà */}
        {!loading && hasMatches && (
          <div className={`space-y-4 ${rubanCardPadded}`}>
            <p className="text-sm text-[var(--t2,#c7bfca)]">{t.existsNotice}</p>
            <AdminButtonLink
              href={`/admin/tournament/${tournamentId}/bracket?tab=builder`}
              variant="primary"
              size="sm"
            >
              {t.openBuilder}
            </AdminButtonLink>
          </div>
        )}
      </div>
    </>
  );
}
