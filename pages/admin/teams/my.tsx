import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { supabaseClient } from '@/utils/supabase';
import { withStaffPage } from '@/utils/staff';

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type StaffProps = {
  staff: StaffShape;
};

type TeamLite = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  bio: string | null;
  country?: string | null;
  description?: string | null;
};

type TeamOption = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
};

type Member = {
  id: string;
  user_id: string | null;
  display_name: string | null;
  role: string | null;
  captain?: boolean | null;
  is_captain?: boolean | null;
};

type ApiResponse = {
  team: TeamLite | null;
  members: Member[];
  isCaptain: boolean;
  error?: string;
};

type SearchResult = {
  id: string;
  email: string | null;
  display_name: string | null;
  battle_tag: string | null;
  has_team: boolean;
};

export const getServerSideProps = withStaffPage('caster');

function MyTeamPage({ staff }: StaffProps) {
  const router = useRouter();
  const isStaffAdmin = staff.role === 'admin' || staff.role === 'owner' || staff.role === 'manager';

  // Team selection for admins
  const [allTeams, setAllTeams] = useState<TeamOption[]>([]);
  const [loadingAllTeams, setLoadingAllTeams] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '',
    short_name: '',
    bio: '',
    logo_url: '',
    country: '',
    description: '',
  });

  // Search and add member state
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<SearchResult | null>(null);
  const [newMemberRole, setNewMemberRole] = useState('player');
  const [newMemberBattleTag, setNewMemberBattleTag] = useState('');
  const [addingMember, setAddingMember] = useState(false);

  // Load all teams for admin selector
  const loadAllTeams = useCallback(async () => {
    if (!isStaffAdmin) return;
    setLoadingAllTeams(true);
    try {
      const res = await fetch('/api/admin/teams?limit=500&includeTotal=0');
      if (res.ok) {
        const json = await res.json();
        setAllTeams(json.teams || []);
      }
    } catch (err) {
      console.error('Failed to load teams list', err);
    } finally {
      setLoadingAllTeams(false);
    }
  }, [isStaffAdmin]);

  useEffect(() => {
    loadAllTeams();
  }, [loadAllTeams]);

  const load = useCallback(async (teamId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      if (!session) {
        router.replace('/admin/login');
        return;
      }

      // If admin and a specific team is selected, fetch that team
      let url = '/api/admin/teams/my';
      if (isStaffAdmin && teamId) {
        url = `/api/admin/teams/${teamId}`;
      }

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();

      if (!res.ok) {
        // For admin fetching specific team, format response
        if (isStaffAdmin && teamId) {
          throw new Error(json?.error || 'Equipe introuvable');
        }
        throw new Error(json?.error || 'Chargement impossible');
      }

      // Handle different API response formats
      if (isStaffAdmin && teamId && json.team) {
        // Admin team fetch returns { team, members }
        setData({
          team: json.team,
          members: json.members || [],
          isCaptain: true, // Admin has full access
        });
        setForm({
          name: json.team.name || '',
          short_name: json.team.short_name || '',
          bio: json.team.bio || '',
          logo_url: json.team.logo_url || '',
          country: json.team.country || '',
          description: json.team.description || '',
        });
      } else {
        setData(json);
        if (json.team) {
          setForm({
            name: json.team.name || '',
            short_name: json.team.short_name || '',
            bio: json.team.bio || '',
            logo_url: json.team.logo_url || '',
            country: json.team.country || '',
            description: json.team.description || '',
          });
        }
      }
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Erreur inattendue.');
    } finally {
      setLoading(false);
    }
  }, [router, isStaffAdmin]);

  useEffect(() => {
    // If admin has selected a team, load that team
    if (isStaffAdmin && selectedTeamId) {
      load(selectedTeamId);
    } else if (!isStaffAdmin) {
      // For non-admin (captain), load their own team
      load();
    }
  }, [load, isStaffAdmin, selectedTeamId]);

  const updateField = (k: keyof typeof form, v: string) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    if (!data?.team) return;
    setSaving(true);
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      if (!session) {
        router.replace('/admin/login');
        return;
      }

      // Use admin endpoint for staff, captain endpoint for captains
      const url = isStaffAdmin
        ? `/api/admin/teams/${data.team.id}`
        : '/api/admin/teams/my';

      const res = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          teamId: data.team.id,
          ...form,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Enregistrement impossible');

      // Reload
      if (isStaffAdmin && selectedTeamId) {
        await load(selectedTeamId);
      } else {
        await load();
      }
    } catch (err: unknown) {
      alert((err as Error)?.message || 'Erreur lors de la sauvegarde.');
    } finally {
      setSaving(false);
    }
  };

  // Search players
  const handleSearchPlayers = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      if (!session) return;

      const res = await fetch(`/api/teams/search-players?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (res.ok && json.players) {
        setSearchResults(json.players);
      } else {
        setSearchResults([]);
      }
    } catch (err) {
      console.error('Search error:', err);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.length >= 2) {
        handleSearchPlayers(searchQuery);
      } else {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, handleSearchPlayers]);

  // Add member to team
  const handleAddMember = async () => {
    if (!selectedPlayer || !data?.team) return;
    setAddingMember(true);
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      if (!session) {
        router.replace('/admin/login');
        return;
      }

      // Use admin endpoint for staff
      const url = isStaffAdmin
        ? '/api/admin/teams/add-member'
        : '/api/teams/add-member';

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          teamId: data.team.id,
          userId: selectedPlayer.id,
          role: newMemberRole,
          battleTag: newMemberBattleTag || selectedPlayer.battle_tag,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json?.error || 'Erreur lors de l\'ajout');
        return;
      }
      // Reset and reload
      setShowAddModal(false);
      setSelectedPlayer(null);
      setSearchQuery('');
      setSearchResults([]);
      setNewMemberRole('player');
      setNewMemberBattleTag('');

      if (isStaffAdmin && selectedTeamId) {
        await load(selectedTeamId);
      } else {
        await load();
      }
    } catch (err: unknown) {
      alert((err as Error)?.message || 'Erreur lors de l\'ajout');
    } finally {
      setAddingMember(false);
    }
  };

  const canEdit = isStaffAdmin || data?.isCaptain;

  const renderMembers = () => {
    if (!data?.team) return null;
    if (!data.members?.length) {
      return (
        <div className="text-center py-8 text-neutral-400">
          <svg
            className="w-10 h-10 mx-auto mb-3 text-neutral-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          Aucun membre enregistre
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {data.members.map((m) => {
          const isCaptain = m.captain || m.is_captain;
          return (
            <div
              key={m.id}
              className={`p-3 flex items-center gap-3 rounded-xl transition-colors ${
                isCaptain
                  ? 'bg-amber-900/20 border border-amber-500/30'
                  : 'bg-neutral-900/50 border border-neutral-700/50 hover:bg-neutral-800/50'
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isCaptain ? 'bg-amber-500/20' : 'bg-neutral-700/50'
              }`}>
                {isCaptain ? (
                  <svg className="w-5 h-5 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white font-semibold truncate">
                    {m.display_name || m.user_id || m.id}
                  </span>
                  {isCaptain && (
                    <span className="text-[10px] uppercase tracking-wide bg-amber-500/20 text-amber-300 rounded-lg px-2 py-0.5 border border-amber-500/30 font-semibold">
                      Capitaine
                    </span>
                  )}
                </div>
                <div className="text-xs text-neutral-400">
                  {m.role || 'joueur'}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <Head>
        <title>Admin – Gestion equipe</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <button
              type="button"
              onClick={() => router.push('/admin/teams')}
              className="mb-4 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors"
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
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Retour a la liste des equipes
            </button>

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                  {data?.team ? data.team.name : 'Gestion equipe'}
                </h1>
                <p className="text-neutral-400 text-sm mt-1">
                  {isStaffAdmin
                    ? 'Mode administrateur : vous pouvez gerer toutes les equipes'
                    : data?.isCaptain
                      ? 'Vous etes capitaine : modification autorisee'
                      : 'Vue en lecture seule'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => isStaffAdmin && selectedTeamId ? load(selectedTeamId) : load()}
                className="px-4 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-sm font-medium transition-colors flex items-center gap-2"
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
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Rafraichir
              </button>
            </div>
          </div>

          {/* Admin Team Selector */}
          {isStaffAdmin && (
            <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 mb-6">
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex-1 min-w-[250px]">
                  <label className="block text-sm text-neutral-400 mb-1">
                    Selectionner une equipe a gerer
                  </label>
                  <select
                    value={selectedTeamId}
                    onChange={(e) => setSelectedTeamId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    disabled={loadingAllTeams}
                  >
                    <option value="">
                      {loadingAllTeams ? 'Chargement...' : '-- Choisir une equipe --'}
                    </option>
                    {allTeams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                        {t.short_name ? ` (${t.short_name})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedTeamId && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTeamId('');
                      setData(null);
                      setForm({
                        name: '',
                        short_name: '',
                        bio: '',
                        logo_url: '',
                        country: '',
                        description: '',
                      });
                    }}
                    className="px-4 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-sm font-medium transition-colors"
                  >
                    Reinitialiser
                  </button>
                )}
              </div>

              <p className="text-xs text-neutral-500 mt-3">
                En tant qu&apos;admin, vous pouvez selectionner n&apos;importe quelle equipe pour la modifier.
              </p>
            </section>
          )}

          {/* Loading state */}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
            </div>
          )}

          {/* Error state */}
          {!loading && error && (
            <div className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
              <div className="rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
                <div className="space-y-2">
                  <p>{error}</p>
                  {!isStaffAdmin && (
                    <button
                      type="button"
                      onClick={() => router.push('/admin/teams/new')}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors"
                    >
                      Creer mon equipe
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* No team selected (admin) or no team found (captain) */}
          {!loading && !error && !data?.team && (
            <div className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-8 text-center">
              <svg
                className="w-12 h-12 mx-auto mb-4 text-neutral-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              <p className="text-neutral-400">
                {isStaffAdmin
                  ? 'Selectionnez une equipe dans la liste ci-dessus pour la gerer.'
                  : 'Vous n\'etes capitaine d\'aucune equipe.'}
              </p>
            </div>
          )}

          {/* Team content */}
          {!loading && !error && data?.team && (
            <div className="grid gap-6 lg:grid-cols-[1.2fr,1fr]">
              {/* Team Info */}
              <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 space-y-5">
                <div className="flex items-center gap-4">
                  {data.team.logo_url ? (
                    <Image
                      src={data.team.logo_url}
                      alt={data.team.name}
                      width={64}
                      height={64}
                      className="w-16 h-16 rounded-xl object-cover border border-neutral-700"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-neutral-700/50 flex items-center justify-center border border-neutral-700">
                      <svg
                        className="w-8 h-8 text-neutral-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                        />
                      </svg>
                    </div>
                  )}
                  <div>
                    <h2 className="text-xl font-semibold">Informations equipe</h2>
                    {!canEdit && (
                      <p className="text-xs text-neutral-500">Lecture seule</p>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm text-neutral-300 mb-1">
                      Nom
                    </label>
                    <input
                      value={form.name}
                      onChange={(e) => updateField('name', e.target.value)}
                      disabled={!canEdit}
                      className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="block text-sm text-neutral-300 mb-1">
                        Tag court
                      </label>
                      <input
                        value={form.short_name}
                        onChange={(e) => updateField('short_name', e.target.value)}
                        disabled={!canEdit}
                        className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-neutral-300 mb-1">
                        Pays
                      </label>
                      <input
                        value={form.country}
                        onChange={(e) => updateField('country', e.target.value)}
                        disabled={!canEdit}
                        className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-neutral-300 mb-1">
                      Logo (URL)
                    </label>
                    <input
                      value={form.logo_url}
                      onChange={(e) => updateField('logo_url', e.target.value)}
                      disabled={!canEdit}
                      className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-neutral-300 mb-1">
                      Bio
                    </label>
                    <textarea
                      value={form.bio}
                      onChange={(e) => updateField('bio', e.target.value)}
                      disabled={!canEdit}
                      rows={3}
                      className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-y disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-neutral-300 mb-1">
                      Description (privee)
                    </label>
                    <textarea
                      value={form.description}
                      onChange={(e) => updateField('description', e.target.value)}
                      disabled={!canEdit}
                      rows={2}
                      className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-y disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>

                {canEdit && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving}
                      className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {saving ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Enregistrement...
                        </>
                      ) : (
                        <>
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
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                          Enregistrer
                        </>
                      )}
                    </button>
                  </div>
                )}
              </section>

              {/* Members */}
              <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">Membres</h2>
                    <p className="text-xs text-neutral-500">
                      {data.members?.length || 0} membre{(data.members?.length || 0) > 1 ? 's' : ''}
                    </p>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setShowAddModal(true)}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors flex items-center gap-2"
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
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                      Ajouter
                    </button>
                  )}
                </div>

                {renderMembers()}
              </section>
            </div>
          )}
        </div>
      </div>

      {/* Add Member Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-800 border border-neutral-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="p-4 border-b border-neutral-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Ajouter un membre</h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setSelectedPlayer(null);
                  setSearchQuery('');
                  setSearchResults([]);
                  setNewMemberBattleTag('');
                  setNewMemberRole('player');
                }}
                className="p-2 rounded-xl hover:bg-neutral-700 text-neutral-400 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              {!selectedPlayer ? (
                <>
                  {/* Search input */}
                  <div>
                    <label className="block text-sm text-neutral-400 mb-1">
                      Rechercher par email ou BattleTag
                    </label>
                    <div className="relative">
                      <svg
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                      </svg>
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="email@example.com ou Pseudo#1234"
                        className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        autoFocus
                      />
                    </div>
                  </div>

                  {/* Search results */}
                  <div className="space-y-2">
                    {searchLoading && (
                      <div className="flex items-center gap-2 text-neutral-400 text-sm py-4">
                        <div className="w-4 h-4 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
                        Recherche...
                      </div>
                    )}
                    {!searchLoading && searchQuery.length >= 2 && searchResults.length === 0 && (
                      <div className="text-neutral-400 text-sm py-4 text-center">
                        Aucun resultat
                      </div>
                    )}
                    {searchResults.map((player) => (
                      <button
                        key={player.id}
                        onClick={() => {
                          setSelectedPlayer(player);
                          if (player.battle_tag) {
                            setNewMemberBattleTag(player.battle_tag);
                          }
                        }}
                        disabled={player.has_team}
                        className={`w-full text-left p-3 rounded-xl border transition-colors ${
                          player.has_team
                            ? 'bg-neutral-900/30 border-neutral-700 opacity-50 cursor-not-allowed'
                            : 'bg-neutral-900/50 border-neutral-700/50 hover:border-blue-500/50 hover:bg-neutral-800/50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-white">
                              {player.display_name || player.email || 'Utilisateur'}
                            </div>
                            {player.email && player.display_name && (
                              <div className="text-xs text-neutral-400">{player.email}</div>
                            )}
                            {player.battle_tag && (
                              <div className="text-xs text-blue-400">{player.battle_tag}</div>
                            )}
                          </div>
                          {player.has_team && (
                            <span className="text-xs bg-red-500/20 text-red-300 px-2 py-0.5 rounded-lg border border-red-500/30">
                              Deja en equipe
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  {/* Selected player form */}
                  <div className="bg-neutral-900/50 rounded-xl p-4 border border-blue-500/30">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-white">
                          {selectedPlayer.display_name || selectedPlayer.email || 'Utilisateur'}
                        </div>
                        {selectedPlayer.email && (
                          <div className="text-xs text-neutral-400">{selectedPlayer.email}</div>
                        )}
                      </div>
                      <button
                        onClick={() => setSelectedPlayer(null)}
                        className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        Changer
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-neutral-300 mb-1">
                      BattleTag <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={newMemberBattleTag}
                      onChange={(e) => setNewMemberBattleTag(e.target.value)}
                      placeholder="Pseudo#1234"
                      className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                    <p className="text-xs text-neutral-500 mt-1">
                      Format: Pseudo#0000 (2+ caracteres + # + 3-6 chiffres)
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm text-neutral-300 mb-1">
                      Role
                    </label>
                    <select
                      value={newMemberRole}
                      onChange={(e) => setNewMemberRole(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    >
                      <option value="player">Joueur</option>
                      <option value="tank">Tank</option>
                      <option value="dps">DPS</option>
                      <option value="support">Support</option>
                      <option value="flex">Flex</option>
                      <option value="coach">Coach</option>
                      <option value="manager">Manager</option>
                    </select>
                  </div>
                </>
              )}
            </div>

            {selectedPlayer && (
              <div className="p-4 border-t border-neutral-700 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setSelectedPlayer(null);
                    setSearchQuery('');
                    setSearchResults([]);
                    setNewMemberBattleTag('');
                    setNewMemberRole('player');
                  }}
                  className="px-4 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleAddMember}
                  disabled={addingMember || !newMemberBattleTag}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {addingMember ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Ajout...
                    </>
                  ) : (
                    'Ajouter'
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default MyTeamPage;
