// /onboard/check-email?id=<requestId>
//
// Lightweight confirmation/wait page shown right after submission. Polls
// /api/onboard/status/[id] every 5s : as soon as the user clicks the email
// link the status flips to `pending_bot_invite` and we redirect to the bot
// invite page.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { useT } from '@/lib/i18n/useT';

type StatusResp = {
  id: string;
  status: string;
  requestedSlug: string;
  requestedName: string;
};

const POLL_INTERVAL_MS = 5000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function OnboardCheckEmailPage() {
  const t = useT('onboardCheckEmail');
  const router = useRouter();
  const rawId = router.query.id;
  const id = typeof rawId === 'string' ? rawId : undefined;

  const [polling, setPolling] = useState(false);
  const [unreachable, setUnreachable] = useState(false);
  const stoppedRef = useRef(false);

  useEffect(() => {
    if (!router.isReady) return;
    if (!id || !UUID_RE.test(id)) {
      setUnreachable(true);
      return;
    }

    stoppedRef.current = false;
    setPolling(true);

    const tick = async () => {
      if (stoppedRef.current) return;
      try {
        const res = await fetch(`/api/onboard/status/${id}`, {
          credentials: 'include',
        });
        if (res.status === 401) {
          // User not signed in for this status route — keep polling silent.
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as StatusResp;

        if (
          data.status === 'pending_bot_invite' ||
          data.status === 'completed'
        ) {
          stoppedRef.current = true;
          // Both states are best served by the invite-bot page (which itself
          // routes to /onboard/secrets/<token> when status === completed and
          // the reveal token is still available).
          router.replace(`/onboard/invite-bot/${id}`);
        }
      } catch {
        // Network blip — swallow and let the next tick try again.
      }
    };

    tick();
    const handle = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      stoppedRef.current = true;
      window.clearInterval(handle);
      setPolling(false);
    };
  }, [router, router.isReady, id]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <main className="px-4 pt-28 pb-20 md:pt-32 flex items-center justify-center">
        <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-6 md:p-8 shadow-2xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-emerald-900/30 flex items-center justify-center text-emerald-300">
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-white">
                {t.title}
              </h1>
              <p className="text-xs text-gray-400">{t.step}</p>
            </div>
          </div>

          <p className="text-sm text-gray-300 leading-relaxed mb-3">{t.body}</p>
          <p className="text-xs text-gray-400 mb-5">{t.spamNote}</p>

          {unreachable ? (
            <div
              className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100"
              role="alert"
            >
              {t.unreachable}{' '}
              <Link
                href="/onboard/request"
                className="underline hover:no-underline"
              >
                {t.restart}
              </Link>
              .
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-gray-300 flex items-center gap-2">
              {polling && (
                <span
                  className="inline-block h-3 w-3 rounded-full border-2 border-white/30 border-t-white animate-spin"
                  aria-hidden
                />
              )}
              <span>{t.polling}</span>
            </div>
          )}

          <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
              {t.lostEmailTitle}
            </h2>
            <p className="text-xs text-gray-300">
              {t.lostEmailBody}{' '}
              <a
                href="https://discord.gg/gERSsjC3Vd"
                target="_blank"
                rel="noreferrer noopener"
                className="text-purple-300 hover:text-purple-200"
              >
                {t.ourDiscord}
              </a>
              .
            </p>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-400">
            <Link href="/onboard" className="hover:text-white">
              {t.backToIntro}
            </Link>
            {id && (
              <span className="text-[10px] text-gray-600 font-mono">
                id: {id.slice(0, 8)}…
              </span>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

const onboardCheckEmailSeo: SeoProps = {
  title: 'Confirmez votre demande par email',
  description:
    "Étape 2 de l'onboarding : confirmez votre demande en cliquant sur le lien envoyé par email.",
  noindex: true,
};

OnboardCheckEmailPage.seo = onboardCheckEmailSeo;

export default OnboardCheckEmailPage;
