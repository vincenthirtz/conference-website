// pages/admin/logout.tsx
import { useEffect } from "react";
import { useRouter } from "next/router";
import { supabaseClient } from "@/utils/supabase";

export default function AdminLogoutPage() {
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      try {
        // 1) Nettoyage côté serveur (cookies SSR)
        await fetch("/api/admin/logout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        });
      } catch (e) {
        console.error("AdminLogoutPage: API logout error", e);
      }

      try {
        // 2) Nettoyage côté client (localStorage / mémoire)
        await supabaseClient.auth.signOut();
      } catch (e) {
        console.error("AdminLogoutPage: client signOut error", e);
      }

      // 3) Redirection vers la page de connexion staff
      router.replace("/admin/login");
    };

    run();
  }, [router]);

  return (
    <div className="min-h-screen bg-neutral-900 text-white flex items-center justify-center">
      <div className="text-center space-y-2">
        <p className="text-sm text-neutral-300">
          Déconnexion en cours…
        </p>
        <p className="text-xs text-neutral-500">
          Tu vas être redirigé·e vers la page de connexion staff.
        </p>
      </div>
    </div>
  );
}
