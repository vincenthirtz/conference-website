// pages/admin/matches/[matchId]/edit.tsx

import { useEffect, useCallback, useMemo, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import Breadcrumb from '@/components/admin/Breadcrumb';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import MatchReadinessChecklist from '@/components/admin/MatchReadinessChecklist';
import MatchTimeline from '@/components/admin/MatchTimeline';
import MatchCastAssignments from '@/components/admin/MatchCastAssignments';
import { useToast } from '@/components/Toast';
import { useQueryClient } from '@tanstack/react-query';
import { withAdminQuery } from '@/features/admin/_shared/query';
import { useHydrateOnce } from '@/features/admin/_shared/useHydrateOnce';
import {
  type MatchDetail,
  type MatchUpdateResponse,
  matchesClient,
} from '@/features/admin/matches/client';
import {
  matchesKeys,
  useInvalidateMatch,
  useMatchEditor,
  useMatchMapPool,
  useMatchMvp,
  useMatchVeto,
} from '@/features/admin/matches/hooks/useMatch';
import { AdminHttpError } from '@/utils/admin/adminHttp';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useDirtyBaseline } from '@/hooks/forms/useDirtyBaseline';
import { useUnsavedChangesGuard } from '@/hooks/forms/useUnsavedChangesGuard';
import nsAdminFiche from '@/lib/i18n/locales/admin-fr/adminFiche';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { isoToLocalInput } from '@/utils/dateFormatters';
import MatchGamesPanel, {
  gamesFromRows,
  type MatchGameInput,
} from '@/components/admin/matches/MatchGamesPanel';
import type {
  StaffProps,
  Match,
  TournamentMini,
  StageMini,
  TeamMini,
} from '@/types/admin';
import nsAdminMatchEdit from '@/lib/i18n/locales/admin-fr/adminMatchEdit';
import { FicheLayout, FicheSection } from '@/features/admin/_shared/ui/Fiche';
import {
  MatchEditHeader,
  MatchEditNotices,
} from '@/features/admin/matches/ui/MatchEditHeader';
import {
  MatchEditFields,
  MatchEditNotesActions,
  matchEditStatusLabel as statusLabel,
  type MatchEditFormState,
} from '@/features/admin/matches/ui/MatchEditForm';
import {
  MatchEditMvpCard,
  MatchEditSummary,
  type MvpPollData,
} from '@/features/admin/matches/ui/MatchEditAside';

const CARD =
  'rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-6';
const DIALOG_TEXT = 'text-sm text-[var(--t2,#c7bfca)]';

const STATUS_ORDER: Record<string, number> = {
  pending: 0,
  postponed: 0,
  ongoing: 1,
  disputed: 2,
  finished: 3,
  walkover: 3,
  cancelled: 4,
};

const EMPTY_POOL: string[] = [];

type ErrorBody = {
  error?: string;
  code?: string;
  server_updated_at?: string | null;
};

/** Corps d'erreur d'une réponse HTTP ; une coupure réseau est relancée telle quelle. */
function errorPayload(err: unknown): ErrorBody {
  if (!(err instanceof AdminHttpError)) throw err;
  return (err.payload ?? {}) as ErrorBody;
}

function isConflict(err: unknown): boolean {
  return (
    err instanceof AdminHttpError &&
    (err.status === 409 || errorPayload(err).code === 'CONFLICT')
  );
}

export const getServerSideProps = withStaffPage({
  permission: 'arbitrate_matches',
});

function AdminMatchEditPage(_props: StaffProps) {
  const t = useAdminT(nsAdminMatchEdit);
  const tFiche = useAdminT(nsAdminFiche);
  const router = useRouter();
  const { matchId } = router.query;
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const id = typeof matchId === 'string' ? matchId : undefined;

  const detail = useMatchEditor(id);
  const { data: mapPoolData } = useMatchMapPool(id);
  const { data: vetoData } = useMatchVeto(id);
  const invalidateMatch = useInvalidateMatch(id);
  const loading = detail.isPending || detail.isFetching;
  const match: Match | null = detail.data?.match ?? null;
  const tournament: TournamentMini | null = detail.data?.tournament ?? null;
  const stage: StageMini | null = detail.data?.stage ?? null;
  const team1: TeamMini | null = detail.data?.team1 ?? null;
  const team2: TeamMini | null = detail.data?.team2 ?? null;

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const loadErrorMsg = detail.error
    ? detail.error.message || t.errorLoadUnexpected
    : null;
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

  // Games (maps) state — le rendu vit dans MatchGamesPanel (lot A7).
  type GameInput = MatchGameInput;
  const [games, setGames] = useState<GameInput[]>([]);
  const gamesLoaded = !!detail.data;
  // Pool de cartes applicable au match (cartes du tournoi, sinon pool du
  // tenant, sinon catalogue du jeu). Alimente les suggestions du champ carte :
  // il était en texte libre, et la production n'a récolté que « Map 1 »,
  // « Map 2 »… au lieu des trente cartes du pool.
  const mapPool = mapPoolData ?? EMPTY_POOL;
  // Veto du match : sert à dire d'où viennent les cartes, et à proposer d'aller
  // le faire quand il n'a pas eu lieu. Sans ce rappel ici, le veto restait un
  // sous-onglet du tournoi que personne n'ouvrait — d'où des noms de cartes
  // tapés à la main.
  const vetoComplete = vetoData ?? null;

  const [form, setForm] = useState<MatchEditFormState>({
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

  // « Modifications non enregistrées » : écart à la dernière version
  // hydratée depuis le serveur (ouverture, puis chaque relecture).
  const editable = useMemo(() => ({ form, games }), [form, games]);
  const { dirty, markClean } = useDirtyBaseline(editable);
  useUnsavedChangesGuard(dirty, tFiche.unsavedConfirm);

  // Copie la réponse du serveur dans le formulaire et les parties.
  const hydrate = useCallback(
    (json: MatchDetail) => {
      const m = json.match;
      const nextGames =
        m.games && Array.isArray(m.games) ? gamesFromRows(m.games) : [];
      const nextForm: MatchEditFormState = {
        status: m.status || 'pending',
        best_of: m.best_of ? String(m.best_of) : '',
        round_number: m.round_number ? String(m.round_number) : '',
        scheduled_at: isoToLocalInput(m.scheduled_at),
        stream_url: m.stream_url || '',
        notes: m.notes || '',
        team1_score: m.team1_score != null ? String(m.team1_score) : '',
        team2_score: m.team2_score != null ? String(m.team2_score) : '',
      };
      setGames(nextGames);
      setForm(nextForm);
      markClean({ form: nextForm, games: nextGames });
    },
    [markClean]
  );
  useHydrateOnce(id ?? null, detail.data, hydrate);

  /**
   * Relit la fiche (et son historique) puis RÉ-HYDRATE le formulaire : après
   * un enregistrement ou un conflit, la fiche repart des valeurs du serveur,
   * comme avant la migration.
   */
  const fetchMatch = useCallback(async () => {
    if (!id) return;
    setErrorMsg(null);
    await invalidateMatch();
    const fresh = queryClient.getQueryData<MatchDetail>(matchesKeys.detail(id));
    if (fresh) hydrate(fresh);
  }, [id, invalidateMatch, queryClient, hydrate]);

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

      let metaJson: MatchUpdateResponse;
      try {
        metaJson = await matchesClient.update(id as string, payload);
      } catch (err) {
        const json = errorPayload(err);
        if (isConflict(err)) {
          setConflictMsg(json.error || t.conflictMsg);
          setConflictServerTime(json.server_updated_at ?? null);
          await fetchMatch();
          return;
        }
        if (json.code === 'TOURNAMENT_COMPLETED') {
          setErrorMsg(json.error ?? null);
          return;
        }
        throw new Error(json.error || t.errorUpdateMatch);
      }

      // Check for warnings (e.g., scheduled outside tournament dates)
      if (metaJson.warnings && Array.isArray(metaJson.warnings)) {
        setWarningMsgs(metaJson.warnings);
      } else {
        setWarningMsgs([]);
      }

      // Le PUT méta vient de bumper updated_at côté serveur : réutiliser
      // l'ancien match.updated_at pour le PUT score partirait systématiquement
      // en 409. On récupère le nouvel updated_at renvoyé par l'API
      // ({ match: updated }) ; à défaut on relit le match.
      let expectedUpdatedAt: string | null = metaJson.match?.updated_at ?? null;
      if (!expectedUpdatedAt) {
        const refetchJson = await matchesClient
          .meta(id as string)
          .catch(() => ({}) as { match?: { updated_at?: string | null } });
        expectedUpdatedAt = refetchJson.match?.updated_at ?? null;
      }

      // 2) Save score if provided
      const hasScore = form.team1_score !== '' && form.team2_score !== '';
      if (hasScore) {
        let scoreJson: MatchUpdateResponse;
        try {
          scoreJson = await matchesClient.update(id as string, {
            mode: 'score',
            team1Score: Number(form.team1_score),
            team2Score: Number(form.team2_score),
            status: form.status,
            propagate: true,
            expected_updated_at: expectedUpdatedAt,
          });
        } catch (err) {
          const json = errorPayload(err);
          if (isConflict(err)) {
            setConflictMsg(json.error || t.conflictMsg);
            setConflictServerTime(json.server_updated_at ?? null);
            await fetchMatch();
            return;
          }
          throw new Error(json.error || t.errorUpdateScore);
        }
        // Score partiel : le match reste « en cours » pour ne pas fermer la
        // feuille de match. Le dire, sinon l'arbitre croit avoir clos le match.
        if (scoreJson?.keptOngoing) {
          setWarningMsgs((prev) => [...prev, t.scoreKeptOngoing]);
        }
      }

      // 3) Save games if any were edited
      if (games.length > 0 || gamesLoaded) {
        try {
          await matchesClient.saveGames(id as string, {
            games: games,
            // Score global saisi → il fait foi ('none'). Sinon, on laisse
            // l'API recalculer le score de série depuis les maps.
            recomputeMode: hasScore ? 'none' : 'from_games',
          });
        } catch (err) {
          throw new Error(errorPayload(err).error || t.errorSaveMaps);
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
  }, [matchId, match, form, games, gamesLoaded, id, fetchMatch, t, addToast]);

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
      try {
        await matchesClient.update(matchId as string, {
          mode: 'score',
          forfeit_team_id: forfeitTeamId,
          propagate: true,
        });
      } catch (err) {
        throw new Error(errorPayload(err).error || t.errorForfeit);
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

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <Breadcrumb
          items={[
            { label: t.breadcrumbMatches, href: '/admin/matches' },
            { label: t.breadcrumbEdit },
          ]}
        />
        <MatchEditHeader
          match={match}
          tournament={tournament}
          stage={stage}
          tournamentHref={backTournamentUrl}
          onBack={() => router.push(backAdminUrl)}
        />

        <MatchEditNotices
          conflictMsg={conflictMsg}
          conflictServerTime={conflictServerTime}
          onCloseConflict={() => {
            setConflictMsg(null);
            setConflictServerTime(null);
            fetchMatch();
          }}
          errorMsg={errorMsg ?? loadErrorMsg}
          warningMsgs={warningMsgs}
        />

        {loading && !match && (
          <div className="flex items-center gap-3 py-10 text-sm text-[var(--t3,#a39ba6)]">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--line2,rgba(194,196,201,.2))] border-t-[var(--or,#b467d1)]" />
            {t.loadingMatch}
          </div>
        )}

        {!loading && !match && !errorMsg && !loadErrorMsg && (
          <div className={`${CARD} text-sm text-[var(--t3,#a39ba6)]`}>
            {t.matchNotFound}
          </div>
        )}

        {!loading && match && (
          <FicheLayout
            main={
              <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                <MatchEditFields
                  form={form}
                  updateField={updateField}
                  team1Name={team1?.name ?? null}
                  team2Name={team2?.name ?? null}
                  forfeit={
                    match.team1_id &&
                    match.team2_id &&
                    match.status !== 'finished'
                      ? {
                          team1Id: match.team1_id,
                          team2Id: match.team2_id,
                          onPick: (id) => {
                            setForfeitTeamId(id);
                            setForfeitError(null);
                            setShowForfeitDialog(true);
                          },
                        }
                      : null
                  }
                />

                {/* Parties (maps) — panneau extrait, cf. lot A7. */}
                <div className={CARD}>
                  <MatchGamesPanel
                    games={games}
                    setGames={setGames}
                    mapPool={mapPool}
                    team1={team1}
                    team2={team2}
                    vetoComplete={vetoComplete}
                    showPickBans={tournament?.game === 'overwatch'}
                    vetoHref={
                      match?.tournament_id
                        ? `/admin/tournament/${match.tournament_id}/bracket?tab=veto&match=${matchId}`
                        : null
                    }
                    t={t as unknown as Record<string, string>}
                  />
                </div>

                <MatchEditNotesActions
                  notes={form.notes}
                  onNotesChange={(v) => updateField('notes', v)}
                  saving={saving}
                  onCancel={() => router.push(backAdminUrl)}
                />
              </form>
            }
            aside={
              <>
                <MatchEditSummary
                  match={match}
                  team1={team1}
                  team2={team2}
                  detailHref={backAdminUrl}
                />

                {match.status !== 'finished' && match.status !== 'walkover' && (
                  <MatchReadinessChecklist
                    match={match}
                    team1Name={team1?.name ?? null}
                    team2Name={team2?.name ?? null}
                    tournamentStatus={tournament?.status ?? null}
                    stageActive={stage?.is_active ?? null}
                  />
                )}

                {(match.status === 'finished' ||
                  match.status === 'walkover') && (
                  <MvpSection matchId={match.id} />
                )}

                <MatchCastAssignments matchId={match.id} />

                <FicheSection title={t.historyHeading} eyebrow>
                  <MatchTimeline matchId={match.id} />
                </FicheSection>
              </>
            }
          />
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
          <p className={DIALOG_TEXT}>{t.statusRegressionBody}</p>
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
          <p className={DIALOG_TEXT}>
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

/* -----------------------------------------------------------
 * MVP poll section — shows poll status and allows manual import of winner.
 * Rendu dans features/admin/matches/ui/MatchEditAside.tsx (MatchEditMvpCard).
 * ---------------------------------------------------------*/

function MvpSection({ matchId }: { matchId: string }) {
  const t = useAdminT(nsAdminMatchEdit);
  const { confirm, dialog } = useConfirmDialog();
  const mvp = useMatchMvp(matchId);
  const data: MvpPollData | null = mvp.data ?? null;
  const loading = mvp.isFetching;
  const [selected, setSelected] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const loadErr = mvp.error ? mvp.error.message : null;

  // Chaque lecture (ouverture, après un geste) présélectionne le gagnant.
  const winner = mvp.data?.poll?.winner_member_id;
  useEffect(() => {
    if (winner) setSelected(winner);
  }, [winner]);

  const { refetch } = mvp;
  const fetchData = useCallback(async () => {
    setErr(null);
    await refetch();
  }, [refetch]);

  async function save() {
    if (!selected) return;
    setSaving(true);
    setErr(null);
    try {
      await matchesClient.setMvp(matchId, selected);
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
      await matchesClient.clearMvp(matchId);
      setSelected('');
      await fetchData();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {dialog}
      <MatchEditMvpCard
        data={data}
        loading={loading}
        selected={selected}
        onSelect={setSelected}
        saving={saving}
        err={err ?? loadErr}
        onSave={save}
        onClear={clear}
      />
    </>
  );
}

export default withAdminQuery(AdminMatchEditPage);
