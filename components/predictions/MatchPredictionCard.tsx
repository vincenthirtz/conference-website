// components/predictions/MatchPredictionCard.tsx
//
// La carte « Pronostic » de la page d'un match (`pages/match/[id].tsx`).
//
// SE CHARGE ELLE-MÊME, CÔTÉ CLIENT. La page match est statique (ISR) et
// partagée entre toutes les visiteuses : le pronostic est propre à chacune,
// il ne peut pas venir de `getStaticProps`. Anonyme, la carte n'appelle rien et
// propose de se connecter tant que le match est à venir.
//
// UN PRONOSTIC, PAS UN PARI. Le texte le dit (« tu n'engages aucune pièce »),
// et la carte n'affiche jamais de cote. La répartition des pronostics n'est
// montrée qu'une fois le match verrouillé : l'API ne la rend pas avant.
//
// ACCESSIBILITÉ. Les deux choix sont des boutons à `aria-pressed` ; l'état
// enregistré est annoncé par une région `role="status"`.

import { useCallback, useEffect, useState } from 'react';
import type { JSX, ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from '@/hooks/useSession';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { TcgAmount } from '@/components/tcg/TcgCoin';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import { formatSiteDate } from '@/utils/timezone';
import nsMatchPrediction from '@/lib/i18n/locales/fr/matchPrediction';
import type { MatchPredictionState } from '@/utils/predictions/readState';
import {
  resultLabel,
  resultTone,
  writeErrorLabel,
  type PredictionDict,
} from './predictionCopy';

type TeamRef = { id: string; name: string };

export default function MatchPredictionCard({
  matchId,
  team1,
  team2,
  status,
}: {
  matchId: string;
  team1: TeamRef;
  team2: TeamRef;
  status: string;
}): JSX.Element | null {
  const t = useT(nsMatchPrediction);
  const locale = useLocale();
  const router = useRouter();
  const { user, loading: sessionLoading } = useSession();
  const { addToast } = useToast();
  // Pas de redirection sur 401 : la carte vit sur une page publique.
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });

  const [state, setState] = useState<MatchPredictionState | null>(null);
  const [loadState, setLoadState] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  const [saving, setSaving] = useState(false);

  const url = `/api/player/predictions/${matchId}`;

  const load = useCallback(async () => {
    setLoadState('loading');
    try {
      const data = await adminFetchJson<MatchPredictionState>(url, {
        skipAuthRedirect: true,
      });
      setState(data);
      setLoadState('ready');
    } catch {
      setLoadState('error');
    }
  }, [adminFetchJson, url]);

  useEffect(() => {
    if (sessionLoading || !user) return;
    void load();
  }, [sessionLoading, user, load]);

  const pick = useCallback(
    async (teamId: string) => {
      setSaving(true);
      try {
        await adminFetchJson(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teamId }),
          skipAuthRedirect: true,
        });
        addToast(t.saved, 'success');
      } catch (err) {
        addToast(writeErrorLabel(err, t), 'error');
      } finally {
        setSaving(false);
        void load();
      }
    },
    [adminFetchJson, url, addToast, t, load]
  );

  const remove = useCallback(async () => {
    setSaving(true);
    try {
      await adminFetchJson(url, { method: 'DELETE', skipAuthRedirect: true });
      addToast(t.removed, 'success');
    } catch (err) {
      addToast(writeErrorLabel(err, t), 'error');
    } finally {
      setSaving(false);
      void load();
    }
  }, [adminFetchJson, url, addToast, t, load]);

  // Anonyme : une invitation, seulement si le match est encore à venir.
  if (!sessionLoading && !user) {
    if (status !== 'pending') return null;
    return (
      <Shell title={t.title}>
        {/* Sans montant : le barème est rendu par l'API, et importer le
            registre ici ferait entrer le moteur de rating dans le bundle
            (cf. docs/TCG.md, « L'économie »). */}
        <p className="text-sm text-gray-300">{t.introAnonymous}</p>
        <Link
          href={`/login?next=${encodeURIComponent(router.asPath)}`}
          className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)]"
        >
          {t.signIn}
        </Link>
      </Shell>
    );
  }

  if (loadState === 'error') {
    return (
      <Shell title={t.title}>
        <p role="alert" className="text-sm text-gray-400">
          {t.loadError}
        </p>
      </Shell>
    );
  }
  if (!state) return null;
  if (state.window === 'not_predictable') return null;

  const teamName = (id: string | null | undefined) =>
    id === team1.id ? team1.name : id === team2.id ? team2.name : '';
  const mine = state.prediction;
  const open = state.window === 'open';
  const locksAt = state.locksAt
    ? formatSiteDate(state.locksAt, locale, {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <Shell title={t.title}>
      <p className="max-w-prose text-sm text-gray-300">
        {format(t.intro, { coins: state.reward })}
      </p>

      {state.ineligibility ? (
        <p className="mt-3 text-sm text-gray-400">
          {state.ineligibility === 'staff'
            ? t.ineligibleStaff
            : t.ineligibleParticipant}
        </p>
      ) : open ? (
        <>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[team1, team2].map((team) => {
              const selected = mine?.teamId === team.id;
              return (
                <button
                  key={team.id}
                  type="button"
                  aria-pressed={selected}
                  disabled={saving}
                  onClick={() => void pick(team.id)}
                  className={`min-h-11 rounded-xl border px-4 py-2 text-left text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)] disabled:opacity-60 ${
                    selected
                      ? 'border-emerald-400/70 bg-emerald-500/15 text-white'
                      : 'border-white/15 bg-white/5 text-gray-200 hover:border-white/40'
                  }`}
                >
                  {format(t.pickTeam, { team: team.name })}
                </button>
              );
            })}
          </div>
          <p role="status" className="mt-3 text-xs text-gray-400">
            {mine
              ? format(t.yourPick, { team: teamName(mine.teamId) })
              : t.changeHint}
            {locksAt ? ` · ${format(t.locksAt, { date: locksAt })}` : ''}
          </p>
          {mine && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void remove()}
              className="mt-2 min-h-11 text-xs text-gray-400 underline underline-offset-2 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)]"
            >
              {t.remove}
            </button>
          )}
        </>
      ) : (
        <div className="mt-3 space-y-1 text-sm">
          <p className="text-gray-400">{t.locked}</p>
          {mine ? (
            <p role="status">
              <span className="text-gray-200">
                {format(t.yourPick, { team: teamName(mine.teamId) })}
              </span>
              {' · '}
              <span className={resultTone(mine.result)}>
                {mine.result === 'won' ? (
                  <TcgAmount value={state.reward} signed size={14} />
                ) : (
                  resultLabel(mine.result, state.reward, t)
                )}
              </span>
            </p>
          ) : (
            <p className="text-gray-500">{t.noPick}</p>
          )}
        </div>
      )}

      {state.distribution && (
        <Distribution
          team1={team1.name}
          team2={team2.name}
          counts={state.distribution}
          t={t}
        />
      )}
    </Shell>
  );
}

function Shell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <section
      className="mb-6 rounded-2xl border border-white/10 bg-black/60 px-4 py-4"
      aria-labelledby="match-prediction-title"
    >
      <h2
        id="match-prediction-title"
        className="mb-2 text-[11px] uppercase tracking-wide text-gray-400"
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Distribution({
  team1,
  team2,
  counts,
  t,
}: {
  team1: string;
  team2: string;
  counts: { team1: number; team2: number };
  t: PredictionDict;
}): JSX.Element | null {
  const total = counts.team1 + counts.team2;
  if (total === 0) return null;
  const pct1 = Math.round((counts.team1 / total) * 100);
  const pct2 = 100 - pct1;
  return (
    <div className="mt-4">
      <p className="text-[11px] uppercase tracking-wide text-gray-500">
        {t.distributionTitle} ·{' '}
        {format(
          total > 1 ? t.distributionCount_other : t.distributionCount_one,
          {
            count: total,
          }
        )}
      </p>
      <div className="mt-2 flex justify-between text-xs tabular-nums text-gray-300">
        <span>
          {team1} {pct1} %
        </span>
        <span>
          {pct2} % {team2}
        </span>
      </div>
      <div
        aria-hidden
        className="mt-1 flex h-2 overflow-hidden rounded-full bg-white/10"
      >
        <span className="bg-pink-400/80" style={{ width: `${pct1}%` }} />
        <span className="bg-sky-400/80" style={{ width: `${pct2}%` }} />
      </div>
    </div>
  );
}
