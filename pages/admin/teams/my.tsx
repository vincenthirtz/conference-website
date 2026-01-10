import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Button from '@/components/Buttons/button';
import { supabaseClient } from '@/utils/supabase';

type TeamLite = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  bio: string | null;
  country?: string | null;
  description?: string | null;
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

export default function MyTeamPage() {
  const router = useRouter();
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

  const load = async () => {
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

      const res = await fetch('/api/admin/teams/my', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Chargement impossible');
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
    } catch (err: any) {
      setError(err?.message || 'Erreur inattendue.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

      const res = await fetch('/api/admin/teams/my', {
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
      await load();
    } catch (err: any) {
      alert(err?.message || 'Erreur lors de la sauvegarde.');
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
    if (!selectedPlayer) return;
    setAddingMember(true);
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      if (!session) {
        router.replace('/admin/login');
        return;
      }

      const res = await fetch('/api/teams/add-member', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
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
      await load();
    } catch (err: any) {
      alert(err?.message || 'Erreur lors de l\'ajout');
    } finally {
      setAddingMember(false);
    }
  };

  const renderMembers = () => {
    if (!data?.team) return null;
    if (!data.members?.length) {
      return <div className="text-neutral-400">Aucun membre enregistré.</div>;
    }

    return (
      <ul className="space-y-2">
        {data.members.map((m) => {
          const isCaptain = m.captain || m.is_captain;
          return (
            <li
              key={m.id}
              className={`py-3 px-3 flex items-center gap-3 rounded-lg ${
                isCaptain
                  ? 'bg-amber-900/20 border border-amber-500/30'
                  : 'bg-neutral-900/50 border border-white/5'
              }`}
            >
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                isCaptain ? 'bg-amber-500/20' : 'bg-neutral-700'
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
                <div className="flex items-center gap-2">
                  <span className="text-white font-semibold truncate">
                    {m.display_name || m.user_id || m.id}
                  </span>
                  {isCaptain && (
                    <span className="text-[10px] uppercase tracking-wide bg-amber-500/20 text-amber-300 rounded px-1.5 py-0.5 border border-amber-500/30 font-semibold flex-shrink-0">
                      Capitaine
                    </span>
                  )}
                </div>
                <div className="text-xs text-neutral-400">
                  {m.role || '—'}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <>
      <Head>
        <title>Gestion de mon équipe</title>
      </Head>
      <div className="min-h-screen bg-neutral-900 text-white p-6 pt-20">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-sm text-neutral-400">Espace équipe</p>
              <h1 className="text-3xl font-bold">
                {data?.team ? data.team.name : 'Mon équipe'}
              </h1>
              <p className="text-sm text-neutral-400 mt-1">
                {data?.isCaptain
                  ? 'Vous êtes capitaine : modification autorisée.'
                  : 'Vue en lecture seule.'}
              </p>
            </div>
            <Button
              type="button"
              size="compact"
              className="px-3 py-2 text-sm"
              onClick={load}
            >
              Rafraîchir
            </Button>
          </div>

          {loading && <div className="text-neutral-300">Chargement…</div>}
          {error && (
            <div className="text-red-200 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 space-y-2">
              <div>{error}</div>
              <Button
                type="button"
                size="compact"
                className="inline-flex items-center gap-2 text-sm"
                onClick={() => router.push('/admin/teams/new')}
              >
                Créer mon équipe
              </Button>
            </div>
          )}

          {!loading && !error && !data?.team && (
            <div className="text-neutral-300">
              Vous n'êtes capitaine d'aucune équipe.
            </div>
          )}

          {data?.team && (
            <div className="grid gap-4 md:grid-cols-[1.2fr,1fr]">
              <section className="bg-neutral-800 border border-white/10 rounded-xl p-5 space-y-3">
                <h2 className="text-xl font-semibold">Informations équipe</h2>

                <div className="space-y-3">
                  <label className="flex flex-col gap-1 text-sm">
                    Nom
                    <input
                      value={form.name}
                      onChange={(e) => updateField('name', e.target.value)}
                      disabled={!data.isCaptain}
                      className="rounded-lg bg-neutral-900 border border-white/10 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Tag court
                    <input
                      value={form.short_name}
                      onChange={(e) =>
                        updateField('short_name', e.target.value)
                      }
                      disabled={!data.isCaptain}
                      className="rounded-lg bg-neutral-900 border border-white/10 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Bio
                    <textarea
                      value={form.bio}
                      onChange={(e) => updateField('bio', e.target.value)}
                      disabled={!data.isCaptain}
                      rows={4}
                      className="rounded-lg bg-neutral-900 border border-white/10 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Logo (URL)
                    <input
                      value={form.logo_url}
                      onChange={(e) => updateField('logo_url', e.target.value)}
                      disabled={!data.isCaptain}
                      className="rounded-lg bg-neutral-900 border border-white/10 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Pays (optionnel)
                    <input
                      value={form.country}
                      onChange={(e) => updateField('country', e.target.value)}
                      disabled={!data.isCaptain}
                      className="rounded-lg bg-neutral-900 border border-white/10 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    Description (privée)
                    <textarea
                      value={form.description}
                      onChange={(e) =>
                        updateField('description', e.target.value)
                      }
                      disabled={!data.isCaptain}
                      rows={3}
                      className="rounded-lg bg-neutral-900 border border-white/10 px-3 py-2 text-sm"
                    />
                  </label>
                </div>

            {data.isCaptain && (
              <div className="pt-2">
                <Button
                  type="button"
                  size="compact"
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-semibold"
                >
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </Button>
              </div>
            )}
              </section>

              <section className="bg-neutral-800 border border-white/10 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Membres</h2>
                  {data.isCaptain && (
                    <Button
                      type="button"
                      size="compact"
                      className="px-3 py-1.5 text-sm"
                      onClick={() => setShowAddModal(true)}
                    >
                      + Ajouter
                    </Button>
                  )}
                </div>
                {!data.isCaptain && (
                  <p className="text-sm text-neutral-400 mb-2">
                    Lecture seule (non capitaine).
                  </p>
                )}
                {renderMembers()}
              </section>
            </div>
          )}
        </div>
      </div>

      {/* Add Member Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-800 border border-white/10 rounded-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
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
                className="text-neutral-400 hover:text-white"
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
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="email@example.com ou Pseudo#1234"
                      className="w-full rounded-lg bg-neutral-900 border border-white/10 px-3 py-2 text-sm"
                      autoFocus
                    />
                  </div>

                  {/* Search results */}
                  <div className="space-y-2">
                    {searchLoading && (
                      <div className="text-neutral-400 text-sm">Recherche...</div>
                    )}
                    {!searchLoading && searchQuery.length >= 2 && searchResults.length === 0 && (
                      <div className="text-neutral-400 text-sm">Aucun résultat</div>
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
                        className={`w-full text-left p-3 rounded-lg border transition-colors ${
                          player.has_team
                            ? 'bg-neutral-900/50 border-neutral-700 opacity-50 cursor-not-allowed'
                            : 'bg-neutral-900 border-white/10 hover:border-purple-500/50 hover:bg-neutral-900/80'
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
                            <span className="text-xs bg-red-500/20 text-red-300 px-2 py-0.5 rounded">
                              Déjà en équipe
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
                  <div className="bg-neutral-900 rounded-lg p-3 border border-purple-500/30">
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
                        className="text-neutral-400 hover:text-white text-sm"
                      >
                        Changer
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-neutral-400 mb-1">
                      BattleTag *
                    </label>
                    <input
                      type="text"
                      value={newMemberBattleTag}
                      onChange={(e) => setNewMemberBattleTag(e.target.value)}
                      placeholder="Pseudo#1234"
                      className="w-full rounded-lg bg-neutral-900 border border-white/10 px-3 py-2 text-sm"
                    />
                    <p className="text-xs text-neutral-500 mt-1">
                      Format: Pseudo#0000 (2+ caractères + # + 3-6 chiffres)
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm text-neutral-400 mb-1">
                      Rôle
                    </label>
                    <select
                      value={newMemberRole}
                      onChange={(e) => setNewMemberRole(e.target.value)}
                      className="w-full rounded-lg bg-neutral-900 border border-white/10 px-3 py-2 text-sm"
                    >
                      <option value="player">Joueuse</option>
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
              <div className="p-4 border-t border-white/10 flex justify-end gap-2">
                <Button
                  type="button"
                  size="compact"
                  className="px-4 py-2 text-sm bg-neutral-700 hover:bg-neutral-600"
                  onClick={() => {
                    setShowAddModal(false);
                    setSelectedPlayer(null);
                    setSearchQuery('');
                    setSearchResults([]);
                    setNewMemberBattleTag('');
                    setNewMemberRole('player');
                  }}
                >
                  Annuler
                </Button>
                <Button
                  type="button"
                  size="compact"
                  className="px-4 py-2 text-sm"
                  onClick={handleAddMember}
                  disabled={addingMember || !newMemberBattleTag}
                >
                  {addingMember ? 'Ajout...' : 'Ajouter'}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
