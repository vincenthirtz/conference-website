import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabaseClient } from '@/utils/supabase';
import { useAdminFetch } from '@/hooks/useAdminFetch';

import { logger } from '../../utils/logger';
export default function DiscordMemberRedirect() {
  const router = useRouter();
  const { adminFetch } = useAdminFetch();
  const [status, setStatus] = useState('Connexion via Discord…');
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
          setStatus('Validation de la connexion…');
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
          setStatus("Session introuvable. Redirection vers l'accueil.");
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

        // 3) Si la destination est /admin, vérifier que l'utilisateur a un rôle staff
        if (next.startsWith('/admin')) {
          setStatus('Vérification des permissions…');

          const res = await adminFetch('/api/admin/me', {
            skipAuthRedirect: true,
          });

          if (!res.ok) {
            // L'utilisateur n'a pas de rôle staff → rediriger vers l'accueil avec message
            setError(
              "Ton compte n'a pas d'accès staff. Contacte un admin si c'est une erreur."
            );
            setStatus("Pas d'accès staff. Redirection vers l'accueil…");
            await supabaseClient.auth.signOut();
            setTimeout(() => router.replace('/'), 2000);
            return;
          }
        }

        setStatus('Redirection…');
        router.replace(next);
      } catch (e) {
        logger.error('[discord-member] error', e);
        setError('Erreur de connexion Discord. Réessaie.');
        setStatus('Erreur de connexion. Redirection vers accueil…');
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
        <div className="text-sm text-gray-400">
          Merci de patienter pendant la finalisation de la connexion.
        </div>
        {error && <div className="text-sm text-red-300 mt-2">{error}</div>}
      </div>
    </div>
  );
}
