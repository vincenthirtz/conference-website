// pages/checkin/[token].tsx
// Public page that captains visit (from email link or Draftbot URL) to confirm
// their team's presence for an upcoming match.

import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useT, format } from '@/lib/i18n/useT';
import { ANALYTICS_EVENTS, trackEvent } from '@/lib/analytics/track';
import { useLocale } from '@/lib/i18n/useLocale';
import nsCheckinToken from '@/lib/i18n/locales/fr/checkinToken';

type ResolveResponse =
  | {
      ok: true;
      matchId: string;
      teamSlot: 1 | 2;
      teamName: string;
      teamId: string;
      opponentName: string | null;
      tournamentName: string | null;
      scheduledAt: string | null;
      alreadyCheckedIn: boolean;
      checkedInAt: string | null;
      matchStatus: string;
    }
  | { error: string };

function formatDateFr(value: string | null, locale: string): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Paris',
    });
  } catch {
    return value;
  }
}

export default function CheckinPage() {
  const router = useRouter();
  const t = useT(nsCheckinToken);
  const locale = useLocale();
  const { token } = router.query;
  const tokenStr = Array.isArray(token) ? token[0] : token;

  const [info, setInfo] = useState<ResolveResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tokenStr) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/checkin/${encodeURIComponent(tokenStr)}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || json.error) {
          setError(json.error || t.errInvalidLink);
        } else {
          setInfo(json);
          if (json.alreadyCheckedIn) setConfirmed(true);
        }
      } catch {
        if (!cancelled) setError(t.errNetwork);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tokenStr, t]);

  async function handleConfirm() {
    if (!tokenStr) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/checkin/${encodeURIComponent(tokenStr)}`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json.error || t.errCheckinFailed);
      } else {
        // Seul le chemin ACTIF est mesuré : `alreadyCheckedIn` (au chargement)
        // n'est pas une conversion, c'est un retour sur une page déjà validée.
        trackEvent(ANALYTICS_EVENTS.checkinDone);
        setConfirmed(true);
      }
    } catch {
      setError(t.errNetwork);
    } finally {
      setSubmitting(false);
    }
  }

  const ok = info && 'ok' in info && info.ok;
  const data = ok ? (info as Extract<ResolveResponse, { ok: true }>) : null;

  return (
    <>
      <Head>
        <title>Check-in — OW Women&apos;s Cup</title>
        <meta name="robots" content="noindex" />
      </Head>

      <main className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="bg-neutral-800/60 backdrop-blur border border-neutral-700/50 rounded-2xl p-8 shadow-2xl">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-600/20 border border-blue-500/30 mb-4">
                <svg
                  className="w-7 h-7 text-blue-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
              <p className="text-sm text-neutral-400 mt-1">{t.subtitle}</p>
            </div>

            {loading && (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
              </div>
            )}

            {!loading && error && !data && (
              <div className="rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm">
                <p className="font-semibold text-red-200 mb-1">
                  {t.invalidLinkTitle}
                </p>
                <p className="text-red-300">{error}</p>
                <p className="text-xs text-red-400 mt-3">{t.invalidLinkHint}</p>
              </div>
            )}

            {!loading && data && (
              <>
                <div className="bg-neutral-900/50 border border-neutral-700/50 rounded-xl p-4 mb-5 space-y-3">
                  <Row
                    label={t.rowTournament}
                    value={data.tournamentName || '—'}
                  />
                  <Row label={t.rowYourTeam} value={data.teamName} highlight />
                  <Row label={t.rowOpponent} value={data.opponentName || '—'} />
                  <Row
                    label={t.rowStart}
                    value={formatDateFr(data.scheduledAt, locale)}
                  />
                </div>

                {confirmed ? (
                  <div className="rounded-xl bg-emerald-900/40 border border-emerald-500/50 px-4 py-4 text-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <svg
                        className="w-5 h-5 text-emerald-400"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <p className="font-semibold text-emerald-200">
                        {t.confirmedTitle}
                      </p>
                    </div>
                    <p className="text-emerald-300/90">{t.confirmedBody}</p>
                  </div>
                ) : data.matchStatus !== 'pending' &&
                  data.matchStatus !== 'ongoing' ? (
                  <div className="rounded-xl bg-amber-900/40 border border-amber-500/50 px-4 py-4 text-sm">
                    <p className="font-semibold text-amber-200 mb-1">
                      {t.closedTitle}
                    </p>
                    <p className="text-amber-300/90">
                      {format(t.closedBody, { status: data.matchStatus })}
                    </p>
                  </div>
                ) : (
                  <>
                    {error && (
                      <div className="rounded-xl bg-red-900/40 border border-red-500/50 px-3 py-2 text-sm mb-3">
                        {error}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={handleConfirm}
                      disabled={submitting}
                      className="w-full px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-base font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {submitting ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          {t.saving}
                        </>
                      ) : (
                        <>
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                          {t.confirmBtn}
                        </>
                      )}
                    </button>
                    <p className="text-xs text-neutral-500 mt-3 text-center">
                      {t.forfeitNote}
                    </p>
                  </>
                )}
              </>
            )}
          </div>

          <p className="text-center text-xs text-neutral-500 mt-6">
            {t.footer}
          </p>
        </div>
      </main>
    </>
  );
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <span className="block text-xs text-neutral-500 uppercase tracking-wide mb-0.5">
        {label}
      </span>
      <span
        className={`text-sm ${highlight ? 'text-white font-semibold' : 'text-neutral-200'}`}
      >
        {value}
      </span>
    </div>
  );
}
