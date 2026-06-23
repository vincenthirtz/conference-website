// pages/player/caster-application.tsx
// Page pour candidater au cast (devenir casteuse) depuis l'espace joueuse.

import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useToast } from '@/components/Toast';
import { PlayerPageSkeleton } from '@/components/player/Skeletons';

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

  const [loading, setLoading] = useState(true);
  const [application, setApplication] = useState<CasterApplication | null>(null);

  const [motivation, setMotivation] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Charge la candidature existante au montage.
  useEffect(() => {
    if (!ready || !token) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch('/api/demandes/caster-application', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setApplication(data.application ?? null);
        }
      } catch (err) {
        logger.error('[caster-application] load error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedMotivation = motivation.trim();
    if (trimmedMotivation.length > MOTIVATION_MAX) {
      setError(`La motivation ne peut pas dépasser ${MOTIVATION_MAX} caractères.`);
      return;
    }

    const trimmedPortfolio = portfolioUrl.trim();
    if (trimmedPortfolio) {
      try {
        // Valide l'URL côté client avant l'envoi (l'API revalide).
        new URL(trimmedPortfolio);
      } catch {
        setError('Le lien doit être une URL valide (https://...).');
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
          addToast('Tu fais déjà partie du staff.', 'info');
        } else if (code === 'ALREADY_PENDING') {
          addToast(
            'Tu as déjà une demande en cours d’examen.',
            'info'
          );
          // Reflète l'état côté UI si on ne l'avait pas encore.
          if (data?.application) setApplication(data.application);
        } else {
          addToast(
            (data?.error as string) || 'Demande déjà existante.',
            'info'
          );
        }
        return;
      }

      if (!res.ok || !data?.application) {
        throw new Error(
          (data?.error as string) || 'Impossible d’envoyer ta candidature.'
        );
      }

      setApplication(data.application as CasterApplication);
      setMotivation('');
      setPortfolioUrl('');
      addToast('Ta candidature au cast a bien été envoyée !', 'success');
    } catch (err: unknown) {
      setError((err as Error).message || 'Une erreur est survenue.');
      addToast(
        (err as Error).message || 'Une erreur est survenue.',
        'error'
      );
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

  const showForm = !application || application.status === 'rejected';

  return (
    <>
      <Head>
        <title>Rejoindre le cast | OW Women&apos;s Cup</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
        <main className="max-w-2xl mx-auto px-4 py-10 pt-24">
          <Link
            href="/player"
            className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-6"
          >
            &larr; Retour a mon espace
          </Link>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <span
                className="text-2xl leading-none"
                aria-hidden="true"
              >
                🎙️
              </span>
              <h1 className="text-2xl font-bold">Rejoindre le cast</h1>
            </div>
            <p className="text-gray-400 text-sm mb-6">
              Tu veux caster nos matchs en live ? Présente ta motivation et
              partage un lien vers tes casts ou ta chaîne Twitch. L&apos;équipe
              casting étudiera ta candidature.
            </p>

            {/* Statut de la candidature existante */}
            {application && (
              <StatusBanner application={application} />
            )}

            {showForm && (
              <form onSubmit={handleSubmit} className="space-y-6">
                {application?.status === 'rejected' && (
                  <p className="text-sm text-gray-400">
                    Tu peux soumettre une nouvelle candidature ci-dessous.
                  </p>
                )}

                {/* Motivation */}
                <div>
                  <label
                    htmlFor="motivation"
                    className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2"
                  >
                    Motivation (optionnel)
                  </label>
                  <textarea
                    id="motivation"
                    value={motivation}
                    onChange={(e) => setMotivation(e.target.value)}
                    rows={5}
                    maxLength={MOTIVATION_MAX}
                    className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/80 transition resize-none"
                    placeholder="Parle-nous de ton expérience, ton style, pourquoi tu veux caster..."
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
                    Lien portfolio / Twitch (optionnel)
                  </label>
                  <input
                    id="portfolioUrl"
                    type="url"
                    inputMode="url"
                    value={portfolioUrl}
                    onChange={(e) => setPortfolioUrl(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/80 transition"
                    placeholder="https://twitch.tv/ta-chaine"
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
                    ? 'Envoi en cours...'
                    : application?.status === 'rejected'
                      ? 'Re-soumettre ma candidature'
                      : 'Envoyer ma candidature'}
                </button>
              </form>
            )}
          </div>

          <div className="mt-6 text-center text-sm text-gray-500">
            <p>
              Le casting est ouvert à toutes : pas besoin d&apos;expérience pro,
              juste de l&apos;envie et de la disponibilité sur nos créneaux de
              stream.
            </p>
          </div>
        </main>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Bannière de statut                                                 */
/* ------------------------------------------------------------------ */

function StatusBanner({
  application,
}: {
  application: CasterApplication;
}) {
  const created = new Date(application.created_at).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  if (application.status === 'pending') {
    return (
      <div className="mb-6 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-4 text-sm text-amber-100">
        <p className="font-semibold mb-1">Demande en cours d&apos;examen</p>
        <p>
          Ta candidature au cast a été envoyée le {created}. L&apos;équipe
          casting reviendra vers toi prochainement.
        </p>
      </div>
    );
  }

  if (application.status === 'approved') {
    return (
      <div className="mb-6 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-4 text-sm text-emerald-100">
        <p className="font-semibold mb-1">Bienvenue dans le cast ! 🎉</p>
        <p>
          Ta candidature a été acceptée. Tu fais désormais partie de
          l&apos;équipe casting des OW Women&apos;s Cup.
        </p>
        {application.comment && (
          <p className="mt-2 text-emerald-200/80">{application.comment}</p>
        )}
      </div>
    );
  }

  // rejected
  return (
    <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-4 text-sm text-red-100">
      <p className="font-semibold mb-1">Demande non retenue</p>
      <p>
        Ta précédente candidature n&apos;a pas été retenue. Tu peux re-soumettre
        une demande quand tu le souhaites.
      </p>
      {application.comment && (
        <p className="mt-2 text-red-200/80">{application.comment}</p>
      )}
    </div>
  );
}
