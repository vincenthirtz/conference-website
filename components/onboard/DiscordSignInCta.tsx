// Re-usable "Connect with Discord" button used by the onboarding pages.
//
// Two modes depending on whether the user is already signed in:
//   - Not signed in → `signInWithOAuth({provider:'discord'})` (creates a
//     Discord-backed account).
//   - Already signed in (e.g. email/password) → `linkIdentity({provider:
//     'discord'})` (attaches Discord as a second provider to the EXISTING
//     account, no session change). Without this, calling signInWithOAuth
//     on a signed-in user fails to deliver a code/state at callback and
//     /auth/discord-member shows "Session introuvable".
//
// Same redirect pattern as `pages/register.tsx` and
// `components/player/DiscordLinkCard.tsx`.

import { useState } from 'react';
import { supabaseClient } from '@/utils/supabase';
import { useAuthSession } from '@/hooks/useAuthSession';
import { logger } from '@/utils/logger';

type Props = {
  /** Path the user lands on after the OAuth round-trip. */
  next?: string;
  className?: string;
  label?: string;
};

export default function DiscordSignInCta({
  next = '/onboard/request',
  className = '',
  label = 'Se connecter avec Discord',
}: Props) {
  const { user } = useAuthSession();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleClick = async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') ||
        (typeof window !== 'undefined' ? window.location.origin : '');
      const redirectTo = baseUrl
        ? `${baseUrl}/auth/discord-member?next=${encodeURIComponent(next)}`
        : undefined;

      if (user) {
        // Mode lier : on attache Discord à l'utilisateur connecté (email/pwd).
        // linkIdentity n'est pas typé dans @supabase/supabase-js V2 mais dispo
        // à l'exécution. Pattern identique à DiscordLinkCard.tsx.
        const { data, error } = await (
          supabaseClient.auth as unknown as {
            linkIdentity: (args: {
              provider: 'discord';
              options?: { redirectTo?: string; scopes?: string };
            }) => Promise<{
              data: { url: string | null };
              error: Error | null;
            }>;
          }
        ).linkIdentity({
          provider: 'discord',
          options: { redirectTo, scopes: 'identify email' },
        });
        if (error) {
          throw new Error(
            error.message || 'Impossible de lier votre compte Discord.'
          );
        }
        if (data?.url) {
          window.location.href = data.url;
          return;
        }
        // Pas d'URL retournée → déjà lié, on recharge la page pour que
        // la détection côté /onboard/request voie le link.
        window.location.reload();
        return;
      }

      // Mode signin : pas connecté → flow OAuth Discord standard.
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'discord',
        options: { redirectTo, scopes: 'identify email' },
      });
      if (error) {
        throw new Error(
          error.message || 'Impossible de démarrer la connexion Discord.'
        );
      }
    } catch (err: unknown) {
      logger.warn('[onboard] discord oauth start failed', err);
      setErrorMsg(
        (err as Error)?.message ||
          'Une erreur est survenue avec Discord. Réessayez dans un instant.'
      );
      setLoading(false);
    }
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#5865F2] hover:bg-[#4752c4] disabled:opacity-60 disabled:cursor-not-allowed px-4 py-3 text-sm font-semibold text-white transition"
        data-test="onboard-discord-signin"
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
        <span>{loading ? 'Redirection…' : label}</span>
      </button>
      {errorMsg && (
        <p className="mt-2 text-xs text-red-300" role="alert">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
