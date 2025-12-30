 
import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';

import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import Button from '@/components/Buttons/button';
import { supabaseClient } from '@/utils/supabase';

const AdminLoginPage = () => {
  const router = useRouter();

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

        const res = await fetch('/api/admin/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const me = await res.json().catch(() => null);

        if (res.ok && me?.role) {
          router.replace('/admin');
          return;
        }

        if (res.status === 401 || res.status === 403) {
          await supabaseClient.auth.signOut();
          if (!cancelled) {
            setError(
              "Ton compte n'a pas d'accès staff. Contacte un admin si c'est une erreur."
            );
          }
        }
      } catch (err) {
        console.error('[staff login] session check error:', err);
      } finally {
        if (!cancelled) setIsCheckingSession(false);
      }
    };
    checkExistingSession();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const { data, error: authError } =
        await supabaseClient.auth.signInWithPassword({ email, password });

      if (authError) {
        setError('Email ou mot de passe incorrect.');
        return;
      }

      const {
        data: { session },
      } = await supabaseClient.auth.getSession();

      if (!session?.access_token) {
        setError('Impossible de récupérer la session.');
        return;
      }

      const res = await fetch('/api/admin/me', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const me = await res.json().catch(() => null);

      if (!res.ok || me?.error) {
        if (res.status === 401 || res.status === 403) {
          await supabaseClient.auth.signOut();
        }

        throw new Error(
          me?.error ||
            (res.status === 401
              ? 'Session expirée. Merci de te reconnecter.'
              : res.status === 403
                ? "Ton compte n'a pas d'accès staff."
                : 'Impossible de vérifier ton rôle staff.')
        );
      }

      if (!me?.role) {
        await supabaseClient.auth.signOut();
        setError("Ton compte n'a pas d'accès staff.");
        return;
      }

      if (data?.user) {
        await router.push('/admin');
      } else {
        setError('Utilisateur non trouvé après la connexion.');
      }
    } catch (err: any) {
      console.error('[staff login] error:', err);
      setError(
        err?.message ||
          'Une erreur est survenue pendant la connexion. Réessaie dans un instant.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDiscordLogin = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      const redirectTo =
        typeof window !== 'undefined'
          ? `${window.location.origin}/admin`
          : undefined;

      const { error: oauthError } = await supabaseClient.auth.signInWithOAuth({
        provider: 'discord',
        options: {
          redirectTo,
          scopes: 'identify email',
        },
      });

      if (oauthError) {
        throw new Error(
          oauthError.message || 'Connexion Discord impossible pour le moment.'
        );
      }
    } catch (err: any) {
      console.error('[staff login] discord error:', err);
      setError(
        err?.message ||
          'Une erreur est survenue avec Discord. Réessaie dans un instant.'
      );
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <Head>
        <title>Connexion | OW Women&apos;s Cup</title>
      </Head>

      <main className="flex items-center justify-center px-4 py-20 md:py-10">
        <div className="w-full max-w-md">
          {/* Logo / titre */}
          <div className="flex flex-col items-center mb-8">
            <Heading
              typeStyle="heading-md"
              className="text-gradient text-center mt-4"
            >
              Connexion
            </Heading>

            <Paragraph
              typeStyle="body-sm"
              className="mt-2 text-center max-w-sm"
              textColor="text-gray-300"
            >
              Accès réservé aux organisateur·rices, admins et bénévoles de la OW
              Women&apos;s Cup.
            </Paragraph>
          </div>

          {/* Carte de login */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl shadow-2xl shadow-black/40 p-6 pt-10">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400/80 focus:border-purple-400/80 transition"
                  placeholder="prenom.nom@organisation.tld"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2"
                >
                  Mot de passe
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
                  <span>Se souvenir de moi</span>
                </label>

                <Link
                  href="/admin/forgot-password"
                  className="text-xs text-purple-300 hover:text-purple-200 hover:underline"
                >
                  Mot de passe oublié ?
                </Link>
              </div>

              {error && (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                  {error}
                </div>
              )}

              <div className="pt-2 space-y-3">
                <Button
                  type="submit"
                  className="w-full justify-center px-4 py-2 text-sm font-medium bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 border-0 shadow-lg shadow-purple-900/40"
                  disabled={isSubmitting || isCheckingSession}
                >
                  {isSubmitting ? 'Connexion en cours…' : 'Se connecter'}
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
                    <span>Continuer avec Discord</span>
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
                Besoin d&apos;un accès staff ?{' '}
                <span className="text-gray-200">
                  Contacte l&apos;équipe à owwomenscup@gmail.com.
                </span>
                {'  '}
                <Link
                  href="/register"
                  className="text-purple-300 hover:text-purple-200 underline ml-1"
                >
                  Créer mon compte
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
              ← Retour au site public
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AdminLoginPage;
