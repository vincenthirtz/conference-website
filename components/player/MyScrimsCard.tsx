// components/player/MyScrimsCard.tsx
//
// « Mes scrims » — la surface qui manquait côté équipe (R8).
//
// Le tableau de bord montrait les négociations et les grilles de dispo, mais
// jamais les scrims eux-mêmes : une équipe n'avait aucun endroit où voir contre
// qui elle joue jeudi, ni où rapporter le score une fois joué.
//
// Le report suit le modèle des matchs : chaque camp saisit le score, deux
// reports concordants closent le scrim, deux reports divergents le mettent en
// litige. L'UI dit explicitement où on en est — « en attente de l'adversaire »
// est une information, pas un échec.

import { useCallback, useEffect, useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { usePlayerArea } from '@/components/player/PlayerAreaContext';
import { useToast } from '@/components/Toast';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import type { PlayerScrim } from '../../pages/api/player/scrims/index';
import { logger } from '../../utils/logger';

type ScrimsPayload = {
  toReport: PlayerScrim[];
  upcoming: PlayerScrim[];
  recent: PlayerScrim[];
  teamId: string | null;
};

type ReportOutcome = {
  outcome: 'awaiting_opponent' | 'completed' | 'disputed';
  reason?: string;
};

export default function MyScrimsCard() {
  const t = useT('myScrims');
  const locale = useLocale();
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });
  const { withSubject, readOnly } = usePlayerArea();
  const { addToast } = useToast();

  const [data, setData] = useState<ScrimsPayload | null>(null);
  const [openReport, setOpenReport] = useState<string | null>(null);
  const [myScore, setMyScore] = useState('');
  const [theirScore, setTheirScore] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const payload = await adminFetchJson<ScrimsPayload>(
        withSubject('/api/player/scrims'),
        { skipAuthRedirect: true }
      );
      setData(payload);
    } catch (err) {
      logger.error('[MyScrimsCard] load error', err);
    }
  }, [adminFetchJson, withSubject]);

  useEffect(() => {
    void load();
  }, [load]);

  const fmtDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString(locale, {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : t.noDate;

  const submitReport = async (scrim: PlayerScrim) => {
    const mine = Number(myScore);
    const theirs = Number(theirScore);
    if (
      !Number.isInteger(mine) ||
      !Number.isInteger(theirs) ||
      mine < 0 ||
      theirs < 0
    ) {
      addToast(t.errorScores, 'error');
      return;
    }
    setSaving(true);
    try {
      // L'UI raisonne en « nous / eux » ; l'API en team1 / team2. La bascule
      // se fait ici, au dernier moment.
      const body = scrim.isTeam1
        ? { team1Score: mine, team2Score: theirs }
        : { team1Score: theirs, team2Score: mine };

      const result = await adminFetchJson<ReportOutcome>(
        `/api/player/scrims/${scrim.id}/report`,
        { method: 'POST', body: JSON.stringify(body) }
      );

      addToast(
        result.outcome === 'completed'
          ? t.reportCompleted
          : result.outcome === 'disputed'
            ? t.reportDisputed
            : t.reportAwaiting,
        result.outcome === 'disputed' ? 'error' : 'success'
      );
      setOpenReport(null);
      setMyScore('');
      setTheirScore('');
      await load();
    } catch (err) {
      addToast((err as Error).message || t.errorReport, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!data) return null;
  const { toReport, upcoming, recent } = data;
  if (toReport.length === 0 && upcoming.length === 0 && recent.length === 0) {
    return null;
  }

  const scoreLine = (scrim: PlayerScrim): string | null => {
    if (scrim.team1Score == null || scrim.team2Score == null) return null;
    const mine = scrim.isTeam1 ? scrim.team1Score : scrim.team2Score;
    const theirs = scrim.isTeam1 ? scrim.team2Score : scrim.team1Score;
    return `${mine} – ${theirs}`;
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
      <h3 className="text-lg font-semibold">{t.title}</h3>

      {/* À rapporter — la seule section qui appelle une action. */}
      {toReport.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-200">
            {t.toReportLabel}
          </p>
          {toReport.map((scrim) => (
            <div
              key={scrim.id}
              className="rounded-xl border border-amber-400/30 bg-amber-500/5 px-4 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">
                    {scrim.opponentName ?? t.unknownOpponent}
                  </p>
                  <p className="text-xs text-gray-400">
                    {fmtDate(scrim.scheduledDate)}
                    {!scrim.ranked && ` · ${t.unranked}`}
                  </p>
                  {scrim.status === 'disputed' && (
                    <p className="mt-1 text-xs text-red-300">
                      {scrim.disputeReason || t.disputed}
                    </p>
                  )}
                  {scrim.myReport && scrim.status !== 'disputed' && (
                    <p className="mt-1 text-xs text-emerald-300">
                      {t.awaitingOpponent}
                    </p>
                  )}
                </div>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() =>
                      setOpenReport(openReport === scrim.id ? null : scrim.id)
                    }
                    className="rounded-xl bg-amber-500/90 px-4 py-2 text-xs font-semibold text-black transition hover:bg-amber-400"
                  >
                    {scrim.myReport ? t.correctCta : t.reportCta}
                  </button>
                )}
              </div>

              {openReport === scrim.id && (
                <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-white/10 pt-3">
                  <div>
                    <label
                      htmlFor={`my-score-${scrim.id}`}
                      className="block text-[11px] uppercase tracking-[0.14em] text-gray-400"
                    >
                      {t.usLabel}
                    </label>
                    <input
                      id={`my-score-${scrim.id}`}
                      type="number"
                      min={0}
                      max={99}
                      value={myScore}
                      onChange={(e) => setMyScore(e.target.value)}
                      className="mt-1 w-20 rounded-lg border border-white/15 bg-black/50 px-2 py-1.5 text-sm text-white"
                    />
                  </div>
                  <span className="pb-2 text-gray-500">–</span>
                  <div>
                    <label
                      htmlFor={`their-score-${scrim.id}`}
                      className="block text-[11px] uppercase tracking-[0.14em] text-gray-400"
                    >
                      {t.themLabel}
                    </label>
                    <input
                      id={`their-score-${scrim.id}`}
                      type="number"
                      min={0}
                      max={99}
                      value={theirScore}
                      onChange={(e) => setTheirScore(e.target.value)}
                      className="mt-1 w-20 rounded-lg border border-white/15 bg-black/50 px-2 py-1.5 text-sm text-white"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => submitReport(scrim)}
                    disabled={saving}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold transition hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {t.submitCta}
                  </button>
                  <p className="basis-full text-[11px] text-gray-500">
                    {t.reportHint}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
            {t.upcomingLabel}
          </p>
          <ul className="mt-2 space-y-1.5">
            {upcoming.map((scrim) => (
              <li
                key={scrim.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span className="text-gray-200">
                  {scrim.opponentName ?? t.unknownOpponent}
                </span>
                <span className="text-xs text-gray-500">
                  {fmtDate(scrim.scheduledDate)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {recent.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
            {t.recentLabel}
          </p>
          <ul className="mt-2 space-y-1.5">
            {recent.map((scrim) => (
              <li
                key={scrim.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span className="text-gray-300">
                  {scrim.opponentName ?? t.unknownOpponent}
                </span>
                <span className="text-xs text-gray-400">
                  {scoreLine(scrim) ?? t.noScore}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
