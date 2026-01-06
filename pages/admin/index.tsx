import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabaseClient } from '@/utils/supabase';
import { withStaffPage } from '@/utils/staff';

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
  avatar_url: string | null;
  role: string;
  created_at: string;
};

type Props = {
  staff: StaffShape;
};

export const getServerSideProps = withStaffPage('helper');

type Shortcut = {
  category: string;
  href: string;
  label: string;
  description: string;
};

const ADMIN_SHORTCUTS: Shortcut[] = [
  // Base
  {
    category: 'Général',
    href: '/admin',
    label: 'Dashboard',
    description: 'Accueil staff',
  },
  // Tournois
  {
    category: 'Tournois',
    href: '/admin/tournaments',
    label: 'Tournois – liste',
    description: 'Voir/éditer les tournois',
  },
  {
    category: 'Tournois',
    href: '/admin/tournaments/create',
    label: 'Créer un tournoi',
    description: 'Nouveau tournoi',
  },
  // Équipes
  {
    category: 'Équipes',
    href: '/admin/teams',
    label: 'Équipes – liste',
    description: 'Gérer les équipes',
  },
  {
    category: 'Équipes',
    href: '/admin/teams/new',
    label: 'Créer une équipe',
    description: 'Ajouter une équipe',
  },
  {
    category: 'Équipes',
    href: '/admin/teams/add-member',
    label: 'Ajouter membre équipe',
    description: 'Staff: ajouter un membre',
  },
  {
    category: 'Équipes',
    href: '/admin/teams/my',
    label: 'Gérer mon équipe (capitaine)',
    description: 'Espace capitaine',
  },
  // Annonces
  {
    category: 'Annonces',
    href: '/admin/announcements',
    label: 'Bandeau pub – liste',
    description: 'Annonces défilantes',
  },
  // News
  {
    category: 'News',
    href: '/admin/news',
    label: 'News – liste',
    description: 'Gérer les articles',
  },
  {
    category: 'News',
    href: '/admin/news/new',
    label: 'Créer une news',
    description: 'Nouvel article',
  },
  // Commentaires
  {
    category: 'Commentaires',
    href: '/admin/comments',
    label: 'Commentaires – liste',
    description: 'Modération commentaires',
  },
  // Comptes / demandes
  {
    category: 'Comptes',
    href: '/admin/users/manage',
    label: 'Gérer les utilisateurs',
    description: 'Rôles & accès',
  },
  {
    category: 'Comptes',
    href: '/admin/users/new',
    label: 'Créer un utilisateur',
    description: 'Ajout manuel',
  },
  {
    category: 'Comptes',
    href: '/admin/demandes',
    label: 'Demandes joueurs / équipes',
    description: 'Valider ou refuser',
  },
  // Logs / stats
  {
    category: 'Logs & Stats',
    href: '/admin/logs',
    label: 'Logs staff',
    description: 'Journal actions',
  },
  {
    category: 'Logs & Stats',
    href: '/admin/stats/teams',
    label: 'Stats équipes',
    description: 'Performances équipes',
  },
  {
    category: 'Logs & Stats',
    href: '/admin/stats/maps',
    label: 'Stats maps',
    description: 'Performances par carte',
  },
];

function AdminProfilePage({ staff }: Props) {
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    displayName: '',
    avatarUrl: '',
  });

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
          setErrorMsg('Session staff introuvable. Merci de te reconnecter.');
          return;
        }

        const res = await fetch('/api/admin/me', {
          headers: { Authorization: `Bearer ${token}` },
        });

        const json = await res.json();
        if (!res.ok || json?.error) {
          throw new Error(json?.error || 'Impossible de charger ton profil.');
        }

        setProfile(json as StaffProfile);
        setForm({
          displayName: json.display_name || '',
          avatarUrl: json.avatar_url || '',
        });
      } catch (err: any) {
        console.error('AdminProfilePage: profile fetch error', err);
        setErrorMsg(err?.message || 'Erreur inattendue');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  const updateField = (k: 'displayName' | 'avatarUrl', v: string) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();

      const token = session?.access_token;
      if (!token) {
        throw new Error('Session staff introuvable. Merci de te reconnecter.');
      }

      const res = await fetch('/api/admin/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          displayName: form.displayName,
          avatarUrl: form.avatarUrl,
        }),
      });

      const json = await res.json();
      if (!res.ok || json?.error) {
        throw new Error(json?.error || 'Impossible de mettre à jour ton profil.');
      }

      setProfile(json as StaffProfile);
      setForm({
        displayName: json.display_name || '',
        avatarUrl: json.avatar_url || '',
      });
      setSuccessMsg('Profil mis à jour.');
    } catch (err: any) {
      console.error('AdminProfilePage: profile update error', err);
      setErrorMsg(err?.message || 'Erreur inattendue');
    } finally {
      setSaving(false);
    }
  };

  const displayName =
    profile?.display_name ?? staff.display_name ?? 'Profil staff';
  const email = profile?.email ?? '—';
  const roleLabel = formatRoleLabel(profile?.role ?? staff.role);
  const staffId = profile?.id ?? staff.id ?? '—';
  const authUserId = profile?.auth_user_id ?? '—';
  const createdAt = profile?.created_at
    ? new Date(profile.created_at).toLocaleString()
    : '—';

  const shortcutsByCategory = useMemo(() => {
    const grouped = new Map<string, Shortcut[]>();
    ADMIN_SHORTCUTS.forEach((s) => {
      const list = grouped.get(s.category) || [];
      list.push(s);
      grouped.set(s.category, list);
    });
    return Array.from(grouped.entries());
  }, []);

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
        </header>

        <div className="grid gap-6">
          <section className="bg-neutral-800 border border-neutral-700 rounded-xl p-6 space-y-4">
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
              <div className="text-sm text-neutral-400">
                Chargement du profil…
              </div>
            )}

            {errorMsg && (
              <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                {errorMsg}
              </div>
            )}
            {successMsg && (
              <div className="text-sm text-emerald-100 bg-emerald-500/10 border border-emerald-400/40 rounded-lg px-3 py-2">
                {successMsg}
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="grid gap-4 sm:grid-cols-2">
                <InfoRow label="Email" value={email} />
                <InfoRow label="Rôle staff" value={roleLabel} />
                <InfoRow label="ID staff" value={staffId} mono />
                <InfoRow label="ID utilisateur" value={authUserId} mono />
                <InfoRow label="Profil créé le" value={createdAt} />
              </div>
              <form
                onSubmit={handleUpdateProfile}
                className="bg-neutral-900/50 border border-neutral-700 rounded-lg p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Modifier mon profil</p>
                    <p className="text-xs text-neutral-400">
                      Nom affiché et avatar.
                    </p>
                  </div>
                  {profile?.avatar_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profile.avatar_url}
                      alt="Avatar"
                      className="w-12 h-12 rounded-full border border-white/10 object-cover"
                    />
                  )}
                </div>
                <div className="grid gap-2">
                  <label className="text-xs uppercase tracking-[0.12em] text-neutral-400">
                    Nom affiché
                  </label>
                  <input
                    className="bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
                    value={form.displayName}
                    onChange={(e) => updateField('displayName', e.target.value)}
                    placeholder="Ton pseudo staff"
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-xs uppercase tracking-[0.12em] text-neutral-400">
                    Avatar (URL)
                  </label>
                  <input
                    className="bg-neutral-950 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
                    value={form.avatarUrl}
                    onChange={(e) => updateField('avatarUrl', e.target.value)}
                    placeholder="https://…"
                  />
                  <p className="text-xs text-neutral-500">
                    Optionnel. Laisse vide pour retirer l&apos;avatar.
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 transition text-sm font-semibold"
                >
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </form>
            </div>
          </section>
        </div>

        <section className="mt-6 bg-neutral-800 border border-neutral-700 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-semibold">Gestion</h2>
          </div>
          <div className="space-y-5">
            {shortcutsByCategory.map(([category, list]) => (
              <div key={category} className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-neutral-200">
                    {category}
                  </h3>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {list.map((s) => (
                    <Shortcut
                      key={s.href}
                      href={s.href}
                      label={s.label}
                      description={s.description}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
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
          mono ? 'font-mono text-neutral-200 break-all' : 'font-semibold'
        }`}
      >
        {value || '—'}
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
    case 'owner':
      return 'Owner';
    case 'admin':
      return 'Admin';
    case 'manager':
      return 'Manager';
    case 'referee':
      return 'Arbitre';
    case 'caster':
      return 'Caster';
    case 'helper':
      return 'Staff';
    default:
      return role;
  }
}
