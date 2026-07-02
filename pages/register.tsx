import { useRef, useState } from 'react';
import Link from 'next/link';
import { supabaseClient } from '@/utils/supabase';
import { BATTLE_TAG_REGEX } from '@/utils/teams/addMember';
import type { SeoProps } from '@/components/Seo/DefaultSeo';

function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [battleTag, setBattleTag] = useState('');

  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<
    'battleTag' | 'password' | 'confirm' | null
  >(null);

  const battleTagRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  // Format BattleTag canonique (Name#0000, alphanumérique + # + 3 à 6
  // chiffres). Constante partagée avec l'API (utils/teams/addMember) pour
  // garder page et route synchronisées.
  const BATTLETAG_PATTERN = BATTLE_TAG_REGEX;

  // Message neutre, identique au chemin succès, pour ne pas révéler si un
  // email est déjà enregistré (anti-énumération).
  const NEUTRAL_SIGNUP_MSG =
    "Si cette adresse n'est pas déjà utilisée, un email de confirmation vient d'être envoyé. Vérifie ta boîte mail, puis connecte-toi.";

  const focusFirstError = (field: 'battleTag' | 'password' | 'confirm') => {
    setFieldError(field);
    const ref =
      field === 'battleTag'
        ? battleTagRef
        : field === 'password'
          ? passwordRef
          : confirmRef;
    // Laisse React peindre l'aria-invalid avant de déplacer le focus.
    requestAnimationFrame(() => ref.current?.focus());
  };

  const handleDiscordSignup = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setOauthLoading(true);
    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') ||
        (typeof window !== 'undefined' ? window.location.origin : '');
      const redirectTo = baseUrl
        ? `${baseUrl}/auth/discord-member?next=/`
        : undefined;

      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'discord',
        options: {
          redirectTo,
          scopes: 'identify email',
        },
      });

      if (error) {
        throw new Error(
          error.message ||
            "Impossible de démarrer l'inscription via Discord pour le moment."
        );
      }
    } catch (err: unknown) {
      setErrorMsg(
        (err as Error)?.message ||
          'Une erreur est survenue avec Discord. Réessaie dans un instant.'
      );
      setOauthLoading(false);
    }
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setFieldError(null);

    // On valide la valeur brute du mot de passe (pas de .trim() : un mot de
    // passe peut légitimement contenir des espaces).
    if (password.length < 8) {
      setErrorMsg('Le mot de passe doit contenir au moins 8 caractères.');
      focusFirstError('password');
      return;
    }

    if (password !== confirm) {
      setErrorMsg('Les mots de passe ne correspondent pas.');
      focusFirstError('confirm');
      return;
    }

    if (battleTag.trim() && !BATTLETAG_PATTERN.test(battleTag.trim())) {
      setErrorMsg('Le BattleTag doit être au format Pseudo#0000.');
      focusFirstError('battleTag');
      return;
    }

    setLoading(true);

    const focusError = () =>
      requestAnimationFrame(() => errorRef.current?.focus());

    try {
      // L'inscription passe par la route serveur (validation + rate-limit +
      // rôle forcé) au lieu d'un signUp direct depuis le navigateur.
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          displayName: displayName.trim() || undefined,
          battleTag: battleTag.trim() || undefined,
        }),
      });

      if (res.ok) {
        // Succès OU email déjà pris → même message neutre (anti-énumération).
        setSuccessMsg(NEUTRAL_SIGNUP_MSG);
        setEmail('');
        setPassword('');
        setConfirm('');
        setBattleTag('');
        return;
      }

      if (res.status === 429) {
        setErrorMsg(
          'Trop de tentatives. Patiente quelques instants avant de réessayer.'
        );
        focusError();
        return;
      }

      const data = await res.json().catch(() => null);
      setErrorMsg(
        data?.code === 'VALIDATION' && typeof data.error === 'string'
          ? data.error
          : 'Impossible de créer le compte pour le moment. Réessaie dans un instant.'
      );
      focusError();
    } catch {
      setErrorMsg(
        'Une erreur est survenue pendant la création du compte. Réessaie dans un instant.'
      );
      focusError();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <main className="flex items-center justify-center px-4 pt-28 pb-20 md:pt-24 md:pb-10">
        <div className="w-full max-w-md">
          <div className="flex flex-col items-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] uppercase tracking-[0.16em] text-gray-300">
              <span className="px-1.5 py-[2px] rounded-full bg-gradient-to-r from-purple-400/90 to-pink-400/90 text-black font-semibold">
                Staff / Joueur
              </span>
              <span className="text-[10px]">Inscription</span>
            </div>

            <h1 className="text-3xl font-bold text-gradient text-center mt-4">
              Créer un compte
            </h1>
            <p className="text-sm text-gray-300 mt-2 text-center max-w-sm">
              Inscris-toi avec ton email. Tu recevras un lien pour confirmer ton
              compte avant de te connecter.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl shadow-2xl shadow-black/40 p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="displayName"
                  className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2"
                >
                  Nom affiché (optionnel)
                </label>
                <input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400/80 focus:border-purple-400/80 transition"
                  placeholder="Ex: LaKiiroi"
                />
              </div>

              <div>
                <label
                  htmlFor="battleTag"
                  className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2"
                >
                  BattleTag (format Pseudo#0000)
                </label>
                <input
                  ref={battleTagRef}
                  id="battleTag"
                  type="text"
                  value={battleTag}
                  onChange={(e) => setBattleTag(e.target.value)}
                  aria-invalid={fieldError === 'battleTag' || undefined}
                  aria-describedby={
                    fieldError === 'battleTag' ? 'register-error' : undefined
                  }
                  className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400/80 focus:border-purple-400/80 transition"
                  placeholder="Ex: Gamerette#1234"
                />
              </div>

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
                  placeholder="prenom.nom@email.tld"
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
                  ref={passwordRef}
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={fieldError === 'password' || undefined}
                  aria-describedby={
                    fieldError === 'password' ? 'register-error' : undefined
                  }
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
                  ref={confirmRef}
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  aria-invalid={fieldError === 'confirm' || undefined}
                  aria-describedby={
                    fieldError === 'confirm' ? 'register-error' : undefined
                  }
                  className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400/80 focus:border-purple-400/80 transition"
                  placeholder="••••••••"
                />
              </div>

              {errorMsg && (
                <div
                  id="register-error"
                  ref={errorRef}
                  tabIndex={-1}
                  role="alert"
                  aria-live="assertive"
                  className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-100 outline-none"
                >
                  {errorMsg}
                </div>
              )}
              {successMsg && (
                <div
                  role="status"
                  className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100"
                >
                  {successMsg}
                </div>
              )}

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={loading || oauthLoading}
                  className={`w-full rounded-xl py-2 text-sm font-semibold transition ${
                    loading
                      ? 'bg-neutral-700 cursor-not-allowed'
                      : 'bg-purple-600 hover:bg-purple-500'
                  }`}
                >
                  {loading ? 'Création...' : 'Créer le compte'}
                </button>
              </div>

              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleDiscordSignup}
                  disabled={loading || oauthLoading}
                  className="w-full rounded-xl py-2 text-sm font-semibold transition border border-white/15 bg-black/60 hover:border-indigo-300/70 hover:text-indigo-100 flex items-center justify-center gap-2"
                >
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
                </button>
              </div>
            </form>

            <div className="mt-4 text-center text-sm text-gray-300 space-x-3">
              <Link href="/login" className="hover:text-white">
                Connexion
              </Link>
              <span className="text-gray-600">•</span>
              <Link href="/" className="hover:text-white">
                Retour au site
              </Link>
            </div>
          </div>

          {/* Encart cast : pas un champ du formulaire — l'inscription force
              toujours le rôle joueur. La candidature se fait depuis l'espace
              joueuse, donc on route vers le login (auth requise) avec un
              ?next= vers la page de candidature. */}
          <div className="mt-4 rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.06] backdrop-blur-xl p-4 text-sm text-cyan-50">
            <p className="flex items-start gap-2">
              <span aria-hidden="true" className="text-base leading-none">
                🎙️
              </span>
              <span>
                Tu veux caster nos matchs ? Crée ton compte, puis fais ta
                demande depuis ton espace joueuse.{' '}
                <Link
                  href="/login?next=/player/caster-application"
                  className="font-semibold underline decoration-cyan-300/60 underline-offset-2 hover:text-white"
                >
                  Rejoindre le cast
                </Link>
              </span>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

const registerSeo: SeoProps = {
  title: 'Créer un compte joueuse / staff',
  description:
    "Crée ton compte OW Women's Cup pour t'inscrire aux tournois, rejoindre le staff ou gérer ton équipe.",
};

RegisterPage.seo = registerSeo;

export default RegisterPage;
