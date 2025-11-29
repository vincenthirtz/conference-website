import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";
import { StaffRoleBadge } from "@/components/admin/StaffRoleBadge";
import { supabaseClient } from "@/utils/supabase";
import { withStaffPage } from "@/utils/staff";

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type StaffProfile = {
  id: string;
  auth_user_id: string;
  email: string;
  display_name: string | null;
  role: string;
  created_at: string;
};

type Props = {
  staff: StaffShape;
};

export const getServerSideProps = withStaffPage("helper");

function AdminProfilePage({ staff }: Props) {
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      setLoading(true);
      setErrorMsg(null);

      try {
        const {
          data: { session },
        } = await supabaseClient.auth.getSession();

        const token = session?.access_token;
        if (!token) {
          setErrorMsg("Session staff introuvable. Merci de te reconnecter.");
          return;
        }

        const res = await fetch("/api/admin/me", {
          headers: { Authorization: `Bearer ${token}` },
        });

        const json = await res.json();
        if (!res.ok || json?.error) {
          throw new Error(json?.error || "Impossible de charger ton profil.");
        }

        setProfile(json as StaffProfile);
      } catch (err: any) {
        console.error("AdminProfilePage: profile fetch error", err);
        setErrorMsg(err?.message || "Erreur inattendue");
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  const displayName = profile?.display_name ?? staff.display_name ?? "Profil staff";
  const email = profile?.email ?? "—";
  const roleLabel = formatRoleLabel(profile?.role ?? staff.role);
  const staffId = profile?.id ?? staff.id ?? "—";
  const authUserId = profile?.auth_user_id ?? "—";
  const createdAt = profile?.created_at
    ? new Date(profile.created_at).toLocaleString()
    : "—";

  return (
    <>
      <Head>
        <title>Admin – Mon profil</title>
      </Head>

      <div className="min-h-screen bg-neutral-900 text-white p-6 pt-20">
        <header className="flex items-center justify-between flex-wrap gap-4 mb-6">
          <div>
            <p className="text-sm text-neutral-400">Espace staff</p>
            <h1 className="text-3xl font-bold mt-1">Mon profil</h1>
            <p className="text-sm text-neutral-400 mt-1">
              Résumé de ton compte staff et raccourcis utiles.
            </p>
          </div>
          <StaffRoleBadge staff={staff} />
        </header>

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="lg:col-span-2 bg-neutral-800 border border-neutral-700 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs uppercase tracking-[0.12em] text-neutral-400">
                  Nom affiché
                </p>
                <p className="text-2xl font-semibold">{displayName}</p>
                <p className="text-sm text-neutral-400">{roleLabel}</p>
              </div>

              <Link
                href="/admin/logout"
                className="text-sm px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 transition"
              >
                Déconnexion
              </Link>
            </div>

            {loading && (
              <div className="text-sm text-neutral-400">Chargement du profil…</div>
            )}

            {errorMsg && (
              <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                {errorMsg}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <InfoRow label="Email" value={email} />
              <InfoRow label="Rôle staff" value={roleLabel} />
              <InfoRow label="ID staff" value={staffId} mono />
              <InfoRow label="ID utilisateur" value={authUserId} mono />
              <InfoRow label="Profil créé le" value={createdAt} />
            </div>
          </section>

          <section className="bg-neutral-800 border border-neutral-700 rounded-xl p-6 space-y-3">
            <h2 className="text-lg font-semibold">Raccourcis</h2>
            <Shortcut
              href="/admin/tournaments"
              label="Tournois"
              description="Créer, éditer ou publier un tournoi."
            />
            <Shortcut
              href="/admin/demandes"
              label="Demandes joueurs / équipes"
              description="Valide ou refuse les demandes en attente."
            />
            <Shortcut
              href="/admin/stats/teams"
              label="Stats équipes"
              description="Consulte les performances par équipe."
            />
            <Shortcut
              href="/admin/logs"
              label="Logs staff"
              description="Historique des actions administrateur."
            />
          </section>
        </div>
      </div>
    </>
  );
}

export default AdminProfilePage;

function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-neutral-900/40 border border-neutral-700 px-4 py-3">
      <span className="text-xs uppercase tracking-[0.14em] text-neutral-400">
        {label}
      </span>
      <span
        className={`text-sm sm:text-base ${
          mono ? "font-mono text-neutral-200 break-all" : "font-semibold"
        }`}
      >
        {value || "—"}
      </span>
    </div>
  );
}

function Shortcut({
  href,
  label,
  description,
}: {
  href: string;
  label: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-lg border border-neutral-700 bg-neutral-900/40 hover:border-neutral-500 hover:bg-neutral-900/70 transition px-4 py-3"
    >
      <p className="text-sm font-semibold">{label}</p>
      <p className="text-xs text-neutral-400">{description}</p>
    </Link>
  );
}

function formatRoleLabel(role: string) {
  switch (role) {
    case "owner":
      return "Owner";
    case "admin":
      return "Admin";
    case "manager":
      return "Manager";
    case "referee":
      return "Arbitre";
    case "caster":
      return "Caster";
    case "helper":
      return "Staff";
    default:
      return role;
  }
}
