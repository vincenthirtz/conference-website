// components/predictions/PredictionLeaderboard.tsx
//
// Le classement des pronostiqueuses, sous le panneau « Pronostics » de la page
// TCG.
//
// ON COMPTE TOUT LE MONDE, ON NE NOMME QUE SUR ACCORD. Les lignes viennent du
// serveur déjà anonymisées : ici, `displayName === null` veut dire « cette
// personne n'a pas accepté d'être nommée », et l'écran écrit « Anonyme ». Le
// composant ne décide de rien — il ne saurait pas le faire sans le nom, et
// c'est exactement ce qu'on veut.
//
// SA PROPRE LIGNE, TOUJOURS. Même hors du tableau (sous le seuil, ou trop
// loin), chacune lit son rang et ce qui lui manque pour entrer : un classement
// qui ne dit pas où l'on est n'engage personne.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { Skeleton } from '@/components/ui/Skeleton';
import { useT, format } from '@/lib/i18n/useT';
import nsMatchPrediction from '@/lib/i18n/locales/fr/matchPrediction';
import type { PredictionLeaderboardResponse } from '@/utils/predictions/readLeaderboard';

const percent = (accuracy: number): string =>
  String(Math.round(accuracy * 100));

export default function PredictionLeaderboard({
  className,
}: {
  className?: string;
}): JSX.Element {
  const t = useT(nsMatchPrediction);
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });
  const { addToast } = useToast();

  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [data, setData] = useState<PredictionLeaderboardResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await adminFetchJson<PredictionLeaderboardResponse>(
        '/api/player/predictions/leaderboard'
      );
      setData(res);
      loadedOnce.current = true;
      setState('ready');
    } catch {
      if (!loadedOnce.current) setState('error');
    }
  }, [adminFetchJson]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleVisibility = useCallback(
    async (show: boolean) => {
      setSaving(true);
      try {
        await adminFetchJson('/api/player/predictions/leaderboard', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ showInLeaderboard: show }),
        });
        addToast(t.leaderboardOptInSaved, 'success');
        await load();
      } catch {
        addToast(t.leaderboardOptInError, 'error');
      } finally {
        setSaving(false);
      }
    },
    [adminFetchJson, addToast, t, load]
  );

  if (state === 'loading') {
    return (
      <div className={className} aria-hidden>
        <Skeleton className="h-40 w-full" rounded="rounded-xl" />
      </div>
    );
  }
  if (state === 'error' || !data) {
    return (
      <p role="alert" className={`text-sm text-gray-300 ${className ?? ''}`}>
        {t.leaderboardError}
      </p>
    );
  }

  return (
    <section
      className={`rounded-2xl border border-white/10 bg-black/30 p-4 sm:p-5 ${className ?? ''}`}
      aria-labelledby="prediction-leaderboard-title"
    >
      <h3
        id="prediction-leaderboard-title"
        className="text-base font-semibold text-white"
      >
        {t.leaderboardTitle}
      </h3>
      <p className="mt-1 max-w-prose text-sm text-gray-400">
        {t.leaderboardIntro}
      </p>

      {data.rows.length === 0 ? (
        <p className="mt-4 text-sm text-gray-400">{t.leaderboardEmpty}</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[22rem] text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
                <th scope="col" className="py-1 pr-3 font-medium">
                  {t.leaderboardColRank}
                </th>
                <th scope="col" className="py-1 pr-3 font-medium">
                  {t.leaderboardColName}
                </th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">
                  {t.leaderboardColCorrect}
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  {t.leaderboardColAccuracy}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {data.rows.map((row) => (
                <tr
                  key={`${row.rank}-${row.displayName ?? 'anon'}-${row.correct}-${row.settled}`}
                  className={row.isMe ? 'text-white' : 'text-gray-300'}
                >
                  <td className="py-1.5 pr-3 tabular-nums">{row.rank}</td>
                  <td className="py-1.5 pr-3">
                    {row.isMe
                      ? (row.displayName ?? t.leaderboardYou)
                      : (row.displayName ?? t.leaderboardAnonymous)}
                    {row.isMe && (
                      <span className="ml-2 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                        {t.leaderboardYou}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {row.correct}/{row.settled}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">
                    {percent(row.accuracy)} %
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p role="status" className="mt-3 text-sm text-gray-300">
        {!data.me
          ? t.leaderboardMineNone
          : data.me.rank
            ? format(t.leaderboardMine, {
                rank: data.me.rank,
                correct: data.me.correct,
                settled: data.me.settled,
                accuracy: percent(data.me.accuracy),
              })
            : format(t.leaderboardMinePending, {
                missing: data.me.missing,
                correct: data.me.correct,
                settled: data.me.settled,
              })}
      </p>

      {data.truncated && (
        <p className="mt-2 text-xs text-amber-200">{t.leaderboardTruncated}</p>
      )}

      <label className="mt-4 flex min-h-11 items-start gap-3 text-sm text-gray-200">
        <input
          type="checkbox"
          className="mt-1"
          checked={data.showsMyName}
          disabled={saving}
          onChange={(e) => void toggleVisibility(e.target.checked)}
        />
        <span>
          {t.leaderboardOptInLabel}
          <span className="mt-1 block text-xs text-gray-400">
            {t.leaderboardOptInHelp}
          </span>
        </span>
      </label>
    </section>
  );
}
