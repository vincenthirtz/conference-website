import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { StaffRoleBadge } from '@/components/admin/StaffRoleBadge';
import { withStaffPage } from '@/utils/staff';

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type StaffProps = {
  staff: StaffShape;
};

type TeamOption = {
  id: string;
  name: string;
};

type ApiTeams = {
  teams: TeamOption[];
};

type AddMemberResponse = {
  teamMemberId?: string;
  teamId: string;
  userId: string;
  role: string;
  captainSet: boolean;
  info?: string;
};

export const getServerSideProps = withStaffPage('manager');

function AdminAddTeamMemberPage({ staff }: StaffProps) {
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [teamId, setTeamId] = useState('');
  const [email, setEmail] = useState('');
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState('player');
  const [battleTag, setBattleTag] = useState('');
  const [setCaptain, setSetCaptain] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState<AddMemberResponse | null>(null);

  useEffect(() => {
    loadTeams();
  }, []);

  async function loadTeams() {
    setLoadingTeams(true);
    try {
      const res = await fetch('/api/admin/teams?limit=200&includeTotal=0');
      if (!res.ok) return;
      const json: ApiTeams = await res.json();
      setTeams(json.teams || []);
    } catch (e) {
      console.error('Failed to load teams list', e);
    } finally {
      setLoadingTeams(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    setSuccess(null);

    try {
      if (!teamId) throw new Error('Choisis une équipe');
      if (!email.trim() && !userId.trim()) {
        throw new Error('Renseigne un email ou un userId');
      }
      if (!battleTag.trim()) {
        throw new Error('BattleTag requis (format Pseudo#0000).');
      }

      const payload = {
        teamId,
        email: email.trim() || undefined,
        userId: userId.trim() || undefined,
        role: role.trim() || 'player',
        battleTag: battleTag.trim(),
        setCaptain,
      };

      const res = await fetch('/api/admin/teams/add-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json: AddMemberResponse & { error?: string } = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || 'Impossible d&apos;ajouter le membre');
      }

      setSuccess(json);
      setEmail('');
      setUserId('');
      setBattleTag('');
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Erreur inattendue');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>Admin – Ajouter un membre d&apos;équipe</title>
      </Head>

      <div className="min-h-screen bg-neutral-900 text-white p-6 pt-20">
        <header className="flex items-center justify-between flex-wrap gap-4 mb-6">
          <div>
            <button
              type="button"
              onClick={() => history.back()}
              className="mb-2 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white"
            >
              ← Retour
            </button>
            <h1 className="text-3xl font-bold">Ajouter un membre</h1>
            <p className="text-sm text-neutral-400 mt-1">
              Lier un utilisateur à une équipe et le définir comme capitaine si
              besoin.
            </p>
          </div>
          <StaffRoleBadge staff={staff} />
        </header>

        <div className="grid gap-6 lg:grid-cols-[2fr,1.2fr] items-start">
          <section className="bg-neutral-800 border border-neutral-700 rounded-xl p-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm text-neutral-300 mb-1">
                  Équipe *
                </label>
                <select
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Sélectionne une équipe</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                {loadingTeams && (
                  <p className="text-xs text-neutral-400 mt-1">
                    Chargement des équipes…
                  </p>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm text-neutral-300 mb-1">
                    Email utilisateur
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="user@email.tld"
                  />
                  <p className="text-xs text-neutral-500 mt-1">
                    L&apos;API trouvera l&apos;utilisateur par email si userId
                    n&apos;est pas fourni.
                  </p>
                </div>

                <div>
                  <label className="block text-sm text-neutral-300 mb-1">
                    User ID (optionnel)
                  </label>
                  <input
                    type="text"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    placeholder="Prioritaire sur l'email si rempli"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-neutral-300 mb-1">
                  BattleTag (Pseudo#0000) *
                </label>
                <input
                  type="text"
                  value={battleTag}
                  onChange={(e) => setBattleTag(e.target.value)}
                  className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Pseudo#1234"
                  required
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2 items-center">
                <div>
                  <label className="block text-sm text-neutral-300 mb-1">
                    Rôle
                  </label>
                  <input
                    type="text"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="player / coach / sub"
                  />
                </div>

                <label className="inline-flex items-center gap-2 mt-6 text-sm">
                  <input
                    type="checkbox"
                    checked={setCaptain}
                    onChange={(e) => setSetCaptain(e.target.checked)}
                    className="h-4 w-4 rounded border-neutral-600 bg-neutral-900"
                  />
                  <span>Définir comme capitaine (teams.captain_id)</span>
                </label>
              </div>

              {errorMsg && (
                <div className="rounded-lg border border-red-600 bg-red-900/60 px-3 py-2 text-sm">
                  {errorMsg}
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                    submitting
                      ? 'bg-neutral-700 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-500'
                  }`}
                >
                  {submitting ? 'Ajout...' : 'Ajouter le membre'}
                </button>

                <Link
                  href="/admin/teams"
                  className="text-sm text-neutral-300 hover:text-white"
                >
                  Liste des équipes
                </Link>
              </div>
            </form>
          </section>

          <aside className="bg-neutral-800 border border-neutral-700 rounded-xl p-5 space-y-3">
            <h2 className="text-lg font-semibold">Résultat</h2>
            {success ? (
              <div className="rounded-lg border border-emerald-600 bg-emerald-900/50 px-3 py-3 space-y-2">
                <p className="text-sm font-semibold text-white">
                  {success.info || 'Membre ajouté'}
                </p>
                {success.teamMemberId && (
                  <p className="text-xs text-neutral-200">
                    team_member.id :{' '}
                    <span className="font-mono break-all">
                      {success.teamMemberId}
                    </span>
                  </p>
                )}
                <p className="text-xs text-neutral-200">
                  user_id :{' '}
                  <span className="font-mono break-all">{success.userId}</span>
                </p>
                <p className="text-xs text-neutral-200">
                  team_id :{' '}
                  <span className="font-mono break-all">{success.teamId}</span>
                </p>
                <p className="text-xs text-neutral-200">
                  role : {success.role}
                </p>
                <p className="text-xs text-neutral-200">
                  capitaine : {success.captainSet ? 'oui' : 'non'}
                </p>
              </div>
            ) : (
              <p className="text-sm text-neutral-300">
                Après validation, l&apos;ID membre, l&apos;user_id et le statut
                capitaine seront affichés ici.
              </p>
            )}

            <div className="text-xs text-neutral-400 space-y-1">
              <p>
                • L&apos;API ajoute à team_members (role par défaut: player).
              </p>
              <p>
                • Si l&apos;option capitaine est cochée, teams.captain_id est
                mis à jour.
              </p>
              <p>
                • Fournis soit l&apos;email (recherche) soit le userId
                (prioritaire).
              </p>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}

export default AdminAddTeamMemberPage;
