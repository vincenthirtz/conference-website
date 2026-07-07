// pages/caster/login.tsx
//
// Feature: Run-of-show — Lot 4.
// Page publique : login par magic-link pour le Caster Cockpit PWA.
//
// Le caster entre son email, cliquera ensuite sur le lien recu par email pour
// arriver sur /caster/login/callback ou la session sera materialisee et
// validee contre cast_members.

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';

import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import Button from '@/components/Buttons/button';
import { supabaseClient } from '@/utils/supabase';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { logger } from '@/utils/logger';
import { useT } from '@/lib/i18n/useT';

type Stage = 'idle' | 'sending' | 'sent';

const CasterLoginPage = () => {
  const router = useRouter();
  const t = useT('casterLogin');

  const [email, setEmail] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  // Si l user a deja une session valide ET est lie a un cast_members actif,
  // on le redirige direct vers le cockpit.
  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      try {
        const {
          data: { session },
        } = await supabaseClient.auth.getSession();
        if (!session?.access_token) {
          if (!cancelled) setChecking(false);
          return;
        }
        const res = await fetch('/api/caster/me', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          router.replace('/caster/cockpit');
          return;
        }
      } catch (err) {
        logger.warn('[caster/login] probe error', err);
      } finally {
        if (!cancelled) setChecking(false);
      }
    };
    probe();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Messages d erreur transmis via querystring (par le callback).
  useEffect(() => {
    if (!router.isReady) return;
    const err = router.query.error;
    if (err === 'not_caster') {
      setErrorMsg(t.errNotCaster);
    } else if (err === 'no_session') {
      setErrorMsg(t.errNoSession);
    } else if (err === 'callback_error') {
      setErrorMsg(t.errCallback);
    }
  }, [router.isReady, router.query.error, t]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setErrorMsg(null);
      setInfo(null);

      const trimmed = email.trim();
      if (!trimmed) {
        setErrorMsg(t.errEmptyEmail);
        return;
      }

      setStage('sending');
      try {
        const res = await fetch('/api/caster/auth/magic-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: trimmed }),
        });
        // L API renvoie 200 generique meme si l email n existe pas, c est
        // voulu (anti-enumeration). On affiche un message neutre.
        if (!res.ok) {
          setStage('idle');
          setErrorMsg(t.errNetwork);
          return;
        }
        setStage('sent');
        setInfo(t.infoSent);
      } catch (err) {
        logger.error('[caster/login] submit error', err);
        setStage('idle');
        setErrorMsg(t.errNetwork);
      }
    },
    [email, t]
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <Head>
        <title>{t.docTitle}</title>
      </Head>

      <main className="flex items-center justify-center px-4 pt-28 pb-20 md:pt-24 md:pb-10">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center mb-8">
            <Heading
              typeStyle="heading-md"
              className="text-gradient text-center mt-4"
            >
              {t.title}
            </Heading>
            <Paragraph
              typeStyle="body-sm"
              className="mt-2 text-center max-w-sm"
              textColor="text-gray-300"
            >
              {t.subtitle}
            </Paragraph>
          </div>

          {checking ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-neutral-600 border-t-purple-400 rounded-full animate-spin mb-4" />
              <p className="text-sm text-gray-400">{t.checkingSession}</p>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl shadow-2xl shadow-black/40 p-6 pt-8">
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label
                      htmlFor="email"
                      className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2"
                    >
                      {t.emailLabel}
                    </label>
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={stage === 'sending' || stage === 'sent'}
                      className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400/80 focus:border-purple-400/80 transition disabled:opacity-60"
                      placeholder={t.emailPlaceholder}
                    />
                  </div>

                  {errorMsg && (
                    <div
                      role="alert"
                      aria-live="polite"
                      className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-100"
                    >
                      {errorMsg}
                    </div>
                  )}

                  {info && (
                    <div
                      role="status"
                      aria-live="polite"
                      className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-50"
                    >
                      {info}
                    </div>
                  )}

                  <div className="pt-2 space-y-3">
                    <Button
                      type="submit"
                      className="w-full justify-center px-4 py-2 text-sm font-medium bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 border-0 shadow-lg shadow-purple-900/40"
                      disabled={stage === 'sending'}
                    >
                      {stage === 'sending'
                        ? t.sending
                        : stage === 'sent'
                          ? t.sent
                          : t.sendLink}
                    </Button>
                    {stage === 'sent' && (
                      <Button
                        type="button"
                        className="w-full justify-center px-4 py-2 text-sm font-medium border border-white/15 bg-black/40 hover:bg-black/60"
                        onClick={() => {
                          setStage('idle');
                          setInfo(null);
                        }}
                      >
                        {t.resendLink}
                      </Button>
                    )}
                  </div>
                </form>
              </div>

              <div className="mt-6 text-center">
                <Link
                  href="/"
                  className="text-xs text-gray-400 hover:text-gray-200 hover:underline"
                >
                  {t.backToSite}
                </Link>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

const seo: SeoProps = {
  title: {
    fr: 'Connexion caster',
    en: 'Caster sign-in',
  },
  description: {
    fr: 'Acces au Cockpit caster — OW Women s Cup.',
    en: "Access to the caster cockpit — OW Women's Cup.",
  },
  noindex: true,
};

CasterLoginPage.seo = seo;

export default CasterLoginPage;
