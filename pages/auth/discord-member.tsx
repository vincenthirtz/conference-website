import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabaseClient } from '@/utils/supabase';

export default function DiscordMemberRedirect() {
  const router = useRouter();
  const [status, setStatus] = useState('Connexion via Discord…');

  useEffect(() => {
    const ensureRole = async () => {
      try {
        const next = (router.query.next as string) || '/';

        const {
          data: { user },
          error,
        } = await supabaseClient.auth.getUser();

        if (error || !user) {
          setStatus("Session introuvable. Redirection vers l'accueil.");
          setTimeout(() => router.replace('/'), 1000);
          return;
        }

        const currentRole = user.user_metadata?.role;
        if (!currentRole) {
          await supabaseClient.auth.updateUser({
            data: { role: 'member' },
          });
        }

        setStatus('Redirection…');
        router.replace(next);
      } catch (e) {
        setStatus('Erreur de connexion. Redirection vers accueil…');
        setTimeout(() => router.replace('/'), 1000);
      }
    };

    ensureRole();
  }, [router]);

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="text-center space-y-2">
        <div className="text-lg font-semibold">{status}</div>
        <div className="text-sm text-gray-400">
          Merci de patienter pendant la finalisation de la connexion.
        </div>
      </div>
    </div>
  );
}
