import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabaseClient } from '@/utils/supabase';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useT } from '@/lib/i18n/useT';

import { logger } from '../../utils/logger';
import nsAuthDiscordMember from '@/lib/i18n/locales/fr/authDiscordMember';
export default function DiscordMemberRedirect() {
  const router = useRouter();
  const { adminFetch } = useAdminFetch();
  const t = useT(nsAuthDiscordMember);
  const [status, setStatus] = useState(t.statusConnecting);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ensureRole = async () => {
      try {
        // Validate redirect target to prevent open redirects
        const rawNext = (router.query.next as string) || '/';
        const next =
          rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';
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

        // Persist the Discord identity so the bot can DM the user later.
        // Best-effort: a failure here must not block the OAuth flow.
        try {
          await fetch('/api/auth/link-discord', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${sessionData.session.access_token}`,
            },
          });
        } catch (linkErr) {
          logger.warn('[discord-member] link-discord failed', linkErr);
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
        {error && <div className="text-sm text-red-300 mt-2">{error}</div>}
      </div>
    </div>
  );
}
