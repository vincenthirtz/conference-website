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

export const getServerSideProps = withStaffPage('caster');

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
  {
    category: 'Annonces',
    href: '/admin/announcements/new',
    label: 'Créer une annonce',
    description: 'Nouvelle annonce',
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
  // Contact
  {
    category: 'Contact',
    href: '/admin/contact-submissions',
    label: 'Messages de contact',
    description: 'Gérer les demandes',
  },
  // Partenaires
  {
    category: 'Partenaires',
    href: '/admin/partners',
    label: 'Partenaires – liste',
    description: 'Gérer les partenaires',
  },
  {
    category: 'Partenaires',
    href: '/admin/partners/new',
    label: 'Ajouter un partenaire',
    description: 'Nouveau partenaire',
  },
  {
    category: 'Partenaires',
    href: '/admin/partnership-requests',
    label: 'Demandes de partenariat',
    description: 'Formulaires reçus',
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
  // Production & Cast
  {
    category: 'Production & Cast',
    href: '/admin/cast-members',
    label: 'Casteuses – liste',
    description: 'Gérer les casteuses',
  },
  {
    category: 'Production & Cast',
    href: '/admin/cast-members/new',
    label: 'Ajouter une casteuse',
    description: 'Nouvel ajout',
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
  // Configuration
  {
    category: 'Configuration',
    href: '/admin/site-settings',
    label: 'Paramètres du site',
    description: 'Vidéo, URLs, etc.',
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

  // Email change state
  const [newEmail, setNewEmail] = useState('');
  const [emailChanging, setEmailChanging] = useState(false);
  const [emailSuccessMsg, setEmailSuccessMsg] = useState<string | null>(null);
  const [emailErrorMsg, setEmailErrorMsg] = useState<string | null>(null);

  // Password change state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordChanging, setPasswordChanging] = useState(false);
  const [passwordSuccessMsg, setPasswordSuccessMsg] = useState<string | null>(null);
  const [passwordErrorMsg, setPasswordErrorMsg] = useState<string | null>(null);

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

  const handleEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || newEmail === profile?.email) return;

    setEmailChanging(true);
    setEmailErrorMsg(null);
    setEmailSuccessMsg(null);

    try {
      const { error } = await supabaseClient.auth.updateUser({ email: newEmail });

      if (error) {
        throw error;
      }

      setEmailSuccessMsg(
        'Un email de confirmation a été envoyé à ta nouvelle adresse. Clique sur le lien pour confirmer le changement.'
      );
      setNewEmail('');
    } catch (err: any) {
      console.error('AdminProfilePage: email change error', err);
      setEmailErrorMsg(err?.message || 'Erreur lors du changement d\'email.');
    } finally {
      setEmailChanging(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 8) {
      setPasswordErrorMsg('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordErrorMsg('Les mots de passe ne correspondent pas.');
      return;
    }

    setPasswordChanging(true);
    setPasswordErrorMsg(null);
    setPasswordSuccessMsg(null);

    try {
      const { error } = await supabaseClient.auth.updateUser({ password: newPassword });

      if (error) {
        throw error;
      }

      setPasswordSuccessMsg('Ton mot de passe a été modifié avec succès.');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      console.error('AdminProfilePage: password change error', err);
      setPasswordErrorMsg(err?.message || 'Erreur lors du changement de mot de passe.');
    } finally {
      setPasswordChanging(false);
    }
  };

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

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <p className="text-sm text-neutral-400">Espace staff</p>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight mt-1">
              Mon profil
            </h1>
            <p className="text-sm text-neutral-400 mt-2">
              Résumé de ton compte staff et raccourcis utiles.
            </p>
          </div>

          {/* Messages */}
          {errorMsg && (
            <div className="mb-6 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm flex items-center gap-2">
              <svg
                className="w-5 h-5 text-red-400 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="mb-6 rounded-xl bg-emerald-900/40 border border-emerald-500/50 px-4 py-3 text-sm flex items-center gap-2">
              <svg
                className="w-5 h-5 text-emerald-400 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              {successMsg}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left Column - Profile Info */}
            <div className="lg:col-span-2 space-y-6">
              {/* Profile Card */}
              <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
                  <div className="flex items-center gap-4">
                    {profile?.avatar_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={profile.avatar_url}
                        alt="Avatar"
                        className="w-16 h-16 rounded-xl border-2 border-neutral-700 shadow-lg object-cover"
                      />
                    )}
                    <div>
                      <h2 className="text-2xl font-bold">{displayName}</h2>
                      <span className="inline-block mt-1 px-3 py-1 rounded-full text-sm font-semibold bg-emerald-600/20 text-emerald-300 border border-emerald-500/30">
                        {roleLabel}
                      </span>
                    </div>
                  </div>
                  <Link
                    href="/admin/logout"
                    className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-sm font-medium transition-colors flex items-center gap-2"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                      />
                    </svg>
                    Déconnexion
                  </Link>
                </div>

                {loading && (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
                  </div>
                )}

                {!loading && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="bg-neutral-900/50 rounded-xl p-4">
                      <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
                        Email
                      </div>
                      <div className="font-medium text-sm truncate">{email}</div>
                    </div>
                    <div className="bg-neutral-900/50 rounded-xl p-4">
                      <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
                        Rôle staff
                      </div>
                      <div className="font-medium">{roleLabel}</div>
                    </div>
                    <div className="bg-neutral-900/50 rounded-xl p-4">
                      <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
                        Profil créé le
                      </div>
                      <div className="font-medium text-sm">{createdAt}</div>
                    </div>
                    <div className="bg-neutral-900/50 rounded-xl p-4 col-span-2 md:col-span-3">
                      <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
                        ID staff
                      </div>
                      <div className="font-mono text-xs text-neutral-300 break-all">
                        {staffId}
                      </div>
                    </div>
                  </div>
                )}
              </section>

              {/* Shortcuts Section */}
              <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-neutral-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                    />
                  </svg>
                  Gestion
                </h2>
                <div className="space-y-5">
                  {shortcutsByCategory.map(([category, list]) => (
                    <div key={category} className="space-y-2">
                      <h3 className="text-sm font-semibold text-neutral-400">
                        {category}
                      </h3>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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

            {/* Right Column - Edit Profile */}
            <div className="space-y-6">
              <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-neutral-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                  Modifier mon profil
                </h2>
                <form onSubmit={handleUpdateProfile} className="space-y-4">
                  <div>
                    <label className="block text-sm text-neutral-400 mb-1">
                      Nom affiché
                    </label>
                    <input
                      className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                      value={form.displayName}
                      onChange={(e) => updateField('displayName', e.target.value)}
                      placeholder="Ton pseudo staff"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-neutral-400 mb-1">
                      Avatar (URL)
                    </label>
                    <input
                      className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                      value={form.avatarUrl}
                      onChange={(e) => updateField('avatarUrl', e.target.value)}
                      placeholder="https://…"
                    />
                    <p className="text-xs text-neutral-500 mt-1">
                      Optionnel. Laisse vide pour retirer l&apos;avatar.
                    </p>
                  </div>
                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center justify-center gap-2"
                  >
                    {saving ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Enregistrement…
                      </>
                    ) : (
                      'Enregistrer'
                    )}
                  </button>
                </form>
              </section>

              {/* Change Email */}
              <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-neutral-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                  Changer mon email
                </h2>

                {emailSuccessMsg && (
                  <div className="mb-4 rounded-xl bg-emerald-900/40 border border-emerald-500/50 px-4 py-3 text-sm flex items-center gap-2">
                    <svg
                      className="w-5 h-5 text-emerald-400 flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {emailSuccessMsg}
                  </div>
                )}
                {emailErrorMsg && (
                  <div className="mb-4 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm flex items-center gap-2">
                    <svg
                      className="w-5 h-5 text-red-400 flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {emailErrorMsg}
                  </div>
                )}

                <form onSubmit={handleEmailChange} className="space-y-4">
                  <div>
                    <label className="block text-sm text-neutral-400 mb-1">
                      Nouvel email
                    </label>
                    <input
                      type="email"
                      className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="nouveau@email.com"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={emailChanging || !newEmail || newEmail === profile?.email}
                    className="w-full px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center justify-center gap-2"
                  >
                    {emailChanging ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Envoi en cours…
                      </>
                    ) : (
                      'Changer mon email'
                    )}
                  </button>
                </form>
                <p className="text-xs text-neutral-500 mt-3">
                  Un email de confirmation sera envoyé à la nouvelle adresse.
                </p>
              </section>

              {/* Change Password */}
              <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-neutral-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                  Changer mon mot de passe
                </h2>

                {passwordSuccessMsg && (
                  <div className="mb-4 rounded-xl bg-emerald-900/40 border border-emerald-500/50 px-4 py-3 text-sm flex items-center gap-2">
                    <svg
                      className="w-5 h-5 text-emerald-400 flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {passwordSuccessMsg}
                  </div>
                )}
                {passwordErrorMsg && (
                  <div className="mb-4 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm flex items-center gap-2">
                    <svg
                      className="w-5 h-5 text-red-400 flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {passwordErrorMsg}
                  </div>
                )}

                <form onSubmit={handlePasswordChange} className="space-y-4">
                  <div>
                    <label className="block text-sm text-neutral-400 mb-1">
                      Nouveau mot de passe
                    </label>
                    <input
                      type="password"
                      className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      minLength={8}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-neutral-400 mb-1">
                      Confirmer le mot de passe
                    </label>
                    <input
                      type="password"
                      className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      minLength={8}
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={passwordChanging || !newPassword || !confirmPassword}
                    className="w-full px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center justify-center gap-2"
                  >
                    {passwordChanging ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Modification…
                      </>
                    ) : (
                      'Changer mon mot de passe'
                    )}
                  </button>
                </form>
                <p className="text-xs text-neutral-500 mt-3">
                  Minimum 8 caractères.
                </p>
              </section>

              {/* System Info */}
              <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                <h2 className="text-sm font-semibold text-neutral-400 mb-3">
                  Informations système
                </h2>
                <div className="space-y-3 text-sm">
                  <div>
                    <div className="text-xs text-neutral-500 mb-1">
                      ID utilisateur
                    </div>
                    <div className="font-mono text-xs bg-neutral-900 px-3 py-2 rounded-lg border border-neutral-700 break-all">
                      {authUserId}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default AdminProfilePage;

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
      className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-neutral-900/50 hover:bg-neutral-700/50 transition-colors group"
    >
      <div>
        <div className="font-medium text-sm group-hover:text-white transition-colors">
          {label}
        </div>
        <div className="text-xs text-neutral-500">{description}</div>
      </div>
      <svg
        className="w-4 h-4 text-neutral-500 group-hover:text-white transition-colors flex-shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 5l7 7-7 7"
        />
      </svg>
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
    case 'caster':
      return 'Caster';
    default:
      return role;
  }
}
