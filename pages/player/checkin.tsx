// pages/player/checkin.tsx
// Espace joueur — flux focalise de check-in pour le prochain match.
// Donnees via GET /api/player/next-match ; validation via POST public
// /api/checkin/{token}.

import { useCallback, useEffect, useState } from 'react';
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

import { logger } from '../../utils/logger';
import nsCheckin from '@/lib/i18n/locales/fr/checkin';
import { useActiveTeam } from '@/components/player/ActiveTeamContext';

type T = typeof nsCheckin.fr;

function formatScheduled(iso: string | null, lang: Lang, t: T): string {
  if (!iso) return t.dateToCome;
  return new Date(iso).toLocaleString(localeTag(lang), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  });
}

function formatTime(iso: string | null, lang: Lang): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString(localeTag(lang), {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  });
}

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
    redirectTo: '/login?next=/player/checkin',
  });
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });
  const { withTeam } = useActiveTeam();
  const { addToast } = useToast();
  const { lang } = useLang();
  const t = useT(nsCheckin);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<NextMatchPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // True once THIS session has just turned the check-in green, so the
  // confirmed card can play an explicit "just confirmed" state instead of
  // silently re-rendering. Reset is not needed: the action is one-way.
  const [justConfirmed, setJustConfirmed] = useState(false);

  const load = useCallback(async () => {
    try {
      const json = await adminFetchJson<NextMatchPayload>(
        withTeam('/api/player/next-match'),
        { skipAuthRedirect: true }
      );
      setData(json);
    } catch (err) {
      logger.error('[player/checkin] load error:', err);
      setLoadError(t.loadError);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, t, withTeam]);

  useEffect(() => {
    if (!ready) return;
    load();
  }, [ready, load]);

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
      await load();
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
            href="/login?next=/player/checkin"
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

        {loadError && (
          <div
            className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100"
            role="alert"
          >
            {loadError}
          </div>
        )}

        {!hasMatch && !loadError ? (
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

  // 2) Fenetre ouverte + token -> bouton de validation.
  if (checkin.isOpen && checkin.token) {
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

  // 4) Fenetre passee sans validation.
  if (checkin.isPassed) {
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
