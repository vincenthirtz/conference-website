import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';

import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import Button from '@/components/Buttons/button';
import { supabaseClient, purgeSupabaseAuthStorage } from '@/utils/supabase';
import { STAFF_CACHE_KEY } from '@/hooks/useStaffSession';
import { useSiteSetting } from '@/hooks/useSiteSettings';
import { useT } from '@/lib/i18n/useT';
import type { SeoProps } from '@/components/Seo/DefaultSeo';

import { logger } from '../utils/logger';

// Valide une cible de redirection pour éviter les open redirects : on
// n'accepte que les chemins internes (commence par '/' mais pas par '//',
// qui serait un lien protocol-relative vers un domaine externe).
// Même règle que pages/auth/discord-member.tsx.
function safeNext(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  return raw.startsWith('/') && !raw.startsWith('//') ? raw : null;
}

// Amorce le cache de session staff (même clé/shape que useStaffSession) à
// partir de la réponse /api/admin/me déjà obtenue au login. Évite que la
// navbar refasse un /api/admin/me sur la première page admin après connexion.
function primeStaffCache(me: {
  role?: string;
  display_name?: string;
  email?: string;
}) {
  if (typeof window === 'undefined' || !me?.role) return;
  try {
    sessionStorage.setItem(
      STAFF_CACHE_KEY,
      JSON.stringify({
        isStaff: true,
        staffName: me.display_name || me.email || 'Staff',
        staffRole: me.role,
        ts: Date.now(),
      })
    );
  } catch {}
}

const LoginPage = () => {
  const router = useRouter();
  const t = useT('loginPage');
  const { value: contactEmail } = useSiteSetting('contact_email');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const checkExistingSession = async () => {
      try {
        const {
          data: { session },
        } = await supabaseClient.auth.getSession();

        const token = session?.access_token;
        if (!token) {
          return;
        }

        // Vérifier si l'utilisateur est staff
        const res = await fetch('/api/admin/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const me = await res.json().catch(() => null);

        const next = safeNext(router.query.next);

        if (res.ok && me?.role) {
          router.replace(
            next ?? (me.role === 'captain' ? '/player' : '/admin')
          );
          return;
        }

        // Pas staff mais session valide → joueur, rediriger vers le panel joueur
        if (res.status === 403) {
          router.replace(next ?? '/player');
          return;
        }

        if (res.status === 401) {
          await supabaseClient.auth
            .signOut({ scope: 'local' })
            .catch(() => {});
          purgeSupabaseAuthStorage();
          if (!cancelled) {
            setError(t.errorInvalidCredentials);
          }
        }
      } catch (err) {
        // Session locale corrompue/périmée : on la purge pour repartir propre
        // (évite le « ça remarche en changeant de navigateur »).
        logger.error('[login] session check error:', err);
        purgeSupabaseAuthStorage();
      } finally {
        if (!cancelled) setIsCheckingSession(false);
      }
    };
    checkExistingSession();
    return () => {
      cancelled = true;
    };
  }, [router, t]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const { data, error: authError } =
        await supabaseClient.auth.signInWithPassword({ email, password });

      if (authError) {
        setError(t.errorInvalidCredentials);
        return;
      }

      const token = data.session?.access_token;
      if (!token) {
        setError(t.errorNoSession);
        return;
      }

      const res = await fetch('/api/admin/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const me = await res.json().catch(() => null);

      const next = safeNext(router.query.next);

      if (res.ok && me?.role) {
        // ?next= valide prioritaire, sinon Captain → panel joueur, Staff → admin
        const target = next ?? (me.role === 'captain' ? '/player' : '/admin');
        // Rôle staff (owner/admin/manager/caster) → on amorce le cache pour que
        // la navbar n'ait pas à revalider le staff sur la première page admin.
        if (me.role !== 'captain') primeStaffCache(me);
        await router.push(target);
        return;
      }

      if (res.status === 403) {
        // Pas staff mais authentifié → joueur, rediriger vers le panel joueur
        await router.push(next ?? '/player');
        return;
      }

      if (res.status === 401) {
        await supabaseClient.auth.signOut({ scope: 'local' }).catch(() => {});
        purgeSupabaseAuthStorage();
        throw new Error(t.errorInvalidCredentials);
      }

      if (!data?.user) {
        setError(t.errorUserNotFound);
      }
    } catch (err: unknown) {
      logger.error('[login] error:', err);
      // On n'expose jamais le message brut (souvent en anglais) à l'écran.
      setError(t.errorGeneric);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDiscordLogin = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') ||
        (typeof window !== 'undefined' ? window.location.origin : '');
      // ?next= valide propagé jusqu'au retour OAuth ; sinon /admin (le routage
      // par rôle de discord-member renverra une joueuse vers /player).
      const next = safeNext(router.query.next) ?? '/admin';
      const redirectTo = baseUrl
        ? `${baseUrl}/auth/discord-member?next=${encodeURIComponent(next)}`
        : undefined;

      const { error: oauthError } = await supabaseClient.auth.signInWithOAuth({
        provider: 'discord',
        options: {
          redirectTo,
          scopes: 'identify email',
        },
      });

      if (oauthError) {
        throw new Error(oauthError.message || t.errorDiscordUnavailable);
      }
    } catch (err: unknown) {
      logger.error('[login] discord error:', err);
      setError((err as Error)?.message || t.errorDiscordGeneric);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <Head>
        <title>{t.headTitle}</title>
      </Head>

      <main className="flex items-center justify-center px-4 pt-28 pb-20 md:pt-24 md:pb-10">
        <div className="w-full max-w-md">
          {/* Logo / titre */}
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

          {isCheckingSession ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-neutral-600 border-t-purple-400 rounded-full animate-spin mb-4" />
              <p className="text-sm text-gray-400">{t.checkingSession}</p>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl shadow-2xl shadow-black/40 p-6 pt-10">
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
                      className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400/80 focus:border-purple-400/80 transition"
                      placeholder={t.emailPlaceholder}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="password"
                      className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2"
                    >
                      {t.passwordLabel}
                    </label>
                    <input
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400/80 focus:border-purple-400/80 transition"
                      placeholder="••••••••"
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs text-gray-300">
                    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                      <span className="relative inline-flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={rememberMe}
                          onChange={(e) => setRememberMe(e.target.checked)}
                          className="peer sr-only"
                        />
                        <span className="w-4 h-4 rounded-[6px] border border-white/25 bg-black/60 peer-checked:bg-gradient-to-tr peer-checked:from-purple-500 peer-checked:to-pink-500 peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-purple-400/80 transition" />
                        <span className="absolute inset-0 flex items-center justify-center opacity-0 peer-checked:opacity-100 transition">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="w-3 h-3 text-black"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.704 5.29a1 1 0 00-1.408-1.42L8.002 11.17 4.7 7.87a1 1 0 10-1.4 1.43l4.003 3.997a1.5 1.5 0 002.123 0l7.278-7.007z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </span>
                      </span>
                      <span>{t.rememberMe}</span>
                    </label>

                    <Link
                      href="/admin/forgot-password"
                      className="text-xs text-purple-300 hover:text-purple-200 hover:underline"
                    >
                      {t.forgotPassword}
                    </Link>
                  </div>

                  {error && (
                    <div
                      role="alert"
                      aria-live="assertive"
                      className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-100"
                    >
                      {error}
                    </div>
                  )}

                  <div className="pt-2 space-y-3">
                    <Button
                      type="submit"
                      className="w-full justify-center px-4 py-2 text-sm font-medium bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 border-0 shadow-lg shadow-purple-900/40"
                      disabled={isSubmitting || isCheckingSession}
                    >
                      {isSubmitting ? t.submitting : t.submit}
                    </Button>
                    <button
                      type="button"
                      onClick={handleDiscordLogin}
                      disabled={isSubmitting || isCheckingSession}
                      className="w-full justify-center px-4 py-2 text-sm font-semibold rounded-xl border border-white/15 bg-black/50 hover:border-indigo-300/70 hover:text-indigo-100 transition flex items-center gap-2"
                    >
                      <span className="inline-flex items-center gap-2">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 245 240"
                          className="h-5 w-5"
                          aria-hidden
                        >
                          <path
                            d="M104.4 104.5c-5.7 0-10.2 5-10.2 11.1 0 6.1 4.6 11.1 10.2 11.1 5.7 0 10.2-5 10.2-11.1.1-6.1-4.5-11.1-10.2-11.1zm36.2 0c-5.7 0-10.2 5-10.2 11.1 0 6.1 4.6 11.1 10.2 11.1 5.7 0 10.2-5 10.2-11.1s-4.5-11.1-10.2-11.1z"
                            fill="currentColor"
                          />
                          <path
                            d="M189.5 20h-134C44.2 20 34 30.2 34 42.8v130.9c0 12.7 10.2 22.8 21.5 22.8h113l-5.3-18.5 12.8 11.9 12.1 11.2 21.5 19V42.8c0-12.6-10.2-22.8-21.6-22.8zm-38.6 135.2s-3.6-4.3-6.6-8.1c13.1-3.7 18.1-11.9 18.1-11.9-4.1 2.7-8 4.6-11.5 5.9-5 2.1-9.8 3.4-14.5 4.3-9.6 1.8-18.4 1.3-25.9-.1-5.7-1.1-10.6-2.6-14.7-4.3-2.3-.9-4.8-2-7.3-3.4-.3-.2-.6-.3-.9-.5-.2-.1-.3-.2-.4-.3-1.8-1-2.8-1.7-2.8-1.7s4.8 8 17.5 11.8c-3 3.8-6.7 8.3-6.7 8.3-22.1-.7-30.5-15.2-30.5-15.2 0-32.2 14.4-58.4 14.4-58.4 14.4-10.8 28-10.5 28-10.5l1 1.2c-18 5.2-26.3 13.1-26.3 13.1s2.2-1.2 5.9-2.8c10.7-4.7 19.2-6 22.7-6.3.6-.1 1.1-.2 1.7-.2 6.1-.8 13-1 20.2-.2 9.5 1.1 19.7 3.9 30.1 9.6 0 0-7.9-7.5-24.9-12.7l1.4-1.6s13.7-.3 28 10.5c0 0 14.4 26.2 14.4 58.4-.1 0-8.5 14.5-30.6 15.2z"
                            fill="currentColor"
                          />
                        </svg>
                        <span>{t.continueWithDiscord}</span>
                      </span>
                    </button>
                  </div>
                </form>

                <div className="mt-4 border-t border-white/5 pt-3">
                  <Paragraph
                    typeStyle="body-sm"
                    textColor="text-gray-400"
                    className="text-center"
                  >
                    {t.noAccount}{' '}
                    <Link
                      href="/register"
                      className="text-purple-300 hover:text-purple-200 underline"
                    >
                      {t.createAccount}
                    </Link>
                  </Paragraph>
                </div>
              </div>

              {/* Lien retour site public */}
              <div className="mt-6 text-center">
                <Link
                  href="/"
                  className="text-xs text-gray-400 hover:text-gray-200 hover:underline"
                >
                  {t.backToPublic}
                </Link>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

const loginSeo: SeoProps = {
  title: {
    fr: 'Connexion',
    en: 'Sign in',
  },
  description: {
    fr: "Connecte-toi à ton espace OW Women's Cup : panel joueuse, gestion d'équipe ou administration staff.",
    en: "Sign in to your OW Women's Cup space: player panel, team management or staff administration.",
  },
};

LoginPage.seo = loginSeo;

export default LoginPage;
