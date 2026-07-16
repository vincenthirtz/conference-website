import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { supabaseClient } from '@/utils/supabase';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { useT } from '@/lib/i18n/useT';

/**
 * Consommateur du magic-link « accès espace équipe » émis après création d'une
 * équipe (cf. contrat §2). Modelé sur pages/admin/reset-password.tsx : on établit
 * la session via verifyOtp(token_hash) — sans dépendre d'un code_verifier PKCE,
 * absent quand le lien est généré côté serveur (admin.generateLink) — puis on
 * redirige vers l'espace joueur.
 */

/** Valide que `next` est un chemin interne sûr commençant par /player. */
function safeNext(raw: unknown): string {
  if (typeof raw !== 'string') return '/player/manage-team';
  // Refuse les URLs absolues / protocol-relative (open-redirect).
  if (!raw.startsWith('/player') || raw.startsWith('//')) {
    return '/player/manage-team';
  }
  return raw;
}

export default function TeamAccessPage() {
  const router = useRouter();
  const t = useT('teamAccess');
  const [ready, setReady] = useState(false);
  const [established, setEstablished] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady) return;

    async function initSession() {
      let ok = false;
      let msg: string | null = null;

      const tokenHash = router.query.token_hash as string | undefined;
      const code = router.query.code as string | undefined;

      if (tokenHash) {
        // Flow recommandé : ?token_hash=…&type=magiclink → verifyOtp.
        const { data, error } = await supabaseClient.auth.verifyOtp({
          type: 'magiclink',
          token_hash: tokenHash,
        });
        if (error) {
          msg = error.message || t.errorInvalidLink;
        } else {
          ok = !!data?.session;
        }
      } else if (code) {
        // Fallback PKCE : ?code=xxx
        const { data, error } =
          await supabaseClient.auth.exchangeCodeForSession(code);
        if (error) {
          msg = error.message || t.errorCodeInvalid;
        } else {
          ok = !!data?.session;
        }
      } else if (typeof window !== 'undefined') {
        // Fallback implicite legacy : tokens (ou erreur) dans le hash fragment.
        const params = new URLSearchParams(
          window.location.hash.replace(/^#/, '')
        );
        const errDesc = params.get('error_description');
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');
        if (errDesc) {
          msg = decodeURIComponent(errDesc);
        } else if (access_token && refresh_token) {
          const { data, error } = await supabaseClient.auth.setSession({
            access_token,
            refresh_token,
          });
          if (error) {
            msg = error.message || t.errorRestoreSession;
          } else {
            ok = !!data?.session;
          }
        }
      }

      // Session déjà active (cookie) ?
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

    initSession();
  }, [router.isReady, router.query.token_hash, router.query.code, router, t]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-surface-black to-black text-white">
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <main className="flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md">
          <div className="mb-8 flex flex-col items-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-gray-300">
              <span className="rounded-full bg-gradient-to-r from-[var(--color-violet)] to-[var(--color-green)] px-1.5 py-[2px] font-semibold text-white">
                {t.badgeTeam}
              </span>
              <span>{t.badgeAction}</span>
            </div>

            <h1 className="mt-4 text-center text-3xl font-bold text-gradient">
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

const teamAccessSeo: SeoProps = {
  title: {
    fr: 'Accès espace équipe',
    en: 'Team space access',
  },
  description: {
    fr: 'Validation de ton lien de connexion pour accéder à ton espace équipe.',
    en: 'Validating your sign-in link to access your team space.',
  },
  noindex: true,
};

TeamAccessPage.seo = teamAccessSeo;
