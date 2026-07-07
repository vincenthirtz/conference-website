// /onboard/request
//
// Self-service tenant request form. Discord OAuth gated (via Supabase Auth)
// + Cloudflare Turnstile + slug validation that mirrors the server schema in
// `utils/onboard.ts`.
//
// On success → redirects to /onboard/check-email?id=<requestId>.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';

import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useDebounce } from '@/hooks/useDebounce';
import { useToast } from '@/components/Toast';
import {
  ONBOARD_SLUG_RE,
  RESERVED_SLUGS,
  isReservedSlug,
} from '@/utils/onboard';
import DiscordSignInCta from '@/components/onboard/DiscordSignInCta';
import { logger } from '@/utils/logger';
import { useT, format } from '@/lib/i18n/useT';

type OnboardRequestDict = ReturnType<typeof useT<'onboardRequest'>>;

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string };

type SlugValidation = { ok: true } | { ok: false; reason: string };

function validateSlugClient(
  slug: string,
  t: OnboardRequestDict
): SlugValidation {
  if (!slug) return { ok: false, reason: t.slugRequired };
  if (!ONBOARD_SLUG_RE.test(slug)) {
    return {
      ok: false,
      reason: t.slugFormat,
    };
  }
  if (isReservedSlug(slug)) {
    return { ok: false, reason: t.slugReserved };
  }
  return { ok: true };
}

type DiscordLinkState =
  | { kind: 'unknown' }
  | { kind: 'linked'; discordUserId: string; discordUsername: string | null }
  | { kind: 'not-linked' };

function OnboardRequestPage() {
  const t = useT('onboardRequest');
  const router = useRouter();
  const { user, loading: authLoading } = useAuthSession();
  const { addToast } = useToast();

  // ---- Form state ----
  const [slug, setSlug] = useState('');
  const [orgName, setOrgName] = useState('');
  const [email, setEmail] = useState('');
  const [description, setDescription] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance | null>(null);

  const [submit, setSubmit] = useState<SubmitState>({ kind: 'idle' });
  const submitInFlight = useRef(false);

  // Le user peut être signé in (email/password ou Discord OAuth) MAIS sans
  // Discord lié à son compte Supabase. On vérifie via /api/auth/discord-link.
  // Sans Discord lié, l'API onboard refuse la submission (401 UNAUTHENTICATED).
  const [discordLink, setDiscordLink] = useState<DiscordLinkState>({
    kind: 'unknown',
  });

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        // 1) Etat actuel de user_discord_links (table custom).
        const res = await fetch('/api/auth/discord-link', {
          credentials: 'include',
        });
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json()) as {
            linked?: boolean;
            discordUserId?: string | null;
            discordUsername?: string | null;
          };
          if (data.linked && data.discordUserId) {
            setDiscordLink({
              kind: 'linked',
              discordUserId: data.discordUserId,
              discordUsername: data.discordUsername ?? null,
            });
            return;
          }
        }
        // 2) Pas de row user_discord_links, mais l'utilisateur peut avoir
        //    quand même une identité Discord attachée à auth.identities
        //    (cas typique : un ancien sign-in via Discord OAuth, mais la
        //    table custom n'a jamais été peuplée). On tente le populate
        //    automatique via POST /api/auth/link-discord — ce endpoint
        //    lit auth.users.identities côté serveur et upsert la row si
        //    une discord identity existe.
        const linkRes = await fetch('/api/auth/link-discord', {
          method: 'POST',
          credentials: 'include',
        });
        if (cancelled) return;
        if (linkRes.ok) {
          const linkData = (await linkRes.json()) as {
            success?: boolean;
            discordUserId?: string | null;
            discordUsername?: string | null;
          };
          if (linkData.success && linkData.discordUserId) {
            setDiscordLink({
              kind: 'linked',
              discordUserId: linkData.discordUserId,
              discordUsername: linkData.discordUsername ?? null,
            });
            return;
          }
        }
        // 3) Vraiment pas d'identité Discord → afficher le CTA pour lier.
        setDiscordLink({ kind: 'not-linked' });
      } catch {
        if (!cancelled) setDiscordLink({ kind: 'not-linked' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const debouncedSlug = useDebounce(slug, 250);
  const slugValidation = useMemo(
    () => validateSlugClient(debouncedSlug, t),
    [debouncedSlug, t]
  );

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const turnstileMissing = !siteKey;

  // Pre-fill email with the Discord OAuth email if available — easy QoL win.
  useEffect(() => {
    if (user?.email && !email) {
      setEmail(user.email);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (submitInFlight.current) return;
      if (submit.kind === 'loading') return;

      // Client-side validation pass — server is the source of truth.
      if (!slugValidation.ok) {
        setSubmit({
          kind: 'error',
          message: format(t.errorSlugInvalid, {
            reason: slugValidation.reason,
          }),
        });
        return;
      }
      if (orgName.trim().length === 0) {
        setSubmit({
          kind: 'error',
          message: t.errorOrgRequired,
        });
        return;
      }
      if (description.length > 1000) {
        setSubmit({
          kind: 'error',
          message: t.errorDescTooLong,
        });
        return;
      }
      if (!turnstileToken && !turnstileMissing) {
        setSubmit({
          kind: 'error',
          message: t.errorCaptcha,
        });
        return;
      }

      submitInFlight.current = true;
      setSubmit({ kind: 'loading' });

      try {
        const res = await fetch('/api/onboard/tenant-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requested_slug: slug.trim().toLowerCase(),
            requested_name: orgName.trim(),
            requested_email: email.trim().toLowerCase(),
            description: description.trim() || undefined,
            turnstile_token: turnstileToken ?? 'dev-bypass',
          }),
        });

        let data: {
          ok?: boolean;
          requestId?: string;
          error?: string;
          code?: string;
        } | null = null;
        try {
          data = await res.json();
        } catch {
          // Malformed JSON — surface a generic error below.
        }

        if (!res.ok || !data?.ok || !data.requestId) {
          // Reset Turnstile so the user can re-try without re-loading.
          try {
            turnstileRef.current?.reset();
          } catch {
            /* ignore */
          }
          setTurnstileToken(null);

          if (res.status === 401) {
            setSubmit({
              kind: 'error',
              message: t.errorSession,
            });
            return;
          }
          if (res.status === 429) {
            setSubmit({
              kind: 'error',
              message: t.errorRateLimit,
            });
            return;
          }
          if (res.status === 409) {
            // Could be SLUG_TAKEN or REQUEST_ALREADY_PENDING.
            setSubmit({
              kind: 'error',
              message: data?.error ?? t.errorConflict,
            });
            return;
          }
          if (res.status === 400) {
            setSubmit({
              kind: 'error',
              message: data?.error ?? t.errorBadData,
            });
            return;
          }
          setSubmit({
            kind: 'error',
            message: data?.error ?? t.errorGeneric,
          });
          return;
        }

        addToast(t.toastSuccess, 'success');
        router.push(`/onboard/check-email?id=${data.requestId}`);
      } catch (err) {
        logger.warn('[onboard/request] submit error', err);
        try {
          turnstileRef.current?.reset();
        } catch {
          /* ignore */
        }
        setTurnstileToken(null);
        setSubmit({
          kind: 'error',
          message: t.errorNetwork,
        });
      } finally {
        submitInFlight.current = false;
      }
    },
    [
      addToast,
      description,
      email,
      orgName,
      router,
      slug,
      slugValidation,
      submit.kind,
      t,
      turnstileMissing,
      turnstileToken,
    ]
  );

  // ---- Render ----

  if (authLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
        <div className="text-sm text-gray-300">{t.loading}</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
        <main className="px-4 pt-28 pb-20 md:pt-32 flex items-center justify-center">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-6 md:p-8 shadow-2xl">
            <h1 className="text-2xl font-bold text-gradient mb-2">
              {t.signInTitle}
            </h1>
            <p className="text-sm text-gray-300 mb-5">{t.signInBody}</p>
            <DiscordSignInCta next="/onboard/request" />
            <p className="text-xs text-gray-500 mt-4">
              {t.noPassword}{' '}
              <Link
                href="/onboard"
                className="text-purple-300 hover:text-purple-200"
              >
                {t.backToIntro}
              </Link>
            </p>
          </div>
        </main>
      </div>
    );
  }

  // User connecté MAIS pas via Discord (compte email/password sans Discord lié).
  // L'API onboard refuse la submission tant que Discord n'est pas lié.
  if (discordLink.kind === 'not-linked') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
        <main className="px-4 pt-28 pb-20 md:pt-32 flex items-center justify-center">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-6 md:p-8 shadow-2xl">
            <h1 className="text-2xl font-bold text-gradient mb-2">
              {t.linkTitle}
            </h1>
            <p className="text-sm text-gray-300 mb-5">
              {t.linkBodyConnected}
              {user?.email ? ` (${user.email})` : ''} {t.linkBodyRest}
            </p>
            <DiscordSignInCta next="/onboard/request" label={t.linkCtaLabel} />
            <p className="text-xs text-gray-500 mt-4">
              {t.linkRedirectNote}{' '}
              <Link
                href="/onboard"
                className="text-purple-300 hover:text-purple-200"
              >
                {t.backToIntro}
              </Link>
            </p>
          </div>
        </main>
      </div>
    );
  }

  const slugIndicator = !debouncedSlug
    ? null
    : slugValidation.ok
      ? { color: 'emerald', text: t.slugAvailable }
      : { color: 'red', text: slugValidation.reason };

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <main className="px-4 pt-28 pb-20 md:pt-32 flex items-center justify-center">
        <div className="w-full max-w-xl">
          <div className="flex flex-col items-center mb-8 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] uppercase tracking-[0.16em] text-gray-300">
              <span className="px-1.5 py-[2px] rounded-full bg-gradient-to-r from-purple-400/90 to-pink-400/90 text-black font-semibold">
                {t.step1Badge}
              </span>
              <span>{t.step1Sub}</span>
            </div>
            <h1 className="text-3xl font-bold text-gradient text-center mt-4">
              {t.formTitle}
            </h1>
            <p className="text-sm text-gray-300 mt-2 max-w-md">
              {t.formSubtitle}
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl shadow-2xl shadow-black/40 p-6 space-y-5"
            noValidate
          >
            {/* Slug */}
            <div>
              <label
                htmlFor="slug"
                className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2"
              >
                {t.slugLabel}
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 font-mono">/</span>
                <input
                  id="slug"
                  type="text"
                  required
                  inputMode="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={slug}
                  onChange={(e) =>
                    setSlug(
                      e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')
                    )
                  }
                  placeholder="esport-club"
                  maxLength={30}
                  data-test="onboard-slug-input"
                  className="flex-1 rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400/80 focus:border-purple-400/80 transition font-mono"
                />
              </div>
              <p className="text-[11px] text-gray-500 mt-1.5">
                {t.slugHintBefore}
                <span className="font-mono">/{slug || t.slugFallback}/...</span>
                {t.slugHintAfter}{' '}
                <span className="font-mono text-gray-400">
                  {Array.from(RESERVED_SLUGS).slice(0, 6).join(', ')}…
                </span>
              </p>
              {slugIndicator && (
                <p
                  className={`text-[11px] mt-1 ${
                    slugIndicator.color === 'emerald'
                      ? 'text-emerald-300'
                      : 'text-red-300'
                  }`}
                  data-test="onboard-slug-validation"
                >
                  {slugIndicator.text}
                </p>
              )}
            </div>

            {/* Org name */}
            <div>
              <label
                htmlFor="orgName"
                className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2"
              >
                {t.orgNameLabel}
              </label>
              <input
                id="orgName"
                type="text"
                required
                minLength={1}
                maxLength={200}
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder={t.orgNamePlaceholder}
                data-test="onboard-name-input"
                className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400/80 focus:border-purple-400/80 transition"
              />
            </div>

            {/* Email */}
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
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t.emailPlaceholder}
                data-test="onboard-email-input"
                className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400/80 focus:border-purple-400/80 transition"
              />
              <p className="text-[11px] text-gray-500 mt-1.5">{t.emailHint}</p>
            </div>

            {/* Description */}
            <div>
              <label
                htmlFor="description"
                className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2"
              >
                {t.descriptionLabel}{' '}
                <span className="font-normal text-gray-500 normal-case tracking-normal">
                  {t.optional}
                </span>
              </label>
              <textarea
                id="description"
                rows={3}
                maxLength={1000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t.descriptionPlaceholder}
                data-test="onboard-description-input"
                className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400/80 focus:border-purple-400/80 transition resize-none"
              />
              <p className="text-[11px] text-gray-500 mt-1.5 text-right">
                {description.length}/1000
              </p>
            </div>

            {/* Turnstile */}
            <div>
              {turnstileMissing ? (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                  {t.captchaMissing}
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

            {submit.kind === 'error' && (
              <div
                className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-100"
                role="alert"
                data-test="onboard-submit-error"
              >
                {submit.message}
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={
                  submit.kind === 'loading' ||
                  !slugValidation.ok ||
                  orgName.trim().length === 0 ||
                  email.trim().length === 0 ||
                  (!turnstileToken && !turnstileMissing)
                }
                data-test="onboard-submit-button"
                className={`w-full rounded-xl py-3 text-sm font-semibold transition flex items-center justify-center gap-2 ${
                  submit.kind === 'loading'
                    ? 'bg-neutral-700 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {submit.kind === 'loading' ? (
                  <>
                    <span
                      className="inline-block h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin"
                      aria-hidden
                    />
                    {t.submitting}
                  </>
                ) : (
                  <>{t.submit}</>
                )}
              </button>
            </div>

            <p className="text-[11px] text-gray-500 text-center">
              {t.consentNote}
            </p>
          </form>

          <div className="mt-6 text-center text-xs text-gray-400">
            <Link href="/onboard" className="hover:text-white">
              {t.backToIntroArrow}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

const onboardRequestSeo: SeoProps = {
  title: {
    fr: 'Demander le bot Discord',
    en: 'Request the Discord bot',
  },
  description: {
    fr: 'Formulaire de demande pour ajouter le bot Conférence sur votre serveur Discord — slug, organisation, email de contact.',
    en: 'Request form to add the Conférence bot to your Discord server — slug, organisation, contact email.',
  },
  noindex: true,
};

OnboardRequestPage.seo = onboardRequestSeo;

export default OnboardRequestPage;
