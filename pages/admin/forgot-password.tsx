import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { supabaseClient } from '@/utils/supabase';

export default function AdminForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setSending(true);

    try {
      if (!email.trim()) throw new Error('Merci de renseigner ton email.');

      const redirectTo =
        typeof window !== 'undefined'
          ? `${window.location.origin}/admin/reset-password`
          : undefined;

      const { error } = await supabaseClient.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo,
        }
      );

      if (error) {
        throw new Error(
          error.message || "Impossible d'envoyer l'email de réinitialisation."
        );
      }

      setSuccessMsg(
        'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.'
      );
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Erreur inattendue');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <Head>
        <title>Réinitialiser le mot de passe | OW Women&apos;s Cup</title>
      </Head>

      <main className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] uppercase tracking-[0.16em] text-gray-300">
              <span className="px-1.5 py-[2px] rounded-full bg-gradient-to-r from-purple-400/90 to-pink-400/90 text-black font-semibold">
                Staff
              </span>
              <span className="text-[10px]">Réinitialisation</span>
            </div>

            <h1 className="text-3xl font-bold text-gradient text-center mt-4">
              Mot de passe oublié
            </h1>
            <p className="text-sm text-gray-300 mt-2 text-center max-w-sm">
              Entre ton email staff. Nous t&apos;envoyons un lien pour définir
              un nouveau mot de passe.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl shadow-2xl shadow-black/40 p-6">
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

              {errorMsg && (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                  {errorMsg}
                </div>
              )}
              {successMsg && (
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                  {successMsg}
                </div>
              )}

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={sending}
                  className={`w-full rounded-xl py-2 text-sm font-semibold transition ${
                    sending
                      ? 'bg-neutral-700 cursor-not-allowed'
                      : 'bg-purple-600 hover:bg-purple-500'
                  }`}
                >
                  {sending ? 'Envoi...' : 'Envoyer le lien'}
                </button>
              </div>
            </form>

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
