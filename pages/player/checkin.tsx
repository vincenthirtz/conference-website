// pages/player/checkin.tsx
// Espace joueur — flux focalise de check-in pour le prochain match.
// Donnees via GET /api/player/next-match ; validation via POST public
// /api/checkin/{token}.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { PlayerPageSkeleton } from '@/components/player/Skeletons';
import { useLang, type Lang } from '@/lib/i18n/LanguageProvider';
import { localeTag } from '@/lib/i18n/useLocale';
import { useT, format } from '@/lib/i18n/useT';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import type { NextMatchPayload } from '@/pages/api/player/next-match';
import MatchLineupCard from '@/components/player/MatchLineupCard';
import { formatMatchDateTime } from '@/utils/dates/formatMatchDateTime';
import {
  isCheckinStillOpen,
  matchThreadRefreshMs,
} from '@/utils/matches/playerMatchLive';
import {
  isSessionExpiredError,
  loginHrefFor,
} from '@/utils/player/sessionExpiry';

import { logger } from '../../utils/logger';
import nsCheckin from '@/lib/i18n/locales/fr/checkin';
import { useActiveTeam } from '@/components/player/ActiveTeamContext';
import ActiveTeamSwitcher from '@/components/player/ActiveTeamSwitcher';
import { useManagedTeam } from '@/hooks/useManagedTeam';

type T = typeof nsCheckin.fr;

function formatScheduled(iso: string | null, lang: Lang, t: T): string {
  return formatMatchDateTime(iso, localeTag(lang), 'long', t.dateToCome);
}

function formatTime(iso: string | null, lang: Lang): string {
  return formatMatchDateTime(iso, localeTag(lang), 'time', '—');
}

const CHECKIN_PATH = '/player/checkin';

/** "12:34" countdown string between now and target; null when past/invalid. */
function countdown(targetIso: string | null, now: number): string | null {
  if (!targetIso) return null;
  const ms = new Date(targetIso).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (h > 0) return `${h}h ${pad(m)}m ${pad(s)}s`;
  return `${pad(m)}:${pad(s)}`;
}

function PlayerCheckin() {
  const {
    user,
    loading: authLoading,
    ready,
  } = usePlayerSession({
    redirectTo: loginHrefFor(CHECKIN_PATH),
  });
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });
  const { withTeam } = useActiveTeam();
  // Sélecteur d'équipe : cet écran applique `withTeam()`, il doit donc dire
  // QUELLE équipe il montre et permettre d'en changer. `useManagedTeam` publie
  // la liste des équipes gérées dans ActiveTeamContext (lecture partagée et
  // mise en cache avec les autres écrans) — c'est aussi ce qui efface un choix
  // mémorisé devenu périmé. Le sélecteur s'efface seul pour une mono-équipe.
  useManagedTeam();
  const { addToast } = useToast();
  const { lang } = useLang();
  const t = useT(nsCheckin);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<NextMatchPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const inFlight = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // True once THIS session has just turned the check-in green, so the
  // confirmed card can play an explicit "just confirmed" state instead of
  // silently re-rendering. Reset is not needed: the action is one-way.
  const [justConfirmed, setJustConfirmed] = useState(false);

  /**
   * `background` : un échec de rafraîchissement GARDE l'écran (le bouton de
   * check-in ne doit pas disparaître derrière « erreur de chargement » parce
   * qu'une requête a échoué en 4G).
   */
  const load = useCallback(
    async ({ background = false }: { background?: boolean } = {}) => {
      if (background && inFlight.current) return;
      inFlight.current = true;
      try {
        const json = await adminFetchJson<NextMatchPayload>(
          withTeam('/api/player/next-match'),
          { skipAuthRedirect: true }
        );
        setData(json);
        setLoadError(null);
        setSessionExpired(false);
      } catch (err) {
        // 401 : ni message générique ni « réessayer » — un lien de
        // reconnexion qui ramène ICI. C'était un cul-de-sac à l'heure du
        // check-in.
        if (isSessionExpiredError(err)) {
          setSessionExpired(true);
        } else if (!background) {
          logger.error('[player/checkin] load error:', err);
          setLoadError(t.loadError);
        } else {
          logger.warn('[player/checkin] background refresh failed:', err);
        }
      } finally {
        inFlight.current = false;
        setLoading(false);
      }
    },
    [adminFetchJson, t, withTeam]
  );

  useEffect(() => {
    if (!ready) return;
    load();
  }, [ready, load]);

  // Rafraîchissement. `isOpen` et le jeton sont calculés À LA REQUÊTE : ouverte
  // à T-65, la page passait à T-60 sur « check-in indisponible » (fenêtre
  // ouverte côté horloge, mais ni `isOpen` ni jeton dans les données). Même
  // cadence que le fil du match : 30 s autour de la fenêtre, rien ailleurs,
  // et un rattrapage au retour sur l'onglet.
  const [tick, setTick] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!ready) return;
    const clockId = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      setTick(Date.now());
    }, 30_000);
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      setTick(Date.now());
      void load({ background: true });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(clockId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [ready, load]);

  const refreshMs =
    data?.match && data.checkin && !data.checkin.alreadyCheckedIn
      ? matchThreadRefreshMs(
          {
            status: data.match.status,
            checkinOpensAt: data.checkin.opensAt,
            checkinClosesAt: data.checkin.closesAt,
          },
          tick
        )
      : null;
  useEffect(() => {
    if (!ready || refreshMs === null || sessionExpired) return;
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void load({ background: true });
    }, refreshMs);
    return () => clearInterval(id);
  }, [ready, refreshMs, sessionExpired, load]);

  const handleSubmit = async () => {
    const token = data?.checkin?.token;
    if (!token) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/checkin/${encodeURIComponent(token)}`, {
        method: 'POST',
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || t.submitFailed);
      }
      // The POST is idempotent: a second submit returns alreadyCheckedIn:true
      // without a double write. Differentiate the two so feedback is honest.
      const wasAlready = json?.alreadyCheckedIn === true;
      if (wasAlready) {
        addToast(t.alreadyToast, 'info');
      } else {
        addToast(t.successToast, 'success');
        setJustConfirmed(true);
      }
      await load({ background: true });
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : t.submitNetwork);
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || (loading && !data)) {
    return <PlayerPageSkeleton rows={2} />;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
        <main className="max-w-md mx-auto px-4 py-10 pt-32 text-center">
          <h1 className="text-3xl font-bold text-gradient">{t.title}</h1>
          <p className="mt-4 text-gray-300">{t.signinPrompt}</p>
          <Link
            href={loginHrefFor(CHECKIN_PATH)}
            className="mt-8 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-pink-500 to-purple-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-purple-500/20 transition hover:brightness-110"
          >
            {t.signin}
          </Link>
        </main>
      </div>
    );
  }

  const match = data?.match ?? null;
  const checkin = data?.checkin ?? null;
  const hasMatch = !!match && !!data?.team;

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <main className="max-w-2xl mx-auto px-4 py-10 pt-24 pb-16">
        <div className="mb-8">
          <div className="flex items-center gap-3 text-sm text-gray-400">
            <Link
              href="/player/matches"
              className="hover:text-white transition"
            >
              &larr; {t.backToMatches}
            </Link>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-gradient mt-2">
            {t.title}
          </h1>
          <p className="text-sm text-gray-400 mt-2">{t.subtitle}</p>
        </div>

        <ActiveTeamSwitcher className="mb-6" />

        {sessionExpired && (
          <div
            className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
            role="alert"
          >
            <span>{t.sessionExpired}</span>
            <Link
              href={loginHrefFor(CHECKIN_PATH)}
              className="inline-flex min-h-[44px] items-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-neutral-900"
            >
              {t.signinAgain}
            </Link>
          </div>
        )}

        {loadError && (
          <div
            className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100"
            role="alert"
          >
            {loadError}
          </div>
        )}

        {sessionExpired && !data ? null : !hasMatch && !loadError ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-8 text-center">
            <p className="text-lg font-semibold text-white">{t.noMatchTitle}</p>
            <p className="mt-2 text-sm text-gray-400">{t.noMatchBody}</p>
            <Link
              href="/player/matches"
              className="mt-6 inline-flex items-center justify-center rounded-full bg-purple-600 hover:bg-purple-500 px-5 py-2.5 text-sm font-medium text-white transition"
            >
              {t.seeMatches}
            </Link>
          </div>
        ) : hasMatch ? (
          <div className="space-y-6">
            {/* Resume du match */}
            <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-purple-500/10 via-white/[0.03] to-cyan-500/10 backdrop-blur-xl p-6">
              <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.16em] text-purple-200/80">
                {data?.tournament && <span>{data.tournament.name}</span>}
                {match?.roundName && <span>{match.roundName}</span>}
                {match?.format && (
                  <span className="tabular-nums">
                    {match.format.toUpperCase()}
                  </span>
                )}
              </div>
              <h2 className="mt-3 text-2xl md:text-3xl font-bold text-white leading-tight">
                {data?.team?.name} <span className="text-white/50">vs</span>{' '}
                {data?.opponent?.name ?? t.opponentTbd}
              </h2>
              <p className="text-sm text-gray-300 mt-1 capitalize">
                {formatScheduled(match?.scheduledAt ?? null, lang, t)}
              </p>
            </section>

            {/* Machine a etats du check-in — possède son propre `now` (tick 1s)
                pour que le compte a rebours ne re-rende que ce sous-arbre, pas
                toute la page. */}
            <CheckinState
              checkin={checkin}
              submitting={submitting}
              submitError={submitError}
              justConfirmed={justConfirmed}
              onSubmit={handleSubmit}
              lang={lang}
              t={t}
            />

            {/* Enchaînement immédiat : la feuille de match s'ouvre AU
                check-in, et elle s'ouvre ICI. Renvoyer la personne vers un
                autre écran pour composer, c'est perdre le seul moment où
                l'équipe est réunie et attentive — celui où elle vient de
                confirmer sa présence.

                Montée seulement une fois le check-in acquis : c'est la
                condition d'ouverture côté serveur, et `load()` vient de
                rafraîchir `alreadyCheckedIn`. La carte se tait d'elle-même
                pour qui n'a pas la permission `validate_lineup`. */}
            {checkin?.alreadyCheckedIn && match?.id && (
              <MatchLineupCard
                matchId={match.id}
                teamId={data?.team?.id ?? null}
              />
            )}

            {/* Le fil du match (J1) porte désormais TOUT le déroulé — check-in
                compris. Cette page reste le chemin court « je viens juste
                pointer » (et la cible des liens déjà envoyés) ; on y ouvre la
                porte vers le reste plutôt que de la fermer. */}
            {match?.id && (
              <Link
                href={`/player/match/${encodeURIComponent(match.id)}`}
                className="inline-flex items-center gap-1 text-sm text-purple-300 transition hover:text-purple-200"
              >
                {t.openMatchThread}
              </Link>
            )}
          </div>
        ) : null}
      </main>
    </div>
  );
}

function CheckinState({
  checkin,
  submitting,
  submitError,
  justConfirmed,
  onSubmit,
  lang,
  t,
}: {
  checkin: NextMatchPayload['checkin'];
  submitting: boolean;
  submitError: string | null;
  justConfirmed: boolean;
  onSubmit: () => void;
  lang: Lang;
  t: T;
}) {
  // Compte a rebours vivant : ce `now` est LOCAL a la machine a etats. Le tick
  // 1s ne re-rend que ce composant (et non la page complete de ~460 lignes).
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!checkin) {
    return (
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 text-center text-sm text-gray-400">
        {t.noWindow}
      </section>
    );
  }

  // 1) Deja valide.
  if (checkin.alreadyCheckedIn) {
    // When the player just confirmed in this very session, play an explicit,
    // celebratory state so the transition is unmistakable (highest-stakes
    // action). Otherwise show the calmer "already checked in" recap.
    return justConfirmed ? (
      <section
        className="rounded-2xl border border-emerald-400/40 bg-emerald-500/15 backdrop-blur-xl p-6 text-center motion-safe:animate-[fadeIn_300ms_ease-out]"
        role="status"
        aria-live="polite"
      >
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400/20 ring-2 ring-emerald-400/40 motion-safe:animate-[scaleIn_350ms_ease-out]">
          <svg
            className="w-9 h-9 text-emerald-300"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="mt-4 text-2xl font-bold text-emerald-50">
          {t.confirmedHeading}
        </h3>
        <p className="mt-1 text-sm text-emerald-200/90">
          {checkin.checkedInAt
            ? format(t.validatedAt, {
                time: formatTime(checkin.checkedInAt, lang),
              })
            : t.confirmed}
        </p>
        <style jsx>{`
          @keyframes fadeIn {
            from {
              opacity: 0;
              transform: translateY(6px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          @keyframes scaleIn {
            from {
              opacity: 0;
              transform: scale(0.6);
            }
            to {
              opacity: 1;
              transform: scale(1);
            }
          }
        `}</style>
      </section>
    ) : (
      <section
        className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 backdrop-blur-xl p-6"
        role="status"
      >
        <div className="flex items-start gap-3">
          <svg
            className="w-7 h-7 flex-shrink-0 text-emerald-300"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 13l4 4L19 7" />
          </svg>
          <div>
            <h3 className="text-lg font-semibold text-emerald-50">
              {t.checkedInTitle}
            </h3>
            <p className="mt-1 text-sm text-emerald-200/90">
              {checkin.checkedInAt
                ? format(t.validatedAt, {
                    time: formatTime(checkin.checkedInAt, lang),
                  })
                : t.confirmed}
            </p>
          </div>
        </div>
      </section>
    );
  }

  // 2) Fenetre ouverte + token -> bouton de validation. L'horloge locale ne
  // fait que REFERMER la fenetre au coup d'envoi (jamais la prolonger : le
  // forfait tombe au premier passage du cron apres l'heure du match).
  if (isCheckinStillOpen(checkin, now) && checkin.token) {
    const remaining = countdown(checkin.closesAt, now);
    return (
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
        <h3 className="text-lg font-semibold text-white">{t.openTitle}</h3>
        <p className="mt-1 text-sm text-gray-400">{t.openBody}</p>
        {remaining && (
          <p className="mt-3 text-sm text-gray-300">
            {t.closesIn}{' '}
            <span className="tabular-nums font-semibold text-white">
              {remaining}
            </span>
          </p>
        )}
        {submitError && (
          <div
            className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100"
            role="alert"
          >
            {submitError}
          </div>
        )}
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-neutral-900 shadow transition hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? t.submitting : t.submit}
        </button>
      </section>
    );
  }

  // 3) Pas encore ouvert (now < opensAt).
  const isBeforeOpen =
    !!checkin.opensAt && now < new Date(checkin.opensAt).getTime();
  if (isBeforeOpen) {
    const remaining = countdown(checkin.opensAt, now);
    return (
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
        <h3 className="text-lg font-semibold text-white">{t.notOpenTitle}</h3>
        <p className="mt-2 text-sm text-gray-300">
          {t.opensAtPrefix}{' '}
          <span className="font-semibold text-white">
            {formatTime(checkin.opensAt, lang)}
          </span>{' '}
          {t.opensAtSuffix}
        </p>
        {remaining && (
          <p className="mt-3 text-sm text-gray-400">
            {t.opensIn}{' '}
            <span className="tabular-nums font-semibold text-purple-200">
              {remaining}
            </span>
          </p>
        )}
      </section>
    );
  }

  // 4) Fenetre passee sans validation (vue du serveur, ou de l'horloge locale
  // si la page n'a pas encore ete rafraichie depuis le coup d'envoi).
  if (
    checkin.isPassed ||
    (!!checkin.closesAt && now > new Date(checkin.closesAt).getTime())
  ) {
    return (
      <section className="rounded-2xl border border-amber-400/30 bg-amber-500/10 backdrop-blur-xl p-6">
        <h3 className="text-lg font-semibold text-amber-50">{t.passedTitle}</h3>
        <p className="mt-2 text-sm text-amber-200/90">{t.passedBody}</p>
        <Link
          href="/support"
          className="mt-4 inline-flex items-center justify-center rounded-full border border-amber-400/40 bg-amber-500/10 px-5 py-2.5 text-sm font-medium text-amber-100 transition hover:bg-amber-500/20"
        >
          {t.contactStaff}
        </Link>
      </section>
    );
  }

  // Fallback : pas de token / pas de fenetre exploitable.
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 text-center text-sm text-gray-400">
      {t.unavailable}
    </section>
  );
}

const playerCheckinSeo: SeoProps = {
  title: {
    fr: 'Check-in',
    en: 'Check-in',
  },
  description: {
    fr: 'Valide ta présence avant ton prochain match.',
    en: 'Confirm your attendance before your next match.',
  },
  noindex: true,
};

PlayerCheckin.seo = playerCheckinSeo;

export default PlayerCheckin;
