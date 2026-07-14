// pages/player/caster-application.tsx
// Page pour candidater au cast (devenir casteuse) depuis l'espace joueuse.

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useToast } from '@/components/Toast';
import { PlayerPageSkeleton } from '@/components/player/Skeletons';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import type { SeoProps } from '@/components/Seo/DefaultSeo';

import { logger } from '../../utils/logger';

const MOTIVATION_MAX = 1000;

type ApplicationStatus = 'pending' | 'approved' | 'rejected';

type CasterApplication = {
  id: string;
  status: ApplicationStatus;
  comment?: string | null;
  created_at: string;
  processed_at?: string | null;
};

export default function CasterApplicationPage() {
  const { user, token, loading: authLoading, ready } = usePlayerSession();
  const { addToast } = useToast();
  const t = useT('casterApplication');

  const [loading, setLoading] = useState(true);
  const [application, setApplication] = useState<CasterApplication | null>(
    null
  );
  // Erreur de CHARGEMENT du statut (distincte de l'erreur de soumission) : si le
  // GET échoue, on ne doit pas afficher un formulaire vierge trompeur (l'utilisateur
  // pourrait avoir déjà une candidature en cours qu'on n'a pas pu lire).
  const [loadError, setLoadError] = useState<string | null>(null);

  const [motivation, setMotivation] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Charge la candidature existante.
  const loadApplication = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/demandes/caster-application', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      setApplication(data.application ?? null);
    } catch (err) {
      logger.error('[caster-application] load error:', err);
      setLoadError(t.loadError);
    } finally {
      setLoading(false);
    }
  }, [token, t]);

  useEffect(() => {
    if (!ready || !token) return;
    void loadApplication();
  }, [ready, token, loadApplication]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Garde anti double-submit : le disabled ne protège pas d'un double-Enter
    // envoyé avant le re-render.
    if (submitting) return;
    setError(null);

    const trimmedMotivation = motivation.trim();
    if (trimmedMotivation.length > MOTIVATION_MAX) {
      setError(format(t.motivationTooLong, { max: MOTIVATION_MAX }));
      return;
    }

    const trimmedPortfolio = portfolioUrl.trim();
    if (trimmedPortfolio) {
      try {
        // Valide l'URL côté client avant l'envoi (l'API revalide).
        new URL(trimmedPortfolio);
      } catch {
        setError(t.invalidUrl);
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/demandes/caster-application', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          motivation: trimmedMotivation || undefined,
          portfolioUrl: trimmedPortfolio || undefined,
        }),
      });

      const data = await res.json().catch(() => null);

      if (res.status === 409) {
        const code = data?.code;
        if (code === 'ALREADY_STAFF') {
          addToast(t.alreadyStaff, 'info');
        } else if (code === 'ALREADY_PENDING') {
          addToast(t.alreadyPending, 'info');
          // Reflète l'état côté UI si on ne l'avait pas encore.
          if (data?.application) setApplication(data.application);
        } else {
          addToast((data?.error as string) || t.alreadyExists, 'info');
        }
        return;
      }

      if (!res.ok || !data?.application) {
        throw new Error((data?.error as string) || t.sendFailed);
      }

      setApplication(data.application as CasterApplication);
      setMotivation('');
      setPortfolioUrl('');
      addToast(t.applicationSent, 'success');
    } catch (err: unknown) {
      setError((err as Error).message || t.genericError);
      addToast((err as Error).message || t.genericError, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || loading) {
    return <PlayerPageSkeleton rows={3} />;
  }

  if (!user) {
    return null;
  }

  // Sur échec de chargement du statut, on masque le formulaire (il serait
  // trompeur) et on affiche une bannière d'erreur avec retry à la place.
  const showForm =
    !loadError && (!application || application.status === 'rejected');

  return (
    <>
      <Head>
        <title>{t.headTitle}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
        <main className="max-w-2xl mx-auto px-4 py-10 pt-24">
          <Link
            href="/player"
            className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-6"
          >
            &larr; {t.backToSpace}
          </Link>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl leading-none" aria-hidden="true">
                🎙️
              </span>
              <h1 className="text-2xl font-bold">{t.pageTitle}</h1>
            </div>
            <p className="text-gray-400 text-sm mb-6">{t.intro}</p>

            {/* Erreur de chargement du statut : ne pas montrer un formulaire vierge. */}
            {loadError && (
              <div
                role="alert"
                aria-live="assertive"
                className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100"
              >
                <span>{loadError}</span>
                <button
                  type="button"
                  onClick={() => void loadApplication()}
                  className="rounded-full border border-red-300/40 px-3 py-1 text-xs font-semibold text-red-100 transition hover:bg-red-500/20"
                >
                  {t.retry}
                </button>
              </div>
            )}

            {/* Statut de la candidature existante */}
            {!loadError && application && (
              <StatusBanner application={application} />
            )}

            {showForm && (
              <form onSubmit={handleSubmit} className="space-y-6">
                {application?.status === 'rejected' && (
                  <p className="text-sm text-gray-400">{t.canResubmit}</p>
                )}

                {/* Motivation */}
                <div>
                  <label
                    htmlFor="motivation"
                    className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2"
                  >
                    {t.motivationLabel}
                  </label>
                  <textarea
                    id="motivation"
                    value={motivation}
                    onChange={(e) => setMotivation(e.target.value)}
                    rows={5}
                    maxLength={MOTIVATION_MAX}
                    className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/80 transition resize-none"
                    placeholder={t.motivationPlaceholder}
                  />
                  <div className="mt-1 text-right text-xs text-gray-500">
                    {motivation.length}/{MOTIVATION_MAX}
                  </div>
                </div>

                {/* Portfolio / Twitch */}
                <div>
                  <label
                    htmlFor="portfolioUrl"
                    className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2"
                  >
                    {t.portfolioLabel}
                  </label>
                  <input
                    id="portfolioUrl"
                    type="url"
                    inputMode="url"
                    value={portfolioUrl}
                    onChange={(e) => setPortfolioUrl(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/80 transition"
                    placeholder={t.portfolioPlaceholder}
                  />
                </div>

                {error && (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100"
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className={`w-full px-4 py-3 rounded-xl font-semibold transition ${
                    submitting
                      ? 'bg-gray-600 cursor-not-allowed'
                      : 'bg-gradient-to-r from-cyan-500 to-fuchsia-500 hover:from-cyan-400 hover:to-fuchsia-400'
                  }`}
                >
                  {submitting
                    ? t.sending
                    : application?.status === 'rejected'
                      ? t.resubmit
                      : t.submit}
                </button>
              </form>
            )}
          </div>

          <div className="mt-6 text-center text-sm text-gray-500">
            <p>{t.footer}</p>
          </div>
        </main>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Bannière de statut                                                 */
/* ------------------------------------------------------------------ */

function StatusBanner({ application }: { application: CasterApplication }) {
  const t = useT('casterApplication');
  const locale = useLocale();
  const created = new Date(application.created_at).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  if (application.status === 'pending') {
    return (
      <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-4 text-sm text-amber-100">
        <p className="font-semibold mb-1">{t.pendingTitle}</p>
        <p>{format(t.pendingText, { date: created })}</p>
      </div>
    );
  }

  if (application.status === 'approved') {
    return (
      <div className="mb-6 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-4 text-sm text-emerald-100">
        <p className="font-semibold mb-1">{t.approvedTitle}</p>
        <p>{t.approvedText}</p>
        {application.comment && (
          <p className="mt-2 text-emerald-200/80">{application.comment}</p>
        )}
      </div>
    );
  }

  // rejected
  return (
    <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-4 text-sm text-red-100">
      <p className="font-semibold mb-1">{t.rejectedTitle}</p>
      <p>{t.rejectedText}</p>
      {application.comment && (
        <p className="mt-2 text-red-200/80">{application.comment}</p>
      )}
    </div>
  );
}

const casterApplicationSeo: SeoProps = {
  title: {
    fr: 'Candidature caster',
    en: 'Caster application',
  },
  description: {
    fr: "Postule pour devenir casteuse sur l'OW Women's Cup.",
    en: "Apply to become a caster for OW Women's Cup.",
  },
  noindex: true,
};

CasterApplicationPage.seo = casterApplicationSeo;
