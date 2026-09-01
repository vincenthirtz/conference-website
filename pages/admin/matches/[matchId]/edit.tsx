// pages/admin/matches/[matchId]/edit.tsx

import { useEffect, useCallback, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Image from 'next/image';
import { withStaffPage } from '@/utils/staff';
import Breadcrumb from '@/components/admin/Breadcrumb';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import MatchReadinessChecklist from '@/components/admin/MatchReadinessChecklist';
import MatchTimeline from '@/components/admin/MatchTimeline';
import MatchCastAssignments from '@/components/admin/MatchCastAssignments';
import { useToast } from '@/components/Toast';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type {
  StaffProps,
  Match,
  MatchStatus,
  TournamentMini,
  StageMini,
  TeamMini,
} from '@/types/admin';
import nsAdminMatchEdit from '@/lib/i18n/locales/admin-fr/adminMatchEdit';

type Dict = typeof nsAdminMatchEdit.fr;

const STATUS_ORDER: Record<string, number> = {
  pending: 0,
  postponed: 0,
  ongoing: 1,
  disputed: 2,
  finished: 3,
  walkover: 3,
  cancelled: 4,
};

type MatchGameRow = {
  id?: string;
  map_name: string | null;
  map_order: number | null;
  team1_score: number | null;
  team2_score: number | null;
  is_tiebreaker: boolean | null;
  went_overtime: boolean | null;
};

type MatchWithGames = Match & { games?: MatchGameRow[] | null };

type ApiResponse = {
  match: MatchWithGames;
  tournament: TournamentMini | null;
  stage: StageMini | null;
  team1: TeamMini | null;
  team2: TeamMini | null;
};

export const getServerSideProps = withStaffPage({ permission: 'arbitrate_matches' });

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

function statusLabel(status: MatchStatus, t: Dict) {
  switch (status) {
    case 'pending':
      return t.statusPending;
    case 'ongoing':
      return t.statusOngoing;
    case 'finished':
      return t.statusFinished;
    case 'cancelled':
      return t.statusCancelled;
    case 'postponed':
      return t.statusPostponed;
    case 'disputed':
      return t.statusDisputed;
    case 'walkover':
      return t.statusWalkover;
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
    case 'postponed':
      return 'bg-blue-600/80 text-white';
    case 'disputed':
      return 'bg-orange-600/80 text-white';
    case 'walkover':
      return 'bg-purple-600/80 text-white';
    default:
      return 'bg-neutral-700 text-neutral-100';
  }
}

function AdminMatchEditPage({ staff }: StaffProps) {
  const t = useAdminT(nsAdminMatchEdit);
  const router = useRouter();
  const { matchId } = router.query;
  const { addToast } = useToast();
  const { adminFetch } = useAdminFetch();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [match, setMatch] = useState<Match | null>(null);
  const [tournament, setTournament] = useState<TournamentMini | null>(null);
  const [stage, setStage] = useState<StageMini | null>(null);
  const [team1, setTeam1] = useState<TeamMini | null>(null);
  const [team2, setTeam2] = useState<TeamMini | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [conflictMsg, setConflictMsg] = useState<string | null>(null);
  const [conflictServerTime, setConflictServerTime] = useState<string | null>(
    null
  );

  // Status regression confirmation
  const [showStatusConfirm, setShowStatusConfirm] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState<(() => void) | null>(null);

  // Forfeit workflow
  const [showForfeitDialog, setShowForfeitDialog] = useState(false);
  const [forfeitTeamId, setForfeitTeamId] = useState<string | null>(null);
  const [forfeitSaving, setForfeitSaving] = useState(false);
  const [forfeitError, setForfeitError] = useState<string | null>(null);
  const [warningMsgs, setWarningMsgs] = useState<string[]>([]);

  // Games (maps) state
  type GameInput = {
    map_name: string;
    map_order: number;
    team1_score: number;
    team2_score: number;
    is_tiebreaker: boolean;
    went_overtime: boolean;
  };
  const [games, setGames] = useState<GameInput[]>([]);
  const [gamesLoaded, setGamesLoaded] = useState(false);

  const [form, setForm] = useState<{
    status: MatchStatus;
    best_of: string;
    round_number: string;
    scheduled_at: string;
    stream_url: string;
    notes: string;
    team1_score: string;
    team2_score: string;
  }>({
    status: 'pending',
    best_of: '',
    round_number: '',
    scheduled_at: '',
    stream_url: '',
    notes: '',
    team1_score: '',
    team2_score: '',
  });

  function updateField<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const fetchMatch = useCallback(async () => {
    if (!matchId) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      const res = await adminFetch(
        `/api/admin/matches/${matchId}?includeGames=1`
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || t.errorLoadMatch);
      }

      const json: ApiResponse = await res.json();
      const m = json.match;

      // Load games
      const matchGames = m.games;
      if (matchGames && Array.isArray(matchGames)) {
        setGames(
          matchGames
            .slice()
            .sort((a, b) => (a.map_order ?? 0) - (b.map_order ?? 0))
            .map((g, idx) => ({
              map_name: g.map_name || '',
              map_order: g.map_order ?? idx,
              team1_score: g.team1_score ?? 0,
              team2_score: g.team2_score ?? 0,
              is_tiebreaker: g.is_tiebreaker ?? false,
              went_overtime: g.went_overtime ?? false,
            }))
        );
      } else {
        setGames([]);
      }
      setGamesLoaded(true);

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
        team1_score: m.team1_score != null ? String(m.team1_score) : '',
        team2_score: m.team2_score != null ? String(m.team2_score) : '',
      });
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errorLoadUnexpected);
    } finally {
      setLoading(false);
    }
  }, [matchId, adminFetch, t]);

  useEffect(() => {
    if (!matchId) return;
    fetchMatch();
  }, [matchId, fetchMatch]);

  const doSubmit = useCallback(async () => {
    if (!matchId || !match) return;

    setSaving(true);
    setErrorMsg(null);
    setConflictMsg(null);

    try {
      // 1) Save metadata (with optimistic locking)
      const payload: Partial<Match> & { expected_updated_at?: string | null } =
        {
          status: form.status,
          best_of: form.best_of ? Number(form.best_of) : null,
          round_number: form.round_number ? Number(form.round_number) : null,
          scheduled_at: form.scheduled_at
            ? new Date(form.scheduled_at).toISOString()
            : null,
          stream_url: form.stream_url.trim() || null,
          notes: form.notes.trim() || null,
          expected_updated_at: match.updated_at ?? null,
        };

      const metaRes = await adminFetch(`/api/admin/matches/${matchId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });

      if (!metaRes.ok) {
        const json = await metaRes.json().catch(() => ({}));
        if (metaRes.status === 409 || json.code === 'CONFLICT') {
          setConflictMsg(json.error || t.conflictMsg);
          setConflictServerTime(json.server_updated_at ?? null);
          await fetchMatch();
          return;
        }
        if (json.code === 'TOURNAMENT_COMPLETED') {
          setErrorMsg(json.error);
          return;
        }
        throw new Error(json.error || t.errorUpdateMatch);
      }

      // Check for warnings (e.g., scheduled outside tournament dates)
      const metaJson: {
        match?: { updated_at?: string | null };
        warnings?: string[];
      } = await metaRes.json().catch(() => ({}));
      if (metaJson.warnings && Array.isArray(metaJson.warnings)) {
        setWarningMsgs(metaJson.warnings);
      } else {
        setWarningMsgs([]);
      }

      // Le PUT méta vient de bumper updated_at côté serveur : réutiliser
      // l'ancien match.updated_at pour le PUT score partirait systématiquement
      // en 409. On récupère le nouvel updated_at renvoyé par l'API
      // ({ match: updated }) ; à défaut on refetch le match.
      let expectedUpdatedAt: string | null = metaJson.match?.updated_at ?? null;
      if (!expectedUpdatedAt) {
        const refetchRes = await adminFetch(`/api/admin/matches/${matchId}`);
        const refetchJson: { match?: { updated_at?: string | null } } =
          await refetchRes.json().catch(() => ({}));
        expectedUpdatedAt = refetchJson.match?.updated_at ?? null;
      }

      // 2) Save score if provided
      const hasScore = form.team1_score !== '' && form.team2_score !== '';
      if (hasScore) {
        const scoreRes = await adminFetch(`/api/admin/matches/${matchId}`, {
          method: 'PUT',
          body: JSON.stringify({
            mode: 'score',
            team1Score: Number(form.team1_score),
            team2Score: Number(form.team2_score),
            status: form.status,
            propagate: true,
            expected_updated_at: expectedUpdatedAt,
          }),
        });

        if (!scoreRes.ok) {
          const json = await scoreRes.json().catch(() => ({}));
          if (scoreRes.status === 409 || json.code === 'CONFLICT') {
            setConflictMsg(json.error || t.conflictMsg);
            setConflictServerTime(json.server_updated_at ?? null);
            await fetchMatch();
            return;
          }
          throw new Error(json.error || t.errorUpdateScore);
        }
      }

      // 3) Save games if any were edited
      if (games.length > 0 || gamesLoaded) {
        const gamesRes = await adminFetch(`/api/matches/${matchId}/games`, {
          method: 'PUT',
          body: JSON.stringify({
            games: games,
            // Score global saisi → il fait foi ('none'). Sinon, on laisse
            // l'API recalculer le score de série depuis les maps.
            recomputeMode: hasScore ? 'none' : 'from_games',
          }),
        });

        if (!gamesRes.ok) {
          const json = await gamesRes.json().catch(() => ({}));
          throw new Error(json.error || t.errorSaveMaps);
        }
      }

      // Refresh match data
      await fetchMatch();

      addToast(t.matchUpdated, 'success');
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? t.errorUpdateUnexpected);
    } finally {
      setSaving(false);
    }
  }, [
    matchId,
    match,
    form,
    games,
    gamesLoaded,
    adminFetch,
    fetchMatch,
    t,
    addToast,
  ]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!matchId || !match) return;

    // Check for status regression
    const currentOrder = STATUS_ORDER[match.status] ?? -1;
    const newOrder = STATUS_ORDER[form.status] ?? -1;

    if (newOrder < currentOrder) {
      setPendingSubmit(() => doSubmit);
      setShowStatusConfirm(true);
      return;
    }

    doSubmit();
  }

  async function handleForfeitConfirm() {
    if (!matchId || !match || !forfeitTeamId) return;

    setForfeitSaving(true);
    setForfeitError(null);
    setErrorMsg(null);

    try {
      // Scores auto-calculated server-side based on match format
      const res = await adminFetch(`/api/admin/matches/${matchId}`, {
        method: 'PUT',
        body: JSON.stringify({
          mode: 'score',
          forfeit_team_id: forfeitTeamId,
          propagate: true,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || t.errorForfeit);
      }

      setShowForfeitDialog(false);
      setForfeitTeamId(null);
      await fetchMatch();
      addToast(t.forfeitSaved, 'success');
    } catch (err: unknown) {
      setForfeitError((err as Error)?.message ?? t.errorForfeitUnexpected);
    } finally {
      setForfeitSaving(false);
    }
  }

  const backAdminUrl = `/admin/matches/${matchId}`;
  const backTournamentUrl = match
    ? `/admin/tournament/${match.tournament_id}`
    : '/admin/tournaments';

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen bg-neutral-900 text-white p-6 pt-20">
        <Breadcrumb
          items={[
            { label: t.breadcrumbMatches, href: '/admin/matches' },
            { label: t.breadcrumbEdit },
          ]}
        />
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <button
              type="button"
              onClick={() => router.push(backAdminUrl)}
              className="mb-2 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white"
            >
              {t.backToMatch}
            </button>
            <h1 className="text-3xl font-bold">{t.heading}</h1>

            {match && (
              <p className="text-neutral-400 text-sm mt-1">
                {t.matchWord}{' '}
                <span className="font-mono bg-neutral-800 border border-neutral-700 px-2 py-0.5 rounded text-xs">
                  #{match.id.slice(0, 8)}
                </span>{' '}
                {tournament && (
                  <>
                    {t.tournamentBullet}{' '}
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
                    {t.phaseBullet}{' '}
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

          {match && (
            <a
              href={`/cast/${match.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-sm font-medium transition-colors"
              title={t.casterViewTitle}
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
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              {t.casterView}
              <svg
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
          )}
        </div>

        {/* Messages */}
        {conflictMsg && (
          <div className="mb-4 rounded bg-amber-900/60 border border-amber-500 px-4 py-3 text-sm flex items-start gap-3">
            <span className="text-amber-400 text-lg leading-none mt-0.5">
              &#9888;
            </span>
            <div>
              <p className="font-semibold text-amber-200 mb-1">
                {t.conflictTitle}
              </p>
              <p className="text-amber-100/80">{conflictMsg}</p>
              {conflictServerTime && (
                <p className="text-amber-100/60 text-xs mt-1">
                  {t.lastServerEditPrefix}{' '}
                  {new Date(conflictServerTime).toLocaleString('fr-FR')}
                </p>
              )}
              <p className="text-amber-100/60 text-xs mt-1">
                {t.conflictReloadedNote}
              </p>
              <button
                type="button"
                onClick={() => {
                  setConflictMsg(null);
                  setConflictServerTime(null);
                  fetchMatch();
                }}
                className="mt-2 px-3 py-1 rounded bg-amber-700/50 hover:bg-amber-700/80 text-amber-100 text-xs font-medium transition-colors"
              >
                {t.closeAndReload}
              </button>
            </div>
          </div>
        )}
        {errorMsg && (
          <div className="mb-4 rounded bg-red-900/60 border border-red-600 px-4 py-3 text-sm">
            {errorMsg}
          </div>
        )}
        {warningMsgs.length > 0 && (
          <div className="mb-4 rounded bg-amber-900/40 border border-amber-600/60 px-4 py-3 text-sm text-amber-200">
            <p className="font-semibold mb-1">{t.warningsTitle}</p>
            <ul className="list-disc list-inside space-y-0.5">
              {warningMsgs.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {loading && !match && (
          <div className="text-neutral-300">{t.loadingMatch}</div>
        )}

        {!loading && !match && !errorMsg && (
          <div className="text-neutral-300">{t.matchNotFound}</div>
        )}

        {!loading && match && (
          <div className="grid gap-6 pt-20 lg:grid-cols-[2fr_1.3fr]">
            {/* Formulaire principal */}
            <div className="bg-neutral-800 border border-neutral-700 rounded-xl p-6 pt-20">
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Statut & round */}
                <section className="space-y-4">
                  <h2 className="font-semibold text-lg">
                    {t.statusRoundHeading}
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm mb-1 text-neutral-300">
                        {t.statusFieldLabel}
                      </label>
                      <select
                        className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={form.status}
                        onChange={(e) =>
                          updateField('status', e.target.value as MatchStatus)
                        }
                      >
                        <option value="pending">{t.statusPending}</option>
                        <option value="ongoing">{t.statusOngoing}</option>
                        <option value="finished">{t.statusFinished}</option>
                        <option value="cancelled">{t.statusCancelled}</option>
                        <option value="postponed">{t.statusPostponed}</option>
                        <option value="disputed">{t.statusDisputed}</option>
                        <option value="walkover">{t.statusWalkover}</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm mb-1 text-neutral-300">
                        {t.roundHashLabel}
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
                        {t.formatBoLabel}
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
                  <h2 className="font-semibold text-lg">
                    {t.planningStreamHeading}
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm mb-1 text-neutral-300">
                        {t.scheduledLabel}
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
                        {t.scheduledHint}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm mb-1 text-neutral-300">
                        {t.streamUrlLabel}
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

                {/* Score */}
                <section className="space-y-4">
                  <h2 className="font-semibold text-lg">{t.scoreHeading}</h2>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <label className="block text-sm mb-1 text-neutral-300">
                        {team1?.name || t.team1Fallback}
                      </label>
                      <input
                        type="number"
                        min={0}
                        className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={form.team1_score}
                        onChange={(e) =>
                          updateField('team1_score', e.target.value)
                        }
                        placeholder="0"
                      />
                    </div>
                    <span className="text-xl font-bold text-neutral-400 pt-6">
                      —
                    </span>
                    <div className="flex-1">
                      <label className="block text-sm mb-1 text-neutral-300">
                        {team2?.name || t.team2Fallback}
                      </label>
                      <input
                        type="number"
                        min={0}
                        className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={form.team2_score}
                        onChange={(e) =>
                          updateField('team2_score', e.target.value)
                        }
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-neutral-500">{t.scoreHint}</p>
                </section>

                {/* Forfait / No-show */}
                {match.team1_id &&
                  match.team2_id &&
                  match.status !== 'finished' && (
                    <section className="space-y-4">
                      <h2 className="font-semibold text-lg">
                        {t.forfeitHeading}
                      </h2>
                      <p className="text-xs text-neutral-500">
                        {t.forfeitHint}
                      </p>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setForfeitTeamId(match.team1_id);
                            setForfeitError(null);
                            setShowForfeitDialog(true);
                          }}
                          className="flex-1 px-3 py-2 rounded bg-red-900/40 border border-red-700/60 text-red-300 hover:bg-red-900/60 text-sm font-medium transition-colors"
                        >
                          {format(t.forfeitTeam, {
                            team: team1?.name || t.team1Fallback,
                          })}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setForfeitTeamId(match.team2_id);
                            setForfeitError(null);
                            setShowForfeitDialog(true);
                          }}
                          className="flex-1 px-3 py-2 rounded bg-red-900/40 border border-red-700/60 text-red-300 hover:bg-red-900/60 text-sm font-medium transition-colors"
                        >
                          {format(t.forfeitTeam, {
                            team: team2?.name || t.team2Fallback,
                          })}
                        </button>
                      </div>
                    </section>
                  )}

                {/* Games (maps) */}
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-lg">
                      {format(t.mapsHeading, { count: games.length })}
                    </h2>
                    <button
                      type="button"
                      onClick={() =>
                        setGames((prev) => [
                          ...prev,
                          {
                            map_name: '',
                            map_order: prev.length,
                            team1_score: 0,
                            team2_score: 0,
                            is_tiebreaker: false,
                            went_overtime: false,
                          },
                        ])
                      }
                      className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-xs font-medium transition-colors"
                    >
                      {t.addMap}
                    </button>
                  </div>

                  {games.length === 0 && (
                    <p className="text-sm text-neutral-500">{t.mapsEmpty}</p>
                  )}

                  <div className="space-y-3">
                    {games.map((g, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-3 p-3 rounded-lg bg-neutral-900/50 border border-neutral-700"
                      >
                        <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="col-span-2 md:col-span-1">
                            <label className="block text-xs text-neutral-400 mb-1">
                              {t.mapLabel}
                            </label>
                            <input
                              type="text"
                              className="w-full px-2 py-1.5 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              value={g.map_name}
                              onChange={(e) => {
                                const updated = [...games];
                                updated[idx] = {
                                  ...updated[idx],
                                  map_name: e.target.value,
                                };
                                setGames(updated);
                              }}
                              placeholder={t.mapNamePlaceholder}
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-neutral-400 mb-1">
                              {team1?.short_name ||
                                team1?.name ||
                                t.teamShort1Fallback}
                            </label>
                            <input
                              type="number"
                              min={0}
                              className="w-full px-2 py-1.5 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              value={g.team1_score}
                              onChange={(e) => {
                                const updated = [...games];
                                updated[idx] = {
                                  ...updated[idx],
                                  team1_score: Number(e.target.value) || 0,
                                };
                                setGames(updated);
                              }}
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-neutral-400 mb-1">
                              {team2?.short_name ||
                                team2?.name ||
                                t.teamShort2Fallback}
                            </label>
                            <input
                              type="number"
                              min={0}
                              className="w-full px-2 py-1.5 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              value={g.team2_score}
                              onChange={(e) => {
                                const updated = [...games];
                                updated[idx] = {
                                  ...updated[idx],
                                  team2_score: Number(e.target.value) || 0,
                                };
                                setGames(updated);
                              }}
                            />
                          </div>
                        </div>

                        <div className="flex flex-col items-center gap-2 pt-5">
                          <label className="flex items-center gap-1.5 text-xs text-neutral-400 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={g.went_overtime}
                              onChange={(e) => {
                                const updated = [...games];
                                updated[idx] = {
                                  ...updated[idx],
                                  went_overtime: e.target.checked,
                                };
                                setGames(updated);
                              }}
                              className="rounded border-neutral-600 bg-neutral-700"
                            />
                            {t.ot}
                          </label>
                          <label className="flex items-center gap-1.5 text-xs text-neutral-400 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={g.is_tiebreaker}
                              onChange={(e) => {
                                const updated = [...games];
                                updated[idx] = {
                                  ...updated[idx],
                                  is_tiebreaker: e.target.checked,
                                };
                                setGames(updated);
                              }}
                              className="rounded border-neutral-600 bg-neutral-700"
                            />
                            {t.tb}
                          </label>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setGames((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="mt-5 p-1.5 rounded hover:bg-red-900/50 text-neutral-500 hover:text-red-400 transition-colors"
                          title={t.deleteMapTitle}
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
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Notes internes */}
                <section className="space-y-3">
                  <h2 className="font-semibold text-lg">{t.notesHeading}</h2>
                  <textarea
                    className="w-full min-h-[120px] px-3 py-2 rounded bg-neutral-900 border border-neutral-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.notes}
                    onChange={(e) => updateField('notes', e.target.value)}
                    placeholder={t.notesPlaceholder}
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
                    {t.cancel}
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
                    {saving ? t.saving : t.saveChanges}
                  </button>
                </div>
              </form>
            </div>

            {/* Résumé match / équipes */}
            <aside className="space-y-4">
              <section className="bg-neutral-800 border border-neutral-700 rounded-xl p-5 space-y-3">
                <h2 className="text-lg font-semibold mb-1">
                  {t.summaryHeading}
                </h2>
                <div className="text-sm space-y-1">
                  <div className="flex justify-between gap-4">
                    <span className="text-neutral-400">{t.currentStatus}</span>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-semibold ${statusColor(
                        match.status
                      )}`}
                    >
                      {statusLabel(match.status, t)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-neutral-400">{t.roundLabel}</span>
                    <span className="text-neutral-200">
                      {match.round_number ?? '—'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-neutral-400">{t.formatLabel}</span>
                    <span className="text-neutral-200">
                      {match.best_of ? `BO${match.best_of}` : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-neutral-400">
                      {t.scheduledSummary}
                    </span>
                    <span className="text-neutral-200">
                      {formatDateTimeNice(match.scheduled_at)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4 text-xs">
                    <span className="text-neutral-500">{t.startedLabel}</span>
                    <span className="text-neutral-300">
                      {formatDateTimeNice(match.started_at)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4 text-xs">
                    <span className="text-neutral-500">{t.finishedLabel}</span>
                    <span className="text-neutral-300">
                      {formatDateTimeNice(match.completed_at)}
                    </span>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-neutral-700 text-xs text-neutral-500">
                  {t.fullIdLabel}{' '}
                  <span className="font-mono bg-neutral-900 px-2 py-1 rounded border border-neutral-700">
                    {match.id}
                  </span>
                </div>
              </section>

              <section className="bg-neutral-800 border border-neutral-700 rounded-xl p-5 space-y-4">
                <h2 className="text-lg font-semibold">{t.teamsHeading}</h2>

                <TeamSummaryCard
                  label={t.team1Fallback}
                  team={team1}
                  teamId={match.team1_id}
                  score={match.team1_score}
                  isWinner={match.winner_team_id === match.team1_id}
                />

                <TeamSummaryCard
                  label={t.team2Fallback}
                  team={team2}
                  teamId={match.team2_id}
                  score={match.team2_score}
                  isWinner={match.winner_team_id === match.team2_id}
                />

                <div className="mt-3 pt-3 border-t border-neutral-700 text-xs text-neutral-400 space-y-1">
                  <p>{t.summaryNote}</p>
                  <Link
                    href={backAdminUrl}
                    className="inline-flex items-center gap-1 text-blue-300 hover:underline"
                  >
                    {t.viewDetail}
                  </Link>
                </div>
              </section>

              {match.status !== 'finished' && match.status !== 'walkover' && (
                <MatchReadinessChecklist
                  match={match}
                  team1Name={team1?.name ?? null}
                  team2Name={team2?.name ?? null}
                  tournamentStatus={tournament?.status ?? null}
                  stageActive={stage?.is_active ?? null}
                />
              )}

              {(match.status === 'finished' || match.status === 'walkover') && (
                <MvpSection matchId={match.id} />
              )}

              <MatchCastAssignments matchId={match.id} />

              <section className="bg-neutral-800 border border-neutral-700 rounded-xl p-5">
                <h2 className="text-lg font-semibold mb-3">
                  {t.historyHeading}
                </h2>
                <MatchTimeline matchId={match.id} />
              </section>
            </aside>
          </div>
        )}
      </div>

      {/* Status regression confirmation dialog */}
      {showStatusConfirm && (
        <ConfirmDialog
          title={t.statusRegressionTitle}
          subtitle={format(t.statusRegressionSubtitle, {
            from: statusLabel(match!.status, t),
            to: statusLabel(form.status, t),
          })}
          variant="warning"
          loading={saving}
          confirmLabel={t.confirmChange}
          confirmingLabel={t.confirmingLabel}
          onCancel={() => {
            setShowStatusConfirm(false);
            setPendingSubmit(null);
          }}
          onConfirm={() => {
            setShowStatusConfirm(false);
            if (pendingSubmit) {
              pendingSubmit();
              setPendingSubmit(null);
            }
          }}
        >
          <p className="text-sm text-neutral-300">{t.statusRegressionBody}</p>
        </ConfirmDialog>
      )}

      {/* Forfeit confirmation dialog */}
      {showForfeitDialog && forfeitTeamId && (
        <ConfirmDialog
          title={t.forfeitConfirmTitle}
          subtitle={format(t.forfeitConfirmSubtitle, {
            team:
              forfeitTeamId === match!.team1_id
                ? team1?.name || t.team1Fallback
                : team2?.name || t.team2Fallback,
          })}
          variant="danger"
          loading={forfeitSaving}
          errorMsg={forfeitError}
          confirmLabel={t.declareForfeit}
          confirmingLabel={t.confirmingLabel}
          onCancel={() => {
            setShowForfeitDialog(false);
            setForfeitTeamId(null);
            setForfeitError(null);
          }}
          onConfirm={handleForfeitConfirm}
        >
          <p className="text-sm text-neutral-300">
            {t.forfeitBodyPrefix}{' '}
            <strong>
              {forfeitTeamId === match!.team1_id
                ? team2?.name || t.team2Fallback
                : team1?.name || t.team1Fallback}
            </strong>{' '}
            {t.forfeitBodySuffix}
          </p>
        </ConfirmDialog>
      )}
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
  const t = useAdminT(nsAdminMatchEdit);
  const displayName = team?.name || teamId || t.tbd;

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
            <div className="text-xs text-neutral-400">{t.scoreLabelShort}</div>
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

/* -----------------------------------------------------------
 * MVP poll section — shows poll status and allows manual import of winner
 * ---------------------------------------------------------*/

type MvpCandidate = {
  id: string;
  teamId: string;
  teamName: string | null;
  battleTag: string | null;
  isSubstitute: boolean;
};

type MvpPollData = {
  matchId: string;
  matchStatus: string;
  poll: {
    id: string;
    posted_at: string | null;
    duration_hours: number;
    winner_member_id: string | null;
    winner_battle_tag: string | null;
    winner_imported_at: string | null;
  } | null;
  candidates: MvpCandidate[];
};

function MvpSection({ matchId }: { matchId: string }) {
  const t = useAdminT(nsAdminMatchEdit);
  const { adminFetchJson } = useAdminFetch();
  const { confirm, dialog } = useConfirmDialog();
  const [data, setData] = useState<MvpPollData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const json = await adminFetchJson<
        MvpPollData & { poll?: { winner_member_id?: string } }
      >(`/api/admin/matches/${matchId}/mvp`);
      setData(json);
      if (json.poll?.winner_member_id) {
        setSelected(json.poll.winner_member_id);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [matchId, adminFetchJson]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function save() {
    if (!selected) return;
    setSaving(true);
    setErr(null);
    try {
      await adminFetchJson(`/api/admin/matches/${matchId}/mvp`, {
        method: 'POST',
        body: JSON.stringify({ winnerMemberId: selected }),
      });
      await fetchData();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    const ok = await confirm({ title: t.confirmClearMvp, variant: 'danger' });
    if (!ok) return;
    setSaving(true);
    try {
      await adminFetchJson(`/api/admin/matches/${matchId}/mvp`, {
        method: 'DELETE',
      });
      setSelected('');
      await fetchData();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const poll = data?.poll;
  const winnerMember = data?.candidates.find(
    (c) => c.id === poll?.winner_member_id
  );

  // Group candidates by team for the dropdown
  const grouped: Record<string, MvpCandidate[]> = {};
  for (const c of data?.candidates || []) {
    if (c.isSubstitute) continue;
    const k = c.teamName || c.teamId;
    if (!grouped[k]) grouped[k] = [];
    grouped[k].push(c);
  }

  return (
    <>
      {dialog}
      <section className="bg-neutral-800 border border-neutral-700 rounded-xl p-5">
        <h2 className="text-lg font-semibold mb-3">{t.mvpHeading}</h2>

        {loading ? (
          <div className="text-sm text-neutral-400">{t.mvpLoading}</div>
        ) : (
          <div className="space-y-3">
            <div className="text-xs text-neutral-400">
              {poll?.posted_at ? (
                <>
                  {t.mvpPollPostedPrefix}{' '}
                  <span className="text-neutral-200">
                    {new Date(poll.posted_at).toLocaleString('fr-FR', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'Europe/Paris',
                    })}
                  </span>{' '}
                  {format(t.mvpPollDuration, { hours: poll.duration_hours })}
                </>
              ) : (
                <span>
                  {t.mvpNoPollPrefix} <code>mvp_polls</code> {t.mvpNoPollSuffix}
                </span>
              )}
            </div>

            {poll?.winner_member_id && winnerMember ? (
              <div className="rounded-xl bg-amber-900/30 border border-amber-500/40 p-3 flex items-center gap-3">
                <span className="text-2xl">🏅</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-amber-300 uppercase tracking-wide">
                    {t.mvpRegistered}
                  </div>
                  <div className="text-sm font-semibold text-white">
                    {winnerMember.battleTag || '—'}
                  </div>
                  <div className="text-xs text-amber-200/70">
                    {winnerMember.teamName || ''}{' '}
                    {poll.winner_imported_at && (
                      <>
                        {t.mvpImportedPrefix}{' '}
                        {new Date(poll.winner_imported_at).toLocaleString(
                          'fr-FR',
                          { day: '2-digit', month: 'short' }
                        )}
                      </>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={clear}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-lg text-xs bg-neutral-700 hover:bg-neutral-600 transition-colors disabled:opacity-50"
                >
                  {t.clearBtn}
                </button>
              </div>
            ) : null}

            <div>
              <label className="block text-xs text-neutral-400 mb-1">
                {t.mvpSelectLabel}
              </label>
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
              >
                <option value="">{t.mvpSelectPlaceholder}</option>
                {Object.entries(grouped).map(([teamName, members]) => (
                  <optgroup key={teamName} label={teamName}>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.battleTag ||
                          format(t.mvpMemberFallback, { id: m.id.slice(0, 6) })}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {err && (
              <div className="text-xs rounded-lg bg-red-900/40 border border-red-500/50 px-3 py-2">
                {err}
              </div>
            )}

            <button
              type="button"
              onClick={save}
              disabled={
                saving || !selected || selected === poll?.winner_member_id
              }
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {saving ? t.mvpSaving : t.mvpSave}
            </button>
          </div>
        )}
      </section>
    </>
  );
}

export default AdminMatchEditPage;
