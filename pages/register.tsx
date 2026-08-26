import { useRef, useState } from 'react';
import Link from 'next/link';
import { supabaseClient } from '@/utils/supabase';
import { BATTLE_TAG_REGEX } from '@/utils/teams/roleKind';
import { useT } from '@/lib/i18n/useT';
import { ANALYTICS_EVENTS, trackEvent } from '@/lib/analytics/track';
import { resolveSignupSource } from '@/lib/analytics/attribution';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import nsRegisterPage from '@/lib/i18n/locales/fr/registerPage';

function RegisterPage() {
  const t = useT(nsRegisterPage);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [battleTag, setBattleTag] = useState('');
  // Type de compte. « manager » = elle encadre une équipe sans y jouer : pas de
  // BattleTag à saisir (elle n'a pas forcément de compte Overwatch), et
  // l'après-inscription la mène vers la création d'équipe plutôt que vers la
  // recherche d'une équipe. Le rôle n'accorde aucun droit en soi
  // (cf. pages/api/auth/register.ts) — c'est une étiquette de compte.
  const [accountType, setAccountType] = useState<'player' | 'manager'>(
    'player'
  );
  const isManagerAccount = accountType === 'manager';

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
  // `register_start` ne doit partir qu'UNE fois : c'est « quelqu'un a commencé
  // à remplir », pas « quelqu'un a tapé une lettre ». Un ref (et pas un state)
  // pour ne pas re-rendre le formulaire à chaque frappe.
  const startTrackedRef = useRef(false);

  const markRegistrationStarted = () => {
    if (startTrackedRef.current) return;
    startTrackedRef.current = true;
    trackEvent(ANALYTICS_EVENTS.registerStart, { account_type: accountType });
  };

  // Format BattleTag canonique (Name#0000 : lettres/chiffres, accents
  // acceptés, + # + 3 à 6 chiffres). Constante partagée avec l'API
  // (utils/teams/addMember) pour garder page et route synchronisées.
  const BATTLETAG_PATTERN = BATTLE_TAG_REGEX;

  // Message neutre, identique au chemin succès, pour ne pas révéler si un
  // email est déjà enregistré (anti-énumération).
  const NEUTRAL_SIGNUP_MSG = t.neutralSignupMsg;

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
        throw new Error(error.message || t.discordStartError);
      }
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message || t.discordGenericError);
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
      setErrorMsg(t.passwordTooShort);
      focusFirstError('password');
      return;
    }

    if (password !== confirm) {
      setErrorMsg(t.passwordMismatch);
      focusFirstError('confirm');
      return;
    }

    if (
      !isManagerAccount &&
      battleTag.trim() &&
      !BATTLETAG_PATTERN.test(battleTag.trim())
    ) {
      setErrorMsg(t.battleTagInvalid);
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
          // Un compte manager ne porte pas de BattleTag, même si le champ a été
          // rempli avant de basculer le choix.
          battleTag: isManagerAccount
            ? undefined
            : battleTag.trim() || undefined,
          accountType,
          // Attribution : première touche mémorisée si consentement analytics,
          // sinon les utm_* de l'URL courante. `null` quand il n'y a rien.
          signupSource: resolveSignupSource() ?? undefined,
        }),
      });

      if (res.ok) {
        // Succès OU email déjà pris → même message neutre (anti-énumération).
        // L'événement porte donc la même ambiguïté que la réponse : c'est le
        // prix de l'anti-énumération, et le biais est marginal en volume.
        trackEvent(ANALYTICS_EVENTS.registerDone, {
          account_type: accountType,
        });
        setSuccessMsg(NEUTRAL_SIGNUP_MSG);
        setEmail('');
        setPassword('');
        setConfirm('');
        setBattleTag('');
        setAccountType('player');
        return;
      }

      if (res.status === 429) {
        setErrorMsg(t.rateLimited);
        focusError();
        return;
      }

      const data = await res.json().catch(() => null);
      setErrorMsg(
        data?.code === 'VALIDATION' && typeof data.error === 'string'
          ? data.error
          : t.createAccountError
      );
      focusError();
    } catch {
      setErrorMsg(t.submitGenericError);
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
                {t.badgeRole}
              </span>
              <span className="text-[10px]">{t.badgeAction}</span>
            </div>

            <h1 className="text-3xl font-bold text-gradient text-center mt-4">
              {t.title}
            </h1>
            <p className="text-sm text-gray-300 mt-2 text-center max-w-sm">
              {t.subtitle}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl shadow-2xl shadow-black/40 p-6">
            {/* onChange sur le <form> : l'événement React remonte depuis
                chaque champ, ce qui évite d'instrumenter les six onChange. */}
            <form
              onSubmit={handleSubmit}
              onChange={markRegistrationStarted}
              className="space-y-4"
            >
              {/* Type de compte : je joue, ou j'encadre. Le second cas n'avait
                  aucune porte d'entrée avant 2026-08-20. */}
              <fieldset className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <legend className="px-1 text-xs font-medium tracking-[0.12em] uppercase text-gray-300">
                  {t.accountTypeLegend}
                </legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      {
                        value: 'player' as const,
                        label: t.accountTypePlayer,
                        hint: t.accountTypePlayerHint,
                      },
                      {
                        value: 'manager' as const,
                        label: t.accountTypeManager,
                        hint: t.accountTypeManagerHint,
                      },
                    ] as const
                  ).map((opt) => (
                    <label
                      key={opt.value}
                      className={`cursor-pointer rounded-lg border p-3 transition ${
                        accountType === opt.value
                          ? 'border-purple-400/60 bg-purple-400/10'
                          : 'border-white/10 hover:border-white/30'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="account-type"
                          className="sr-only"
                          value={opt.value}
                          checked={accountType === opt.value}
                          onChange={() => setAccountType(opt.value)}
                        />
                        <span
                          aria-hidden="true"
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                            accountType === opt.value
                              ? 'border-purple-400 bg-purple-400'
                              : 'border-white/30'
                          }`}
                        >
                          {accountType === opt.value && (
                            <span className="h-1.5 w-1.5 rounded-full bg-black" />
                          )}
                        </span>
                        <span className="text-sm font-semibold text-white">
                          {opt.label}
                        </span>
                      </span>
                      <span className="mt-1 block pl-6 text-[11px] leading-snug text-gray-400">
                        {opt.hint}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                <label
                  htmlFor="displayName"
                  className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2"
                >
                  {t.displayNameLabel}
                </label>
                <input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400/80 focus:border-purple-400/80 transition"
                  placeholder={t.displayNamePlaceholder}
                />
              </div>

              {isManagerAccount ? (
                <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-[11px] leading-relaxed text-gray-300">
                  {t.managerNoBattleTagNote}
                </p>
              ) : (
                <div>
                  <label
                    htmlFor="battleTag"
                    className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2"
                  >
                    {t.battleTagLabel}
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
                    placeholder={t.battleTagPlaceholder}
                  />
                </div>
              )}

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
                  {t.confirmLabel}
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
                  {loading ? t.submitLoading : t.submit}
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
                  <span>{t.continueWithDiscord}</span>
                </button>
              </div>
            </form>

            <div className="mt-4 text-center text-sm text-gray-300 space-x-3">
              <Link href="/login" className="hover:text-white">
                {t.linkLogin}
              </Link>
              <span className="text-gray-600">•</span>
              <Link href="/" className="hover:text-white">
                {t.linkBackToSite}
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
                {t.castBlurb}{' '}
                <Link
                  href="/login?next=/player/caster-application"
                  className="font-semibold underline decoration-cyan-300/60 underline-offset-2 hover:text-white"
                >
                  {t.castLink}
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
  title: {
    fr: 'Créer un compte joueuse / staff',
    en: 'Create a player / staff account',
  },
  description: {
    fr: "Crée ton compte OW Women's Cup pour t'inscrire aux tournois, rejoindre le staff ou gérer ton équipe.",
    en: "Create your OW Women's Cup account to sign up for tournaments, join the staff or manage your team.",
  },
};

RegisterPage.seo = registerSeo;

export default RegisterPage;
