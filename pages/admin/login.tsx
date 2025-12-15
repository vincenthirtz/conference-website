/* eslint-disable @next/next/no-img-element */
import { useState } from 'react';
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
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <Head>
        <title>Connexion | OW Women&apos;s Cup</title>
      </Head>

      <main className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          {/* Logo / titre */}
          <div className="flex flex-col items-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] uppercase tracking-[0.16em] text-gray-300">
              <span className="px-1.5 py-[2px] rounded-full bg-gradient-to-r from-purple-400/90 to-pink-400/90 text-black font-semibold">
                Staff
              </span>
              <span className="text-[10px]">Accès interne</span>
            </div>

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
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl shadow-2xl shadow-black/40 p-6 pt-20">
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

              <div className="pt-2">
                <Button
                  type="submit"
                  className="w-full justify-center px-4 py-2 text-sm font-medium bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 border-0 shadow-lg shadow-purple-900/40"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Connexion en cours…' : 'Se connecter'}
                </Button>
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
