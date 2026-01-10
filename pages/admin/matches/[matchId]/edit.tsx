// pages/admin/matches/[matchId]/edit.tsx

import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Image from 'next/image';
import { withStaffPage } from '@/utils/staff';

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type StaffProps = {
  staff: StaffShape;
};
type MatchStatus = 'pending' | 'ongoing' | 'finished' | 'cancelled';

type StageType =
  | 'group'
  | 'bracket'
  | 'swiss'
  | 'round_robin'
  | 'showmatch'
  | 'other';

type TeamMini = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
};

type Match = {
  id: string;
  tournament_id: string;
  stage_id: string | null;
  round_number: number | null;
  status: MatchStatus;
  best_of: number | null;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  team1_id: string | null;
  team2_id: string | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
  stream_url: string | null;
  notes: string | null;
  // éventuels champs supplémentaires ignorés par le form
};

type TournamentMini = {
  id: string;
  name: string;
  slug: string | null;
};

type StageMini = {
  id: string;
  name: string;
  stage_type: StageType | null;
};

type ApiResponse = {
  match: Match;
  tournament: TournamentMini | null;
  stage: StageMini | null;
  team1: TeamMini | null;
  team2: TeamMini | null;
};

export const getServerSideProps = withStaffPage('manager');

function formatToInputDateTime(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  } catch {
    return '';
  }
}

function formatDateTimeNice(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function statusLabel(status: MatchStatus) {
  switch (status) {
    case 'pending':
      return 'À venir';
    case 'ongoing':
      return 'En cours';
    case 'finished':
      return 'Terminé';
    case 'cancelled':
      return 'Annulé';
    default:
      return status;
  }
}

function statusColor(status: MatchStatus) {
  switch (status) {
    case 'pending':
      return 'bg-neutral-700 text-neutral-100';
    case 'ongoing':
      return 'bg-amber-600/80 text-neutral-900';
    case 'finished':
      return 'bg-emerald-600/80 text-white';
    case 'cancelled':
      return 'bg-red-700/80 text-white';
    default:
      return 'bg-neutral-700 text-neutral-100';
  }
}

function AdminMatchEditPage({ staff }: StaffProps) {
  const router = useRouter();
  const { matchId } = router.query;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [match, setMatch] = useState<Match | null>(null);
  const [tournament, setTournament] = useState<TournamentMini | null>(null);
  const [stage, setStage] = useState<StageMini | null>(null);
  const [team1, setTeam1] = useState<TeamMini | null>(null);
  const [team2, setTeam2] = useState<TeamMini | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [form, setForm] = useState<{
    status: MatchStatus;
    best_of: string;
    round_number: string;
    scheduled_at: string;
    stream_url: string;
    notes: string;
  }>({
    status: 'pending',
    best_of: '',
    round_number: '',
    scheduled_at: '',
    stream_url: '',
    notes: '',
  });

  function updateField<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  useEffect(() => {
    if (!matchId) return;
    fetchMatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  async function fetchMatch() {
    if (!matchId) return;
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/admin/matches/${matchId}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Impossible de charger le match');
      }

      const json: ApiResponse = await res.json();
      const m = json.match;

      setMatch(m);
      setTournament(json.tournament ?? null);
      setStage(json.stage ?? null);
      setTeam1(json.team1 ?? null);
      setTeam2(json.team2 ?? null);

      setForm({
        status: m.status || 'pending',
        best_of: m.best_of ? String(m.best_of) : '',
        round_number: m.round_number ? String(m.round_number) : '',
        scheduled_at: formatToInputDateTime(m.scheduled_at),
        stream_url: m.stream_url || '',
        notes: m.notes || '',
      });
    } catch (err: any) {
      setErrorMsg(
        err?.message ?? 'Erreur inattendue lors du chargement du match'
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!matchId || !match) return;

    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const payload: Partial<Match> = {
        status: form.status,
        best_of: form.best_of ? Number(form.best_of) : null,
        round_number: form.round_number ? Number(form.round_number) : null,
        scheduled_at: form.scheduled_at
          ? new Date(form.scheduled_at).toISOString()
          : null,
        stream_url: form.stream_url.trim() || null,
        notes: form.notes.trim() || null,
      };

      const res = await fetch(`/api/admin/matches/${matchId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Erreur lors de la mise à jour du match');
      }

      const json: ApiResponse = await res.json();
      setMatch(json.match);
      setTournament(json.tournament ?? null);
      setStage(json.stage ?? null);
      setTeam1(json.team1 ?? null);
      setTeam2(json.team2 ?? null);

      setSuccessMsg('Match mis à jour avec succès.');
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Erreur inattendue lors de la mise à jour');
    } finally {
      setSaving(false);
    }
  }

  const backAdminUrl = `/admin/matches/${matchId}`;
  const backTournamentUrl = match
    ? `/admin/tournament/${match.tournament_id}`
    : '/admin/tournaments';

  return (
    <>
      <Head>
        <title>Admin – Éditer le match</title>
      </Head>

      <div className="min-h-screen bg-neutral-900 text-white p-6 pt-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <button
              type="button"
              onClick={() => router.push(backAdminUrl)}
              className="mb-2 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white"
            >
              ← Retour au match (admin)
            </button>
            <h1 className="text-3xl font-bold">Éditer le match</h1>

            {match && (
              <p className="text-neutral-400 text-sm mt-1">
                Match{' '}
                <span className="font-mono bg-neutral-800 border border-neutral-700 px-2 py-0.5 rounded text-xs">
                  #{match.id.slice(0, 8)}
                </span>{' '}
                {tournament && (
                  <>
                    • Tournoi{' '}
                    <Link
                      href={backTournamentUrl}
                      className="font-semibold hover:underline"
                    >
                      {tournament.name}
                    </Link>
                  </>
                )}
                {stage && (
                  <>
                    {' '}
                    • Phase{' '}
                    <Link
                      href={`/admin/stages/${stage.id}`}
                      className="hover:underline"
                    >
                      {stage.name}
                    </Link>
                  </>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Messages */}
        {errorMsg && (
          <div className="mb-4 rounded bg-red-900/60 border border-red-600 px-4 py-3 text-sm">
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="mb-4 rounded bg-emerald-900/60 border border-emerald-600 px-4 py-3 text-sm">
            {successMsg}
          </div>
        )}

        {loading && !match && (
          <div className="text-neutral-300">Chargement du match…</div>
        )}

        {!loading && !match && !errorMsg && (
          <div className="text-neutral-300">Match introuvable.</div>
        )}

        {!loading && match && (
          <div className="grid gap-6 pt-20 lg:grid-cols-[2fr,1.3fr]">
            {/* Formulaire principal */}
            <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6 pt-20">
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Statut & round */}
                <section className="space-y-4">
                  <h2 className="font-semibold text-lg">Statut & round</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm mb-1 text-neutral-300">
                        Statut
                      </label>
                      <select
                        className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={form.status}
                        onChange={(e) =>
                          updateField('status', e.target.value as MatchStatus)
                        }
                      >
                        <option value="pending">À venir</option>
                        <option value="ongoing">En cours</option>
                        <option value="finished">Terminé</option>
                        <option value="cancelled">Annulé</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm mb-1 text-neutral-300">
                        Round #
                      </label>
                      <input
                        type="number"
                        className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={form.round_number}
                        onChange={(e) =>
                          updateField('round_number', e.target.value)
                        }
                        placeholder="1"
                      />
                    </div>

                    <div>
                      <label className="block text-sm mb-1 text-neutral-300">
                        Format (BO)
                      </label>
                      <input
                        type="number"
                        min={1}
                        className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={form.best_of}
                        onChange={(e) => updateField('best_of', e.target.value)}
                        placeholder="3, 5…"
                      />
                    </div>
                  </div>
                </section>

                {/* Planning & stream */}
                <section className="space-y-4">
                  <h2 className="font-semibold text-lg">Planning & stream</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm mb-1 text-neutral-300">
                        Horaire prévu
                      </label>
                      <input
                        type="datetime-local"
                        className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={form.scheduled_at}
                        onChange={(e) =>
                          updateField('scheduled_at', e.target.value)
                        }
                      />
                      <p className="text-xs text-neutral-500 mt-1">
                        Utilisé par l&apos;auto-scheduler & la vue publique du
                        match.
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm mb-1 text-neutral-300">
                        URL du stream
                      </label>
                      <input
                        type="text"
                        className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={form.stream_url}
                        onChange={(e) =>
                          updateField('stream_url', e.target.value)
                        }
                        placeholder="https://twitch.tv/..."
                      />
                    </div>
                  </div>
                </section>

                {/* Notes internes */}
                <section className="space-y-3">
                  <h2 className="font-semibold text-lg">Notes internes</h2>
                  <textarea
                    className="w-full min-h-[120px] px-3 py-2 rounded bg-neutral-900 border border-neutral-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.notes}
                    onChange={(e) => updateField('notes', e.target.value)}
                    placeholder="Infos pour les arbitres / casters (setup, lobby code, casters, spécificités, etc.)."
                  />
                </section>

                {/* Actions */}
                <div className="flex justify-between items-center pt-2">
                  <button
                    type="button"
                    className="px-4 py-2 rounded border border-neutral-600 text-neutral-200 hover:bg-neutral-800 text-sm"
                    onClick={() => router.push(backAdminUrl)}
                    disabled={saving}
                  >
                    Annuler
                  </button>

                  <button
                    type="submit"
                    disabled={saving}
                    className={`px-5 py-2 rounded font-semibold text-sm ${
                      saving
                        ? 'bg-blue-800 cursor-wait'
                        : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                  >
                    {saving
                      ? 'Enregistrement...'
                      : 'Enregistrer les modifications'}
                  </button>
                </div>
              </form>
            </div>

            {/* Résumé match / équipes */}
            <aside className="space-y-4">
              <section className="bg-neutral-800 border border-neutral-700 rounded-xl p-5 space-y-3">
                <h2 className="text-lg font-semibold mb-1">Résumé du match</h2>
                <div className="text-sm space-y-1">
                  <div className="flex justify-between gap-4">
                    <span className="text-neutral-400">Statut actuel</span>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-semibold ${statusColor(
                        match.status
                      )}`}
                    >
                      {statusLabel(match.status)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-neutral-400">Round</span>
                    <span className="text-neutral-200">
                      {match.round_number ?? '—'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-neutral-400">Format</span>
                    <span className="text-neutral-200">
                      {match.best_of ? `BO${match.best_of}` : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-neutral-400">Prévu</span>
                    <span className="text-neutral-200">
                      {formatDateTimeNice(match.scheduled_at)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4 text-xs">
                    <span className="text-neutral-500">Débuté</span>
                    <span className="text-neutral-300">
                      {formatDateTimeNice(match.started_at)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4 text-xs">
                    <span className="text-neutral-500">Terminé</span>
                    <span className="text-neutral-300">
                      {formatDateTimeNice(match.completed_at)}
                    </span>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-neutral-700 text-xs text-neutral-500">
                  ID complet :{' '}
                  <span className="font-mono bg-neutral-900 px-2 py-1 rounded border border-neutral-700">
                    {match.id}
                  </span>
                </div>
              </section>

              <section className="bg-neutral-800 border border-neutral-700 rounded-xl p-5 space-y-4">
                <h2 className="text-lg font-semibold">Équipes</h2>

                <TeamSummaryCard
                  label="Équipe 1"
                  team={team1}
                  teamId={match.team1_id}
                  score={match.team1_score}
                  isWinner={match.winner_team_id === match.team1_id}
                />

                <TeamSummaryCard
                  label="Équipe 2"
                  team={team2}
                  teamId={match.team2_id}
                  score={match.team2_score}
                  isWinner={match.winner_team_id === match.team2_id}
                />

                <div className="mt-3 pt-3 border-t border-neutral-700 text-xs text-neutral-400 space-y-1">
                  <p>
                    La modification des équipes & du score se fait depuis la
                    page principale du match (admin) ou via le bracket builder.
                  </p>
                  <Link
                    href={backAdminUrl}
                    className="inline-flex items-center gap-1 text-blue-300 hover:underline"
                  >
                    Ouvrir la page admin du match →
                  </Link>
                </div>
              </section>
            </aside>
          </div>
        )}
      </div>
    </>
  );
}

type TeamSummaryProps = {
  label: string;
  team: TeamMini | null;
  teamId: string | null;
  score: number | null;
  isWinner: boolean;
};

function TeamSummaryCard({
  label,
  team,
  teamId,
  score,
  isWinner,
}: TeamSummaryProps) {
  const displayName = team?.name || teamId || 'TBD';

  return (
    <div className="flex items-center gap-3">
      {team?.logo_url && (
        <Image
          src={team.logo_url}
          alt={team.name}
          width={32}
          height={32}
          className="w-8 h-8 rounded object-cover border border-neutral-700"
        />
      )}
      <div className="flex-1">
        <div className="flex justify-between items-center gap-2">
          <div>
            <div
              className={`font-semibold ${
                isWinner ? 'text-emerald-300' : 'text-neutral-100'
              }`}
            >
              {displayName}
            </div>
            <div className="text-[11px] text-neutral-500">{label}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-neutral-400">Score</div>
            <div className="text-lg font-semibold">
              {score != null ? score : '—'}
            </div>
          </div>
        </div>
        {team?.short_name && (
          <div className="text-[11px] text-neutral-400 mt-0.5">
            {team.short_name}
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminMatchEditPage;
