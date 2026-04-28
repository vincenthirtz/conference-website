import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { supabaseClient } from '@/utils/supabase';
import { useToast } from '@/components/Toast';

export default function AdminResetPasswordPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady) return;

    async function initSession() {
      // 1) PKCE flow : Supabase envoie ?code=xxx dans la query string
      const code = router.query.code as string | undefined;
      if (code) {
        const { error } =
          await supabaseClient.auth.exchangeCodeForSession(code);
        if (error) {
          setErrorMsg(
            error.message ||
              'Impossible de restaurer la session de récupération.'
          );
        }
        setSessionReady(true);
        return;
      }

      // 2) Legacy implicit flow : tokens dans le hash fragment
      if (typeof window !== 'undefined') {
        const hash = window.location.hash.replace(/^#/, '');
        const params = new URLSearchParams(hash);
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');
        if (access_token && refresh_token) {
          const { error } = await supabaseClient.auth.setSession({
            access_token,
            refresh_token,
          });
          if (error) {
            setErrorMsg(
              error.message ||
                'Impossible de restaurer la session de récupération.'
            );
          }
          setSessionReady(true);
          return;
        }
      }

      // 3) Fallback : session déjà active (cookie)
      const { error, data } = await supabaseClient.auth.getSession();
      if (error || !data.session) {
        setErrorMsg(
          "Lien invalide ou session absente. Rouvre le lien de réinitialisation depuis l'email."
        );
      }
      setSessionReady(true);
    }

    initSession();
  }, [router.isReady, router.query.code]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!sessionReady) {
      setErrorMsg(
        'Session de récupération non prête, réessaie dans un instant.'
      );
      return;
    }

    if (password.trim().length < 8) {
      setErrorMsg('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (password !== confirm) {
      setErrorMsg('Les mots de passe ne correspondent pas.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabaseClient.auth.updateUser({
        password: password.trim(),
      });

      if (error) {
        throw new Error(
          error.message || 'Impossible de mettre à jour le mot de passe.'
        );
      }

      addToast('Mot de passe mis à jour. Tu peux te reconnecter.', 'success');
      setPassword('');
      setConfirm('');
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <Head>
        <title>Nouveau mot de passe | OW Women&apos;s Cup</title>
      </Head>

      <main className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] uppercase tracking-[0.16em] text-gray-300">
              <span className="px-1.5 py-[2px] rounded-full bg-gradient-to-r from-purple-400/90 to-pink-400/90 text-black font-semibold">
                Staff
              </span>
              <span className="text-[10px]">Reset</span>
            </div>

            <h1 className="text-3xl font-bold text-gradient text-center mt-4">
              Nouveau mot de passe
            </h1>
            <p className="text-sm text-gray-300 mt-2 text-center max-w-sm">
              Saisis ton nouveau mot de passe après avoir ouvert le lien reçu
              par email.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl shadow-2xl shadow-black/40 p-6">
            {!sessionReady ? (
              <p className="text-sm text-neutral-300">
                Chargement de la session…
              </p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="password"
                    className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2"
                  >
                    Nouveau mot de passe
                  </label>
                  <input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400/80 focus:border-purple-400/80 transition"
                    placeholder="••••••••"
                  />
                </div>

                <div>
                  <label
                    htmlFor="confirm"
                    className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2"
                  >
                    Confirmation
                  </label>
                  <input
                    id="confirm"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400/80 focus:border-purple-400/80 transition"
                    placeholder="••••••••"
                  />
                </div>

                {errorMsg && (
                  <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                    {errorMsg}
                  </div>
                )}
                <div className="pt-2 flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={loading}
                    className={`w-full rounded-xl py-2 text-sm font-semibold transition ${
                      loading
                        ? 'bg-neutral-700 cursor-not-allowed'
                        : 'bg-purple-600 hover:bg-purple-500'
                    }`}
                  >
                    {loading ? 'Mise à jour...' : 'Mettre à jour'}
                  </button>
                </div>
              </form>
            )}

            <div className="mt-4 text-center">
              <Link
                href="/admin/login"
                className="text-sm text-purple-200 hover:text-purple-100"
              >
                Retour à la connexion
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
