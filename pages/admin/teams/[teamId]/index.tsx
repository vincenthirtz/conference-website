import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
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

export const getServerSideProps = withStaffPage('manager');

function AdminTeamDetailPage({ staff }: StaffProps) {
  const router = useRouter();
  const { teamId } = router.query as { teamId?: string };

  const [team, setTeam] = useState<TeamRow | null>(null);
  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [membersLoading, setMembersLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [membersError, setMembersError] = useState<string | null>(null);

  useEffect(() => {
    if (!teamId) return;
    fetchTeam();
    fetchMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  async function fetchTeam() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/admin/teams/${teamId}`);
      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || "Impossible de charger l'équipe");
      }
      setTeam(json.team);
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Erreur inattendue');
    } finally {
      setLoading(false);
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

  const backUrl = '/admin/teams';

  return (
    <>
      <Head>
        <title>Admin – Équipe</title>
      </Head>

      <div className="min-h-screen bg-neutral-900 text-white p-6 pt-20">
        <header className="flex items-center justify-between flex-wrap gap-4 mb-6">
          <div>
            <button
              type="button"
              onClick={() => router.push(backUrl)}
              className="mb-2 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white"
            >
              ← Retour à la liste des équipes
            </button>
            <h1 className="text-3xl font-bold">
              {team?.name || 'Équipe'} {team?.short_name ? `(${team.short_name})` : ''}
            </h1>
            <p className="text-sm text-neutral-400 mt-1">
              Vue d’ensemble de l’équipe et membres.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {teamId && (
              <>
                <Link href={`/admin/teams/${teamId}/edit`}>
                  <Button type="button" size="compact" className="px-4">
                    Éditer
                  </Button>
                </Link>
                <Link href="/admin/teams/add-member">
                  <Button type="button" size="compact" className="px-4">
                    Ajouter un membre
                  </Button>
                </Link>
              </>
            )}
          </div>
        </header>

        {errorMsg && (
          <div className="text-sm text-red-200 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 mb-4">
            {errorMsg}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr] items-start">
          <section className="bg-neutral-800 border border-neutral-700 rounded-xl p-6 space-y-4">
            {loading ? (
              <p className="text-neutral-300 text-sm">Chargement de l’équipe…</p>
            ) : !team ? (
              <p className="text-neutral-300 text-sm">Équipe introuvable.</p>
            ) : (
              <>
                <div className="flex items-center gap-4 flex-wrap">
                  {team.logo_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={team.logo_url}
                      alt={team.name}
                      className="w-20 h-20 rounded-full border border-white/10 object-cover bg-white/5"
                    />
                  )}
                  <div className="space-y-1">
                    <p className="text-xs uppercase tracking-[0.12em] text-neutral-400">
                      Informations
                    </p>
                    <p className="text-2xl font-semibold">{team.name}</p>
                    {team.short_name && (
                      <p className="text-sm text-neutral-300">Tag : {team.short_name}</p>
                    )}
                    <p className="text-sm text-neutral-400">
                      Statut :{' '}
                      <span
                        className={`px-2 py-1 rounded-full text-xs ${
                          team.is_active
                            ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-400/50'
                            : 'bg-red-500/15 text-red-200 border border-red-400/50'
                        }`}
                      >
                        {team.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoRow label="Pays" value={team.country || '—'} />
                  <InfoRow label="Site web" value={team.website || '—'} />
                  <InfoRow label="Twitter" value={team.twitter || '—'} />
                  <InfoRow label="Discord" value={team.discord || '—'} />
                </div>

                <div className="grid gap-2">
                  <p className="text-xs uppercase tracking-[0.12em] text-neutral-400">
                    Description
                  </p>
                  <p className="text-sm text-neutral-200 whitespace-pre-wrap">
                    {team.description || '—'}
                  </p>
                </div>
              </>
            )}
          </section>

          <section className="bg-neutral-800 border border-neutral-700 rounded-xl p-6 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Membres</h2>
              <Link href="/admin/teams/add-member" className="text-sm underline">
                Ajouter un membre
              </Link>
            </div>
            {membersLoading ? (
              <p className="text-neutral-300 text-sm">Chargement des membres…</p>
            ) : membersError ? (
              <p className="text-red-200 text-sm">{membersError}</p>
            ) : members.length === 0 ? (
              <p className="text-neutral-300 text-sm">Aucun membre pour le moment.</p>
            ) : (
              <div className="space-y-2">
                {members.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between bg-neutral-900/60 border border-neutral-700 rounded-lg px-3 py-2 text-sm"
                  >
                    <div className="flex flex-col">
                      <span className="font-semibold">{m.user_id}</span>
                      <span className="text-neutral-400 text-xs">
                        Rôle : {m.role || '—'}
                      </span>
                    </div>
                    <span className="text-xs text-neutral-500">
                      {new Date(m.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

export default AdminTeamDetailPage;

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-neutral-900/60 border border-neutral-700 rounded-lg px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.14em] text-neutral-400">
        {label}
      </p>
      <p className="text-sm text-neutral-100 break-words">{value || '—'}</p>
    </div>
  );
}
