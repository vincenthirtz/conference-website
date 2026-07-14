// pages/developpeurs/inscription.tsx
//
// Parcours d'inscription « développeur » PUBLIC (self-service).
//
// Crée un compte Supabase auto-confirmé + un tenant kind='developer' + le staff
// owner via POST /api/developers/register. Après succès, on connecte
// immédiatement l'utilisateur (signInWithPassword) puis on le route vers /admin.
//
// La page est publique mais personnelle / transactionnelle → noindex (comme
// /developpeurs/dashboard, via la propriété statique `.seo = { noindex: true }`).
//
// Style calqué sur pages/register.tsx (carte glassmorphique, champs, gestion
// d'erreur en live-region). Widget Turnstile intégré comme dans
// pages/onboard/request.tsx : le token est récupéré via onSuccess et posté sous
// la clé `turnstileToken` (camelCase — cf. contrat de l'endpoint).

import { useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';

import { supabaseClient } from '@/utils/supabase';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { useT } from '@/lib/i18n/useT';

type DevRegisterDict = ReturnType<typeof useT<'developerRegisterPage'>>;

function DeveloperRegisterPage() {
  const router = useRouter();
  const COPY: DevRegisterDict = useT('developerRegisterPage');

  const [orgName, setOrgName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // On distingue le cas « email déjà pris » pour afficher un lien vers /login.
  const [alreadyExists, setAlreadyExists] = useState(false);

  const passwordRef = useRef<HTMLInputElement>(null);
  const orgRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const turnstileMissing = !siteKey;

  const focusError = () =>
    requestAnimationFrame(() => errorRef.current?.focus());

  function resetTurnstile() {
    try {
      turnstileRef.current?.reset();
    } catch {
      /* ignore */
    }
    setTurnstileToken(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setErrorMsg(null);
    setAlreadyExists(false);

    if (orgName.trim().length === 0) {
      setErrorMsg(COPY.errorOrgRequired);
      requestAnimationFrame(() => orgRef.current?.focus());
      return;
    }
    if (email.trim().length === 0) {
      setErrorMsg(COPY.errorEmailRequired);
      return;
    }
    // Validation brute (pas de .trim() : un mot de passe peut contenir des
    // espaces). Le serveur reste la source de vérité (min 8, max 72).
    if (password.length < 8) {
      setErrorMsg(COPY.errorPasswordTooShort);
      requestAnimationFrame(() => passwordRef.current?.focus());
      return;
    }
    if (!turnstileToken && !turnstileMissing) {
      setErrorMsg(COPY.errorCaptcha);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/developers/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          orgName: orgName.trim(),
          // Clé camelCase attendue par l'endpoint (PAS turnstile_token).
          turnstileToken: turnstileToken ?? 'dev-bypass',
        }),
      });

      let data: {
        status?: string;
        alreadyExists?: boolean;
        error?: string;
        code?: string;
      } | null = null;
      try {
        data = await res.json();
      } catch {
        // JSON malformé → message générique plus bas.
      }

      if (res.ok && data?.status === 'ok') {
        // Email déjà pris → on invite à se connecter au lieu de tenter un
        // signin qui échouerait (mot de passe potentiellement différent).
        if (data.alreadyExists) {
          setAlreadyExists(true);
          setErrorMsg(COPY.alreadyExists);
          focusError();
          return;
        }

        // Compte fraîchement créé + auto-confirmé → connexion immédiate.
        const { error: signInError } =
          await supabaseClient.auth.signInWithPassword({
            email: email.trim(),
            password,
          });

        if (signInError) {
          // Improbable (compte tout juste créé) : on ne bloque pas, on renvoie
          // vers le login avec un message rassurant.
          setErrorMsg(COPY.signinFailed);
          focusError();
          return;
        }

        router.push('/admin');
        return;
      }

      // Chemins d'erreur.
      resetTurnstile();

      if (res.status === 429) {
        setErrorMsg(COPY.errorRateLimited);
        focusError();
        return;
      }
      setErrorMsg(
        typeof data?.error === 'string' ? data.error : COPY.errorGeneric
      );
      focusError();
    } catch {
      resetTurnstile();
      setErrorMsg(COPY.errorNetwork);
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
                {COPY.badgeRole}
              </span>
              <span className="text-[10px]">{COPY.badgeAction}</span>
            </div>

            <h1 className="text-3xl font-bold text-gradient text-center mt-4">
              {COPY.title}
            </h1>
            <p className="text-sm text-gray-300 mt-2 text-center max-w-sm">
              {COPY.subtitle}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl shadow-2xl shadow-black/40 p-6">
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label
                  htmlFor="orgName"
                  className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2"
                >
                  {COPY.orgNameLabel}
                </label>
                <input
                  ref={orgRef}
                  id="orgName"
                  type="text"
                  required
                  minLength={2}
                  maxLength={80}
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  data-test="dev-register-org-input"
                  className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400/80 focus:border-purple-400/80 transition"
                  placeholder={COPY.orgNamePlaceholder}
                />
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2"
                >
                  {COPY.emailLabel}
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  data-test="dev-register-email-input"
                  className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400/80 focus:border-purple-400/80 transition"
                  placeholder={COPY.emailPlaceholder}
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2"
                >
                  {COPY.passwordLabel}
                </label>
                <input
                  ref={passwordRef}
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  data-test="dev-register-password-input"
                  className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400/80 focus:border-purple-400/80 transition"
                  placeholder="••••••••"
                />
                <p className="text-[11px] text-gray-500 mt-1.5">
                  {COPY.passwordHint}
                </p>
              </div>

              {/* Turnstile */}
              <div>
                {turnstileMissing ? (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                    {COPY.captchaMissing}
                  </div>
                ) : (
                  <div className="flex justify-center">
                    <Turnstile
                      ref={turnstileRef}
                      siteKey={siteKey}
                      options={{ theme: 'dark', size: 'flexible' }}
                      onSuccess={(token: string) => setTurnstileToken(token)}
                      onExpire={() => setTurnstileToken(null)}
                      onError={() => setTurnstileToken(null)}
                    />
                  </div>
                )}
              </div>

              {errorMsg && (
                <div
                  id="dev-register-error"
                  ref={errorRef}
                  tabIndex={-1}
                  role="alert"
                  aria-live="assertive"
                  className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-100 outline-none"
                  data-test="dev-register-error"
                >
                  {errorMsg}
                  {alreadyExists && (
                    <>
                      {' '}
                      <Link
                        href="/login"
                        className="font-semibold underline decoration-red-300/60 underline-offset-2 hover:text-white"
                      >
                        {COPY.linkLogin}
                      </Link>
                    </>
                  )}
                </div>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={
                    loading || (!turnstileToken && !turnstileMissing)
                  }
                  data-test="dev-register-submit"
                  className={`w-full rounded-xl py-2 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${
                    loading
                      ? 'bg-neutral-700 cursor-not-allowed'
                      : 'bg-purple-600 hover:bg-purple-500'
                  }`}
                >
                  {loading ? COPY.submitLoading : COPY.submit}
                </button>
              </div>
            </form>

            <div className="mt-4 text-center text-sm text-gray-300 space-x-3">
              <Link href="/login" className="hover:text-white">
                {COPY.linkLogin}
              </Link>
              <span className="text-gray-600">•</span>
              <Link href="/developpeurs" className="hover:text-white">
                {COPY.linkBackToDocs}
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

DeveloperRegisterPage.displayName = 'DeveloperRegisterPage';
// Page publique mais transactionnelle / personnelle → hors index.
const developerRegisterSeo: SeoProps = { noindex: true };
DeveloperRegisterPage.seo = developerRegisterSeo;

export default DeveloperRegisterPage;
