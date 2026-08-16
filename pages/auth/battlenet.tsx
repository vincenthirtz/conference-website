// pages/auth/battlenet.tsx
//
// Consommateur du magic-link émis par la CONNEXION Battle.net
// (/api/auth/battlenet/callback, branche `purpose: 'login'`).
//
// Même mécanique que /auth/team-access : le lien est généré côté serveur via
// `admin.generateLink`, donc sans `code_verifier` PKCE — on établit la session
// avec `verifyOtp(token_hash)` puis on redirige vers `next`.
//
// Cette page ne décide rien : si le token est absent/expiré, elle renvoie vers
// /login. Elle ne crée jamais de compte (le callback a déjà refusé un compte
// Blizzard non lié).

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { supabaseClient } from '@/utils/supabase';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { useT } from '@/lib/i18n/useT';
import nsBattlenetLogin from '@/lib/i18n/locales/fr/battlenetLogin';

/** N'accepte qu'un chemin interne relatif (anti open-redirect). */
function safeNext(raw: unknown): string {
  if (typeof raw !== 'string') return '/player';
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) {
    return '/player';
  }
  return raw;
}

export default function BattlenetLoginPage() {
  const router = useRouter();
  const t = useT(nsBattlenetLogin);
  const [ready, setReady] = useState(false);
  const [established, setEstablished] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady) return;

    async function initSession() {
      const tokenHash = router.query.token_hash as string | undefined;
      let ok = false;
      let msg: string | null = null;

      if (tokenHash) {
        const { data, error } = await supabaseClient.auth.verifyOtp({
          type: 'magiclink',
          token_hash: tokenHash,
        });
        if (error) msg = error.message || t.errorInvalidLink;
        else ok = !!data?.session;
      }

      // Session déjà active (retour arrière, double clic) : on n'échoue pas.
      if (!ok) {
        const { data } = await supabaseClient.auth.getSession();
        if (data?.session) ok = true;
      }

      if (ok) {
        setEstablished(true);
        setReady(true);
        router.replace(safeNext(router.query.next));
        return;
      }

      setErrorMsg(msg || t.errorNoSession);
      setEstablished(false);
      setReady(true);
    }

    void initSession();
  }, [router.isReady, router.query.token_hash, router, t]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-surface-black to-black text-white">
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <main className="flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md">
          <div className="mb-8 flex flex-col items-center">
            <h1 className="text-center text-3xl font-bold text-gradient">
              {t.heading}
            </h1>
            <p className="mt-2 max-w-sm text-center text-sm text-gray-300">
              {t.intro}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl shadow-black/40 backdrop-blur-xl">
            {!ready || established ? (
              <div className="flex items-center gap-3 text-sm text-neutral-300">
                <span
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/30 border-t-white"
                />
                {established ? t.redirecting : t.loadingSession}
              </div>
            ) : (
              <div className="space-y-4">
                <div
                  role="alert"
                  className="rounded-xl border border-[var(--status-error)]/40 bg-[var(--status-error)]/10 px-3 py-3 text-sm text-red-100"
                >
                  {errorMsg || t.errorInvalidLink}
                </div>
                <p className="text-xs text-gray-400">{t.singleUseNote}</p>
                <Link
                  href="/login"
                  className="block w-full rounded-xl bg-[var(--color-violet)] py-2 text-center text-sm font-semibold text-white transition hover:brightness-110"
                >
                  {t.backToLogin}
                </Link>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

const battlenetLoginSeo: SeoProps = {
  title: {
    fr: 'Connexion Battle.net',
    en: 'Battle.net sign-in',
  },
  description: {
    fr: 'Validation de ta connexion Battle.net.',
    en: 'Validating your Battle.net sign-in.',
  },
  noindex: true,
};

BattlenetLoginPage.seo = battlenetLoginSeo;
