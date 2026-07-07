// pages/admin/logout.tsx
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabaseClient } from '@/utils/supabase';
import { useAdminT } from '@/lib/i18n/useAdminT';

export default function AdminLogoutPage() {
  const router = useRouter();
  const t = useAdminT('adminLogout');

  useEffect(() => {
    const run = async () => {
      // Nettoyage du cache staff navbar
      try {
        sessionStorage.removeItem('staff_cache');
      } catch {}

      // Nettoyage serveur (cookies) et client (localStorage) en parallèle
      await Promise.allSettled([
        fetch('/api/admin/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
        supabaseClient.auth.signOut(),
      ]);

      router.replace('/admin/login');
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
