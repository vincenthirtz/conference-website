// pages/admin/logout.tsx
//
// L'écran de déconnexion staff. Son seul travail : rendre la session
// inutilisable, PARTOUT, et renvoyer vers /login — vite.
//
// L'ordre des trois étapes n'est pas cosmétique :
//
//   1. l'appel serveur part EN PREMIER, tant que les cookies `sb-*` sont
//      encore dans le document (c'est eux qui l'authentifient), et il n'est
//      PAS attendu : une requête lancée survit à une navigation côté client.
//      C'est lui qui révoque le refresh token côté Supabase.
//   2. le nettoyage local utilise `scope: 'local'`, qui ne fait AUCUN appel
//      réseau — la révocation est déjà partie à l'étape 1. Celui-là est
//      attendu : /login relit la session au montage et REDIRIGE vers /admin
//      s'il en trouve encore une. Naviguer trop tôt renverrait la personne
//      d'où elle vient.
//   3. on va droit sur /login : /admin/login n'est qu'un getServerSideProps
//      qui redirige vers /login — un aller-retour serveur pour rien.
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import {
  supabaseClient,
  purgeSupabaseAuthStorage,
} from '@/utils/supabaseBrowser';
import { STAFF_CACHE_KEY } from '@/hooks/useStaffSession';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminLogout from '@/lib/i18n/locales/admin-fr/adminLogout';

export default function AdminLogoutPage() {
  const router = useRouter();
  const t = useAdminT(nsAdminLogout);

  useEffect(() => {
    const run = async () => {
      // Cache staff de la navbar. 'staff_cache' est l'ANCIENNE clé : le code
      // a été bumpé en `staff_cache_v2` sans que cette ligne suive, donc une
      // identité staff périmée survivait jusqu'à 2 min après la déconnexion.
      // On retire les deux.
      try {
        sessionStorage.removeItem(STAFF_CACHE_KEY);
        sessionStorage.removeItem('staff_cache');
      } catch {}

      // 1. Serveur : cookies SSR + révocation globale. Lancé, pas attendu.
      void fetch('/api/admin/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      }).catch(() => {});

      // 2. Local : instantané, hors réseau. Attendu.
      try {
        await supabaseClient.auth.signOut({ scope: 'local' });
      } catch {}
      purgeSupabaseAuthStorage();

      // 3. Retour à la page de connexion, sans détour.
      router.replace('/login');
    };

    run();
  }, [router]);

  return (
    <div className="min-h-screen bg-neutral-900 text-white flex items-center justify-center">
      <div className="text-center space-y-2">
        <p className="text-sm text-neutral-300">{t.loggingOut}</p>
        <p className="text-xs text-neutral-500">{t.redirectNote}</p>
      </div>
    </div>
  );
}
