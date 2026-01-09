import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Button from '@/components/Buttons/button';
import { withStaffPage } from '@/utils/staff';

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type StaffProps = {
  staff: StaffShape;
};

type TeamRow = {
  id: string;
  name: string;
  short_name?: string | null;
  logo_url?: string | null;
  banner_url?: string | null;
  country?: string | null;
  description?: string | null;
  twitter?: string | null;
  discord?: string | null;
  website?: string | null;
  is_active?: boolean;
};

type TeamMemberRow = {
  id: string;
  team_id: string;
  user_id: string;
  role: string;
  created_at: string;
};

type TournamentRow = {
  id: string;
  name: string;
  slug: string;
  game: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  max_teams?: number | null;
};

type TournamentRegistration = TournamentRow & {
  stages: Array<{
    stageId: string;
    stageName: string;
    stageType: string;
  }>;
};

export const getServerSideProps = withStaffPage('manager');

function AdminEditTeamPage({ staff }: StaffProps) {
  const router = useRouter();
  const { teamId } = router.query as { teamId?: string };

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [team, setTeam] = useState<TeamRow | null>(null);
  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);

  const [registeredTournaments, setRegisteredTournaments] = useState<TournamentRegistration[]>([]);
  const [availableTournaments, setAvailableTournaments] = useState<TournamentRow[]>([]);
  const [tournamentsLoading, setTournamentsLoading] = useState(false);
  const [tournamentsError, setTournamentsError] = useState<string | null>(null);
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>('');

  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [country, setCountry] = useState('');
  const [description, setDescription] = useState('');
  const [twitter, setTwitter] = useState('');
  const [discord, setDiscord] = useState('');
  const [website, setWebsite] = useState('');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!teamId) return;
    fetchTeam();
    fetchMembers();
    fetchTournaments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  async function fetchTeam() {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/admin/teams/${teamId}`);
      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || 'Impossible de charger l&apos;équipe');
      }

      const t: TeamRow = json.team;
      setTeam(t);
      setName(t.name || '');
      setShortName(t.short_name || '');
      setLogoUrl(t.logo_url || '');
      setBannerUrl(t.banner_url || '');
      setCountry(t.country || '');
      setDescription(t.description || '');
      setTwitter(t.twitter || '');
      setDiscord(t.discord || '');
      setWebsite(t.website || '');
      setIsActive(t.is_active !== false);
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!teamId) return;
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const payload: Partial<TeamRow> = {
        name,
        short_name: shortName || null,
        logo_url: logoUrl || null,
        banner_url: bannerUrl || null,
        country: country || null,
        description: description || null,
        twitter: twitter || null,
        discord: discord || null,
        website: website || null,
        is_active: isActive,
      };

      const res = await fetch(`/api/admin/teams/${teamId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || 'Échec de la mise à jour');
      }

      setSuccessMsg('Équipe mise à jour ✅');
      setTeam(json.team);
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Erreur inattendue');
    } finally {
      setSaving(false);
    }
  }

  async function fetchMembers() {
    if (!teamId) return;
    setMembersLoading(true);
    setMembersError(null);
    try {
      const res = await fetch(`/api/admin/teams/${teamId}/members`);
      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || 'Impossible de charger les membres');
      }
      setMembers(json.members || []);
    } catch (err: any) {
      setMembersError(err?.message ?? 'Erreur inattendue');
    } finally {
      setMembersLoading(false);
    }
  }

  async function fetchTournaments() {
    if (!teamId) return;
    setTournamentsLoading(true);
    setTournamentsError(null);
    try {
      const res = await fetch(`/api/admin/teams/${teamId}/tournaments`);
      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || 'Impossible de charger les tournois');
      }
      setRegisteredTournaments(json.registered || []);
      setAvailableTournaments(json.available || []);
    } catch (err: any) {
      setTournamentsError(err?.message ?? 'Erreur inattendue');
    } finally {
      setTournamentsLoading(false);
    }
  }

  async function handleRegisterToTournament() {
    if (!teamId || !selectedTournamentId) return;
    setTournamentsLoading(true);
    setTournamentsError(null);

    try {
      const res = await fetch(`/api/admin/teams/${teamId}/tournaments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournamentId: selectedTournamentId }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || 'Échec de l\'inscription');
      }

      setSelectedTournamentId('');
      await fetchTournaments();
    } catch (err: any) {
      setTournamentsError(err?.message ?? 'Erreur inattendue');
    } finally {
      setTournamentsLoading(false);
    }
  }

  async function handleUnregisterFromTournament(tournamentId: string) {
    if (!teamId) return;
    if (!confirm('Êtes-vous sûr de vouloir désinscrire cette équipe de ce tournoi ?')) {
      return;
    }

    setTournamentsLoading(true);
    setTournamentsError(null);

    try {
      const res = await fetch(`/api/admin/teams/${teamId}/tournaments`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournamentId }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || 'Échec de la désinscription');
      }

      await fetchTournaments();
    } catch (err: any) {
      setTournamentsError(err?.message ?? 'Erreur inattendue');
    } finally {
      setTournamentsLoading(false);
    }
  }

  return (
    <>
      <Head>
        <title>Admin – Éditer équipe</title>
      </Head>

      <div className="min-h-screen bg-neutral-900 text-white p-6 pt-20">
        <header className="flex items-center justify-between flex-wrap gap-4 mb-6">
          <div>
            <button
              type="button"
              onClick={() => router.push('/admin/teams')}
              className="mb-2 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white"
            >
              ← Retour à la liste des équipes
            </button>
            <h1 className="text-3xl font-bold">
              Éditer l&apos;équipe {team?.name ? `: ${team.name}` : ''}
            </h1>
            <p className="text-sm text-neutral-400 mt-1">
              Mets à jour les informations générales de l&apos;équipe.
            </p>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[2fr,1.2fr] items-start">
          <section className="bg-neutral-800 border border-neutral-700 rounded-xl p-6">
            {loading ? (
              <p className="text-neutral-300 text-sm">
                Chargement de l&apos;équipe…
              </p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm text-neutral-300 mb-1">
                      Nom *
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Nom de l'équipe"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-neutral-300 mb-1">
                      Tag / short name
                    </label>
                    <input
                      type="text"
                      value={shortName}
                      onChange={(e) => setShortName(e.target.value)}
                      className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="PHX"
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm text-neutral-300 mb-1">
                      URL logo
                    </label>
                    <input
                      type="text"
                      value={logoUrl}
                      onChange={(e) => setLogoUrl(e.target.value)}
                      className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="https://…"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-neutral-300 mb-1">
                      URL bannière
                    </label>
                    <input
                      type="text"
                      value={bannerUrl}
                      onChange={(e) => setBannerUrl(e.target.value)}
                      className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="https://…"
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm text-neutral-300 mb-1">
                      Pays
                    </label>
                    <input
                      type="text"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="FR"
                    />
                  </div>

                  <div className="flex items-center gap-2 mt-6">
                    <input
                      id="active"
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="h-4 w-4 rounded border-neutral-600 bg-neutral-900"
                    />
                    <label
                      htmlFor="active"
                      className="text-sm text-neutral-300"
                    >
                      Équipe active
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-neutral-300 mb-1">
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm min-h-[100px] resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Présentation de l'équipe"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="block text-sm text-neutral-300 mb-1">
                      Twitter
                    </label>
                    <input
                      type="text"
                      value={twitter}
                      onChange={(e) => setTwitter(e.target.value)}
                      className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="@team"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-neutral-300 mb-1">
                      Discord
                    </label>
                    <input
                      type="text"
                      value={discord}
                      onChange={(e) => setDiscord(e.target.value)}
                      className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="discord.gg/…"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-neutral-300 mb-1">
                      Site web
                    </label>
                    <input
                      type="text"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="https://…"
                    />
                  </div>
                </div>

                {errorMsg && (
                  <div className="rounded-lg border border-red-600 bg-red-900/60 px-3 py-2 text-sm">
                    {errorMsg}
                  </div>
                )}
                {successMsg && (
                  <div className="rounded-lg border border-emerald-600 bg-emerald-900/50 px-3 py-2 text-sm">
                    {successMsg}
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <Button
                    type="submit"
                    size="compact"
                    disabled={saving}
                    className="px-4 py-2 text-sm font-semibold"
                  >
                    {saving ? 'Enregistrement...' : `Mettre à jour l'équipe`}
                  </Button>

                  <Link href="/admin/teams">
                    <Button
                      type="button"
                      size="compact"
                      className="px-3 py-2 text-sm"
                    >
                      Retour liste
                    </Button>
                  </Link>
                </div>
              </form>
            )}
          </section>

          <aside className="bg-neutral-800 border border-neutral-700 rounded-xl p-5 space-y-3">
            <h2 className="text-lg font-semibold">Conseils</h2>
            <ul className="space-y-1 text-sm text-neutral-300">
              <li>• Les champs vides ne remplaceront rien dans le back-end.</li>
              <li>• Le statut actif est envoyé dans le payload si activé.</li>
              <li>
                • Utilise les URLs complètes pour le logo/bannière si tu veux un
                affichage public.
              </li>
              <li>• Les réseaux sont optionnels.</li>
            </ul>
          </aside>

          <aside className="bg-neutral-800 border border-neutral-700 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-white">
                Membres de l&apos;équipe
              </h2>
              <Link href="/admin/teams/add-member">
                <Button
                  type="button"
                  size="compact"
                  className="px-3 py-2 text-sm"
                >
                  + Ajouter un membre
                </Button>
              </Link>
            </div>

            {membersLoading ? (
              <p className="text-sm text-neutral-300">
                Chargement des membres…
              </p>
            ) : membersError ? (
              <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/40 rounded-lg px-3 py-2">
                {membersError}
              </div>
            ) : members.length === 0 ? (
              <p className="text-sm text-neutral-400">
                Aucun membre pour cette équipe.
              </p>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-left min-w-[520px]">
                  <thead className="text-xs uppercase tracking-[0.08em] text-neutral-400">
                    <tr>
                      <th className="px-3 py-2">user_id</th>
                      <th className="px-3 py-2">Rôle</th>
                      <th className="px-3 py-2">Ajouté le</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.id} className="border-t border-neutral-700">
                        <td className="px-3 py-2 font-mono text-xs break-all text-neutral-200">
                          {m.user_id}
                        </td>
                        <td className="px-3 py-2 text-sm">{m.role}</td>
                        <td className="px-3 py-2 text-sm text-neutral-300">
                          {m.created_at
                            ? new Date(m.created_at).toLocaleString()
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </aside>

          <section className="bg-neutral-800 border border-neutral-700 rounded-xl p-5 space-y-4">
            <h2 className="text-xl font-semibold text-white">
              Inscription aux tournois
            </h2>

            {tournamentsError && (
              <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/40 rounded-lg px-3 py-2">
                {tournamentsError}
              </div>
            )}

            {tournamentsLoading ? (
              <p className="text-sm text-neutral-300">
                Chargement des tournois…
              </p>
            ) : (
              <>
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-neutral-300">
                    Tournois inscrits
                  </h3>
                  {registeredTournaments.length === 0 ? (
                    <p className="text-sm text-neutral-400">
                      Cette équipe n&apos;est inscrite à aucun tournoi.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {registeredTournaments.map((t) => (
                        <div
                          key={t.id}
                          className="flex items-center justify-between bg-neutral-900 border border-neutral-700 rounded-lg px-4 py-3"
                        >
                          <div className="flex-1">
                            <div className="font-semibold text-white">
                              {t.name}
                            </div>
                            <div className="text-xs text-neutral-400 mt-1">
                              {t.game} • {t.status}
                              {t.stages.length > 0 && (
                                <span className="ml-2">
                                  Stages: {t.stages.map(s => s.stageName).join(', ')}
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleUnregisterFromTournament(t.id)}
                            disabled={tournamentsLoading}
                            className="ml-3 px-3 py-1 text-xs font-semibold text-red-200 bg-red-900/40 hover:bg-red-900/60 border border-red-700 rounded transition disabled:opacity-50"
                          >
                            Désinscrire
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-3 pt-4 border-t border-neutral-700">
                  <h3 className="text-sm font-semibold text-neutral-300">
                    Inscrire à un nouveau tournoi
                  </h3>
                  {availableTournaments.length === 0 ? (
                    <p className="text-sm text-neutral-400">
                      Aucun tournoi publié disponible.
                    </p>
                  ) : (
                    <div className="flex gap-2">
                      <select
                        value={selectedTournamentId}
                        onChange={(e) => setSelectedTournamentId(e.target.value)}
                        className="flex-1 rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        disabled={tournamentsLoading}
                      >
                        <option value="">Sélectionner un tournoi...</option>
                        {availableTournaments.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({t.game})
                          </option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        size="compact"
                        onClick={handleRegisterToTournament}
                        disabled={!selectedTournamentId || tournamentsLoading}
                        className="px-4 py-2 text-sm"
                      >
                        Inscrire
                      </Button>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

export default AdminEditTeamPage;
