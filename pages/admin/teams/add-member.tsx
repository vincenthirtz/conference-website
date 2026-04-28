import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';

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
  const router = useRouter();
  const { addToast } = useToast();

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

    try {
      if (!teamId) throw new Error('Choisis une equipe');
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
        throw new Error(json.error || "Impossible d'ajouter le membre");
      }

      addToast(json.info || 'Membre ajoute', 'success');
      setEmail('');
      setUserId('');
      setBattleTag('');
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? 'Erreur inattendue');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>Admin – Ajouter un membre d&apos;equipe</title>
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
                  Ajouter un membre
                </h1>
                <p className="text-neutral-400 text-sm mt-1">
                  Lier un utilisateur a une equipe et le definir comme capitaine
                  si besoin
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[2fr,1fr] items-start">
            {/* Form */}
            <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm text-neutral-300 mb-1">
                    Equipe <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={teamId}
                    onChange={(e) => setTeamId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  >
                    <option value="">Selectionne une equipe</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  {loadingTeams && (
                    <p className="text-xs text-neutral-500 mt-1 flex items-center gap-2">
                      <div className="w-3 h-3 border border-neutral-500 border-t-white rounded-full animate-spin" />
                      Chargement des equipes...
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
                      className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
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
                      className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                      placeholder="Prioritaire sur l'email si rempli"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-neutral-300 mb-1">
                    BattleTag (Pseudo#0000){' '}
                    <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={battleTag}
                    onChange={(e) => setBattleTag(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    placeholder="Pseudo#1234"
                    required
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2 items-center">
                  <div>
                    <label className="block text-sm text-neutral-300 mb-1">
                      Role
                    </label>
                    <input
                      type="text"
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      placeholder="joueur / coach / sub"
                    />
                  </div>

                  <label className="inline-flex items-center gap-3 mt-6 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={setCaptain}
                      onChange={(e) => setSetCaptain(e.target.checked)}
                      className="h-4 w-4 rounded border-neutral-600 bg-neutral-900"
                    />
                    <span>Definir comme capitaine</span>
                  </label>
                </div>

                {errorMsg && (
                  <div className="rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm flex items-center gap-2">
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

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Ajout en cours...
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
                            d="M12 4v16m8-8H4"
                          />
                        </svg>
                        Ajouter le membre
                      </>
                    )}
                  </button>

                  <Link
                    href="/admin/teams"
                    className="px-4 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 border border-neutral-600 text-sm font-medium transition-colors"
                  >
                    Liste des equipes
                  </Link>
                </div>
              </form>
            </section>

            {/* Result Panel */}
            <aside className="space-y-6">
              <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 space-y-4">
                <h2 className="text-lg font-semibold">Resultat</h2>
                <p className="text-sm text-neutral-400">
                  Apres validation, un toast de confirmation s&apos;affichera.
                </p>
              </section>

              <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 space-y-3">
                <h2 className="text-lg font-semibold">Informations</h2>
                <div className="text-xs text-neutral-400 space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="text-neutral-500">•</span>
                    <p>
                      L&apos;API ajoute a team_members (role par defaut:
                      joueur).
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-neutral-500">•</span>
                    <p>
                      Si l&apos;option capitaine est cochee, teams.captain_id
                      est mis a jour.
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-neutral-500">•</span>
                    <p>
                      Fournis soit l&apos;email (recherche) soit le userId
                      (prioritaire).
                    </p>
                  </div>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </div>
    </>
  );
}

export default AdminAddTeamMemberPage;
