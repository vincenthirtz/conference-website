import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { supabaseClient } from '@/utils/supabase';
import { useToast } from '@/components/Toast';
import { useAdminT } from '@/lib/i18n/useAdminT';

export default function AdminResetPasswordPage() {
  const router = useRouter();
  const { addToast } = useToast();
  const t = useAdminT('adminResetPassword');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  // sessionReady = l'init est terminée ; sessionValid = une session de
  // récupération a réellement été établie. On ne montre le formulaire que si
  // sessionValid, sinon le lien est expiré/déjà utilisé et `updateUser`
  // échouerait silencieusement après saisie.
  const [sessionValid, setSessionValid] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady) return;

    async function initSession() {
      let established = false;
      let msg: string | null = null;

      // 0) token_hash flow (recommandé pour les emails custom) : le lien pointe
      // directement ici avec ?token_hash=…&type=recovery, et verifyOtp établit
      // la session SANS dépendre d'un code_verifier PKCE — lequel est absent du
      // navigateur quand le lien est généré côté serveur (admin.generateLink).
      const tokenHash = router.query.token_hash as string | undefined;
      const code = router.query.code as string | undefined;
      if (tokenHash) {
        const { data, error } = await supabaseClient.auth.verifyOtp({
          type: 'recovery',
          token_hash: tokenHash,
        });
        if (error) {
          msg = error.message || t.invalidLinkDefault;
        } else {
          established = !!data?.session;
        }
      } else if (code) {
        // 1) PKCE flow : Supabase envoie ?code=xxx (fallback legacy)
        const { data, error } =
          await supabaseClient.auth.exchangeCodeForSession(code);
        if (error) {
          msg = error.message || t.errorCodeInvalid;
        } else {
          established = !!data?.session;
        }
      } else if (typeof window !== 'undefined') {
        // 2) Legacy implicit flow : tokens (ou erreur) dans le hash fragment
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
            established = !!data?.session;
          }
        }
      }

      // 3) Fallback : session déjà active (cookie)
      if (!established) {
        const { data } = await supabaseClient.auth.getSession();
        if (data?.session) established = true;
      }

      if (!established && !msg) {
        msg = t.errorNoSession;
      }

      if (msg) setErrorMsg(msg);
      setSessionValid(established);
      setSessionReady(true);
    }

    initSession();
  }, [router.isReady, router.query.token_hash, router.query.code, t]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!sessionValid) {
      setErrorMsg(t.errorLinkExpiredSubmit);
      return;
    }

    if (password.trim().length < 8) {
      setErrorMsg(t.errorPasswordTooShort);
      return;
    }
    if (password !== confirm) {
      setErrorMsg(t.errorPasswordMismatch);
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabaseClient.auth.updateUser({
        password: password.trim(),
      });

      if (error) {
        throw new Error(error.message || t.errorUpdateFailed);
      }

      addToast(t.successUpdated, 'success');
      setPassword('');
      setConfirm('');
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errorUnexpected);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <main className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] uppercase tracking-[0.16em] text-gray-300">
              <span className="px-1.5 py-[2px] rounded-full bg-gradient-to-r from-purple-400/90 to-pink-400/90 text-black font-semibold">
                {t.badgeStaff}
              </span>
              <span className="text-[10px]">{t.badgeAction}</span>
            </div>

            <h1 className="text-3xl font-bold text-gradient text-center mt-4">
              {t.heading}
            </h1>
            <p className="text-sm text-gray-300 mt-2 text-center max-w-sm">
              {t.intro}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl shadow-2xl shadow-black/40 p-6">
            {!sessionReady ? (
              <p className="text-sm text-neutral-300">{t.loadingSession}</p>
            ) : !sessionValid ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-3 text-sm text-red-100">
                  {errorMsg || t.invalidLinkDefault}
                </div>
                <p className="text-xs text-gray-400">{t.singleUseNote}</p>
                <Link
                  href="/admin/forgot-password"
                  className="block w-full text-center rounded-xl py-2 text-sm font-semibold bg-purple-600 hover:bg-purple-500 transition"
                >
                  {t.requestNewLink}
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="password"
                    className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2"
                  >
                    {t.newPasswordLabel}
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
                    {t.confirmLabel}
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
                    {loading ? t.submitUpdating : t.submit}
                  </button>
                </div>
              </form>
            )}

            <div className="mt-4 text-center">
              <Link
                href="/admin/login"
                className="text-sm text-purple-200 hover:text-purple-100"
              >
                {t.backToLogin}
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
