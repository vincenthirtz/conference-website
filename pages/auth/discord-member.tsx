import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabaseClient } from '@/utils/supabase';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useT } from '@/lib/i18n/useT';
import {
  isIdentityAlreadyLinked,
  readOAuthError,
} from '@/utils/auth/oauthError';

import { logger } from '../../utils/logger';
import nsAuthDiscordMember from '@/lib/i18n/locales/fr/authDiscordMember';
export default function DiscordMemberRedirect() {
  const router = useRouter();
  const { adminFetch } = useAdminFetch();
  const t = useT(nsAuthDiscordMember);
  const [status, setStatus] = useState(t.statusConnecting);
  const [error, setError] = useState<string | null>(null);
  // Sur échec on N'AUTO-REDIRIGE PLUS (le message serait illisible) : il faut
  // donc offrir la sortie. Renseigné avec la destination déjà validée.
  const [backHref, setBackHref] = useState('/');

  useEffect(() => {
    const ensureRole = async () => {
      try {
        // Validate redirect target to prevent open redirects
        const rawNext = (router.query.next as string) || '/';
        const next =
          rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';
        setBackHref(next);
        // Un `linkIdentity()` qui échoue ne LÈVE pas : Supabase redirige ici en
        // accrochant `error` / `error_code` à l'URL. Sans cette lecture, la
        // session précédente restait valide, la page repartait vers /player, et
        // l'écran affichait toujours « non lié » — sans un mot d'explication.
        // C'est exactement ce que vivait un coach dont le compte Discord était
        // déjà rattaché à un AUTRE compte du site.
        const oauthError = readOAuthError(
          router.query,
          typeof window !== 'undefined' ? window.location.hash : null
        );
        if (oauthError) {
          logger.warn('[discord-member] oauth error', oauthError);
          setError(
            isIdentityAlreadyLinked(oauthError)
              ? t.errAlreadyLinked
              : t.errLinkGeneric
          );
          setStatus(t.statusLinkFailed);
          return;
        }

        const code = router.query.code as string | undefined;
        const state = router.query.state as string | undefined;

        // 1) Si retour OAuth avec code/state → échanger contre une session
        if (code && state) {
          setStatus(t.statusValidating);
          const { error: exchangeError } =
            await supabaseClient.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            throw exchangeError;
          }
        }

        // 2) Récupérer l'utilisateur courant
        const { data: sessionData, error: sessionErr } =
          await supabaseClient.auth.getSession();
        if (sessionErr || !sessionData.session?.user) {
          setStatus(t.statusSessionNotFound);
          setTimeout(() => router.replace('/'), 1000);
          return;
        }

        const user = sessionData.session.user;
        const currentRole = user.user_metadata?.role;
        if (!currentRole) {
          await supabaseClient.auth.updateUser({
            data: { role: 'player' },
          });
        }

        // Persistance du lien Discord, pour que le bot puisse écrire en DM.
        // Un échec ne doit pas bloquer le flux OAuth (la session est valide) —
        // mais il ne doit pas non plus passer inaperçu : `fetch` ne lève pas
        // sur un 4xx, donc l'ancien `try/catch` seul avalait aussi bien le
        // « déjà lié à un autre compte » (409) que le « pas d'identité
        // Discord » (400), et renvoyait l'utilisateur comme si tout allait bien.
        try {
          const linkRes = await fetch('/api/auth/link-discord', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${sessionData.session.access_token}`,
            },
          });
          if (!linkRes.ok) {
            const payload = await linkRes.json().catch(() => null);
            logger.warn('[discord-member] link-discord rejected', payload);
            setError(payload?.error || t.errLinkGeneric);
            setStatus(t.statusLinkFailed);
            return;
          }
        } catch (linkErr) {
          logger.warn('[discord-member] link-discord failed', linkErr);
          setError(t.errLinkGeneric);
          setStatus(t.statusLinkFailed);
          return;
        }

        // 3) Si la destination est /admin, vérifier que l'utilisateur a un rôle staff
        if (next.startsWith('/admin')) {
          setStatus(t.statusCheckingPerms);

          const res = await adminFetch('/api/admin/me', {
            skipAuthRedirect: true,
          });

          if (!res.ok) {
            // L'utilisateur n'a pas de rôle staff → rediriger vers l'accueil avec message
            setError(t.errNoStaff);
            setStatus(t.statusNoStaffAccess);
            await supabaseClient.auth.signOut();
            setTimeout(() => router.replace('/'), 2000);
            return;
          }
        }

        setStatus(t.statusRedirecting);
        router.replace(next);
      } catch (e) {
        logger.error('[discord-member] error', e);
        setError(t.errConnection);
        setStatus(t.statusConnectionError);
        setTimeout(() => router.replace('/'), 1000);
      }
    };

    ensureRole();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="text-center space-y-2">
        <div className="text-lg font-semibold">{status}</div>
        <div className="text-sm text-gray-400">{t.waitMessage}</div>
        {error && (
          <>
            <div className="mx-auto mt-2 max-w-md text-sm text-red-300">
              {error}
            </div>
            <Link
              href={backHref}
              className="mt-4 inline-flex rounded-xl border border-white/15 px-5 py-2.5 text-sm font-semibold transition hover:bg-white/10"
            >
              {t.backCta}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
