import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { supabaseClient } from "@/utils/supabase";

export default function AdminResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    // Force session fetch to ensure recovery token is picked up
    supabaseClient.auth.getSession().then(() => setSessionReady(true));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (password.trim().length < 6) {
      setErrorMsg("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    if (password !== confirm) {
      setErrorMsg("Les mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabaseClient.auth.updateUser({
        password: password.trim(),
      });

      if (error) {
        throw new Error(error.message || "Impossible de mettre à jour le mot de passe.");
      }

      setSuccessMsg("Mot de passe mis à jour. Tu peux te reconnecter.");
      setPassword("");
      setConfirm("");
    } catch (err: any) {
      setErrorMsg(err?.message ?? "Erreur inattendue");
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
              Saisis ton nouveau mot de passe après avoir ouvert le lien reçu par email.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl shadow-2xl shadow-black/40 p-6">
            {!sessionReady ? (
              <p className="text-sm text-neutral-300">Chargement de la session…</p>
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
                {successMsg && (
                  <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                    {successMsg}
                  </div>
                )}

                <div className="pt-2 flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={loading}
                    className={`w-full rounded-xl py-2 text-sm font-semibold transition ${
                      loading
                        ? "bg-neutral-700 cursor-not-allowed"
                        : "bg-purple-600 hover:bg-purple-500"
                    }`}
                  >
                    {loading ? "Mise à jour..." : "Mettre à jour"}
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
