// components/predictions/PredictionsPanel.tsx
//
// Le panneau « Pronostics » de la page TCG : les matchs à venir encore ouverts
// (pronostic en un clic) et les derniers pronostics avec leur résultat.
//
// SE CHARGE LUI-MÊME (`GET /api/player/predictions`), comme `TcgSetsPanel`,
// plutôt que d'alourdir `pages/player/tcg.tsx`. Un pronostic juste crédite le
// porte-monnaie au résultat du match, pas au clic : ce panneau ne touche donc
// jamais au solde affiché par la page.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import Link from 'next/link';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { Skeleton } from '@/components/ui/Skeleton';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import { formatSiteDate } from '@/utils/timezone';
import nsMatchPrediction from '@/lib/i18n/locales/fr/matchPrediction';
import type {
  PlayerPredictionsResponse,
  PredictionListItem,
} from '@/utils/predictions/readState';
import PredictionLeaderboard from './PredictionLeaderboard';
import {
  resultLabel,
  resultTone,
  writeErrorLabel,
  type PredictionDict,
} from './predictionCopy';

export default function PredictionsPanel({
  className,
}: {
  className?: string;
}): JSX.Element {
  const t = useT(nsMatchPrediction);
  const locale = useLocale();
  const { addToast } = useToast();
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });

  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [data, setData] = useState<PlayerPredictionsResponse | null>(null);
  const [savingMatch, setSavingMatch] = useState<string | null>(null);
  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await adminFetchJson<PlayerPredictionsResponse>(
        '/api/player/predictions'
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

  const pick = useCallback(
    async (matchId: string, teamId: string) => {
      setSavingMatch(matchId);
      try {
        await adminFetchJson(`/api/player/predictions/${matchId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teamId }),
        });
        addToast(t.saved, 'success');
      } catch (err) {
        addToast(writeErrorLabel(err, t), 'error');
      } finally {
        setSavingMatch(null);
        void load();
      }
    },
    [adminFetchJson, addToast, t, load]
  );

  const dateOf = (iso: string | null) =>
    iso
      ? formatSiteDate(iso, locale, {
          weekday: 'short',
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';

  return (
    <section
      className={`rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6 ${className ?? ''}`}
      aria-labelledby="tcg-predictions-title"
    >
      <h2 id="tcg-predictions-title" className="text-lg font-semibold">
        {t.panelTitle}
      </h2>
      {data && (
        <>
          <p className="mt-1 max-w-prose text-sm text-gray-400">
            {format(t.intro, { coins: data.reward })}
          </p>
          {/* Dit qui peut jouer : une supportrice qui n'est dans aucune équipe
              a autant sa place ici qu'une joueuse. */}
          <p className="mt-1 max-w-prose text-sm text-gray-500">
            {t.openToAll}
          </p>
        </>
      )}

      {state === 'loading' && (
        <ul aria-hidden className="mt-4 grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 2 }, (_, i) => (
            <li key={i}>
              <Skeleton className="h-24 w-full" rounded="rounded-xl" />
            </li>
          ))}
        </ul>
      )}

      {state === 'error' && (
        <p role="alert" className="mt-4 text-sm text-gray-300">
          {t.panelLoadError}
        </p>
      )}

      {state === 'ready' && data && (
        <>
          <h3 className="mt-5 text-sm font-semibold text-white">
            {t.openTitle}
          </h3>
          {data.ineligibility === 'staff' ? (
            <p className="mt-2 text-sm text-gray-400">{t.ineligibleStaff}</p>
          ) : data.open.length === 0 ? (
            <p className="mt-2 text-sm text-gray-400">{t.openEmpty}</p>
          ) : (
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {data.open.map((item) => (
                <OpenItem
                  key={item.matchId}
                  item={item}
                  date={dateOf(item.scheduledAt)}
                  saving={savingMatch === item.matchId}
                  onPick={pick}
                  t={t}
                />
              ))}
            </ul>
          )}

          <h3 className="mt-6 text-sm font-semibold text-white">
            {t.recentTitle}
          </h3>
          {data.recent.length === 0 ? (
            <p className="mt-2 text-sm text-gray-400">{t.recentEmpty}</p>
          ) : (
            <ul className="mt-3 divide-y divide-white/5">
              {data.recent.map((item) => (
                <li
                  key={item.matchId}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 text-sm"
                >
                  <Link
                    href={`/match/${item.matchId}`}
                    className="text-gray-200 hover:text-white"
                  >
                    {matchTitle(item, t)}
                  </Link>
                  <span className={resultTone(item.prediction?.result ?? null)}>
                    {format(t.yourPick, {
                      team: pickedName(item, t),
                    })}
                    {' · '}
                    {resultLabel(
                      item.prediction?.result ?? null,
                      data.reward,
                      t
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {/* Classement : composant autonome, chargé en même temps que le
              panneau. Il porte sa propre préférence d'affichage du pseudo. */}
          <PredictionLeaderboard className="mt-6" />
        </>
      )}
    </section>
  );
}

function matchTitle(item: PredictionListItem, t: PredictionDict): string {
  return `${item.team1?.name || t.teamUnknown} ${t.versus} ${item.team2?.name || t.teamUnknown}`;
}

function pickedName(item: PredictionListItem, t: PredictionDict): string {
  const id = item.prediction?.teamId;
  if (id && id === item.team1?.id) return item.team1.name;
  if (id && id === item.team2?.id) return item.team2.name;
  return t.teamUnknown;
}

function OpenItem({
  item,
  date,
  saving,
  onPick,
  t,
}: {
  item: PredictionListItem;
  date: string;
  saving: boolean;
  onPick: (matchId: string, teamId: string) => void;
  t: PredictionDict;
}): JSX.Element {
  const teams = [item.team1, item.team2].filter(
    (team): team is NonNullable<typeof team> => Boolean(team)
  );
  return (
    <li className="rounded-xl border border-white/10 bg-black/40 p-3">
      <p className="text-xs text-gray-400">
        {[item.tournamentName, date].filter(Boolean).join(' · ')}
      </p>
      <p className="mt-1 text-sm font-semibold text-white">
        {matchTitle(item, t)}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {teams.map((team) => {
          const selected = item.prediction?.teamId === team.id;
          return (
            <button
              key={team.id}
              type="button"
              aria-pressed={selected}
              aria-label={format(t.pickTeam, { team: team.name })}
              disabled={saving}
              onClick={() => onPick(item.matchId, team.id)}
              className={`min-h-11 truncate rounded-lg border px-3 py-2 text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)] disabled:opacity-60 ${
                selected
                  ? 'border-emerald-400/70 bg-emerald-500/15 text-white'
                  : 'border-white/15 bg-white/5 text-gray-200 hover:border-white/40'
              }`}
            >
              {team.name}
            </button>
          );
        })}
      </div>
      <Link
        href={`/match/${item.matchId}`}
        className="mt-2 inline-block text-xs text-gray-400 underline underline-offset-2 hover:text-white"
      >
        {t.seeMatch}
      </Link>
    </li>
  );
}
