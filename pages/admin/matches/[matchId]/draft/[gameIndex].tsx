// pages/admin/matches/[matchId]/draft/[gameIndex].tsx
// Captain UI for the MOBA draft (Lot 4).
//
// Wires the Lots 0-3 plumbing into a single staff-protected page :
//   - useDraftState (Lot 4)  → fetch + Supabase Realtime subscription
//   - useDraftTimer (Lot 4)  → live countdown of the current step
//   - useIdempotentMutation  → every state-changing call is replayable
//   - DraftBoard / HeroPool / SidePicker / DraftStatusPanel components
//
// Flow :
//   1. Page loads. If no draft yet → "Initialise draft" button.
//   2. Sides selection (SidePicker) → PATCH .../side.
//   3. Start draft → POST .../start (arms deadline_at on step 1).
//   4. Click a hero in the pool → POST .../commit. Realtime fans out the
//      update; the page re-renders.
//   5. If the deadline expires and no commit comes in, the Lot 3 cron
//      (every minute) auto-picks. The operator can also force it via the
//      "Auto-pick now" button.

import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import { useAdminFetch, AdminFetchError } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast/ToastContext';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { useDraftState } from '@/hooks/useDraftState';
import { withStaffPage } from '@/utils/staff';
import { supabaseAdmin } from '@/utils/supabase';
import { isValidUUID } from '@/utils/apiHelpers';
import { isGameSlug } from '@/config/games';
import { DraftStatusPanel } from '@/components/admin/draft/DraftStatusPanel';
import { DraftBoard } from '@/components/admin/draft/DraftBoard';
import { SidePicker } from '@/components/admin/draft/SidePicker';
import { HeroPool } from '@/components/admin/draft/HeroPool';
import type { GameHero } from '@/types/draft';
import nsAdminMatchDraft from '@/lib/i18n/locales/admin-fr/adminMatchDraft';

type PageProps = {
  /** Set when the match can't host a draft — page renders a clean explainer. */
  blockReason?: {
    code: 'MATCH_NOT_FOUND' | 'NO_TOURNAMENT' | 'GAME_NOT_DRAFTABLE';
    detail?: string;
  };
};

type HeroesResponse = {
  game: 'lol' | 'dota2';
  total: number;
  heroes: GameHero[];
};

function errMsg(err: unknown): string {
  if (err instanceof AdminFetchError) {
    const payload = err.payload as { error?: string; code?: string } | null;
    if (payload?.error) {
      return payload.code
        ? `${payload.error} (${payload.code})`
        : payload.error;
    }
  }
  return err instanceof Error ? err.message : String(err);
}

function AdminDraftPage({ blockReason }: PageProps) {
  const t = useAdminT(nsAdminMatchDraft);
  if (blockReason) {
    const label =
      blockReason.code === 'MATCH_NOT_FOUND'
        ? t.blockMatchNotFound
        : blockReason.code === 'NO_TOURNAMENT'
          ? t.blockNoTournament
          : format(t.blockNotDraftable, {
              detail: blockReason.detail
                ? format(t.blockNotDraftableDetail, {
                    detail: blockReason.detail,
                  })
                : '',
            });
    return (
      <main className="mx-auto max-w-3xl p-6 text-neutral-200">
        <h1 className="text-2xl font-bold text-white">
          {t.unavailableHeading}
        </h1>
        <p className="mt-3 text-neutral-300">{label}</p>
      </main>
    );
  }
  return <AdminDraftPageContent />;
}

function AdminDraftPageContent() {
  const router = useRouter();
  const matchIdRaw = router.query.matchId;
  const gameIndexRaw = router.query.gameIndex;
  const matchId = typeof matchIdRaw === 'string' ? matchIdRaw : '';
  const gameIndex = Number(gameIndexRaw);
  const validIds =
    isValidUUID(matchId) && Number.isInteger(gameIndex) && gameIndex >= 1;

  const { adminFetchJson } = useAdminFetch();
  const initMut = useIdempotentMutation();
  const sideMut = useIdempotentMutation();
  const startMut = useIdempotentMutation();
  const commitMut = useIdempotentMutation();
  const autoPickMut = useIdempotentMutation();
  const { addToast } = useToast();

  const { state, loading, error, refresh } = useDraftState({
    matchId,
    gameIndex: gameIndex || 1,
    enabled: validIds,
  });

  const game = state?.draft?.game ?? null;
  const [heroes, setHeroes] = useState<GameHero[]>([]);
  const [heroesLoading, setHeroesLoading] = useState(false);

  // Load the hero pool whenever we know which game we're drafting.
  useEffect(() => {
    if (!game) return;
    setHeroesLoading(true);
    fetch(`/api/games/${game}/heroes`)
      .then((r) => r.json() as Promise<HeroesResponse>)
      .then((data) => setHeroes(Array.isArray(data.heroes) ? data.heroes : []))
      .catch(() => setHeroes([]))
      .finally(() => setHeroesLoading(false));
  }, [game]);

  const [busy, setBusy] = useState(false);

  async function callInit() {
    if (busy || !validIds) return;
    setBusy(true);
    try {
      await initMut.mutateJson(
        `/api/admin/matches/${encodeURIComponent(matchId)}/drafts`,
        {
          method: 'POST',
          body: JSON.stringify({ gameIndex }),
        }
      );
      addToast('Draft initialised.', 'success');
      await refresh();
    } catch (err) {
      addToast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function callSides(team1Side: string, team2Side: string) {
    if (busy || !validIds) return;
    setBusy(true);
    try {
      await sideMut.mutateJson(
        `/api/admin/matches/${encodeURIComponent(matchId)}/drafts/${gameIndex}/side`,
        {
          method: 'PATCH',
          body: JSON.stringify({ team1Side, team2Side }),
        }
      );
      addToast('Sides updated.', 'success');
      await refresh();
    } catch (err) {
      addToast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function callStart() {
    if (busy || !validIds) return;
    setBusy(true);
    try {
      await startMut.mutateJson(
        `/api/admin/matches/${encodeURIComponent(matchId)}/drafts/${gameIndex}/start`,
        { method: 'POST', body: '{}' }
      );
      addToast('Draft started — timer armed.', 'success');
      await refresh();
    } catch (err) {
      addToast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function callCommit(heroId: string) {
    if (busy || !validIds || !state) return;
    const stepNumber = state.draft.current_step + 1;
    setBusy(true);
    try {
      await commitMut.mutateJson(
        `/api/admin/matches/${encodeURIComponent(matchId)}/drafts/${gameIndex}/commit`,
        {
          method: 'POST',
          body: JSON.stringify({ stepNumber, heroId }),
        }
      );
      const action = state.flow.steps[stepNumber - 1]?.action ?? 'step';
      addToast(`Step ${stepNumber} (${action}) committed.`, 'success');
      await refresh();
    } catch (err) {
      addToast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function callAutoPick() {
    if (busy || !validIds) return;
    setBusy(true);
    try {
      const data = await autoPickMut.mutateJson<{
        autoPicked: boolean;
        stepNumber?: number;
      }>(
        `/api/admin/matches/${encodeURIComponent(matchId)}/drafts/${gameIndex}/auto-pick`,
        { method: 'POST', body: '{}' }
      );
      if (data.autoPicked) {
        addToast(`Auto-picked step ${data.stepNumber}.`, 'success');
      } else {
        addToast('Nothing to auto-pick yet.', 'info');
      }
      await refresh();
    } catch (err) {
      addToast(errMsg(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  const heroPoolDisabled = useMemo(() => {
    if (!state) return true;
    if (state.draft.status !== 'in_progress') return true;
    if (busy) return true;
    return false;
  }, [state, busy]);

  if (!validIds) {
    return (
      <main className="mx-auto max-w-3xl p-6 text-neutral-300">
        <h1 className="text-2xl font-bold">Invalid draft URL</h1>
        <p>matchId must be a UUID and gameIndex must be a positive integer.</p>
      </main>
    );
  }

  return (
    <>
      <Head>
        <title>
          Draft · match {matchId.slice(0, 8)}… · game {gameIndex}
        </title>
      </Head>
      <main className="mx-auto max-w-6xl space-y-6 p-6 text-neutral-200">
        <header>
          <div className="text-xs uppercase tracking-wider text-neutral-500">
            MOBA Draft
          </div>
          <h1 className="mt-1 text-2xl font-bold text-white">
            Match {matchId.slice(0, 8)}… · Game {gameIndex}
          </h1>
        </header>

        {loading && !state ? (
          <div className="rounded-2xl border border-neutral-700/50 bg-neutral-900/40 p-6 text-center text-neutral-400">
            Loading draft…
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-red-700/50 bg-red-900/30 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <DraftStatusPanel
          state={state}
          busy={busy}
          onInit={!state ? callInit : undefined}
          onStart={callStart}
          onAutoPick={callAutoPick}
        />

        {state &&
        state.draft.status === 'pending' &&
        state.draft.current_step === 0 ? (
          <SidePicker
            game={state.draft.game}
            currentTeam1Side={state.draft.team1_side}
            currentTeam2Side={state.draft.team2_side}
            disabled={busy}
            onSubmit={callSides}
          />
        ) : null}

        {state ? <DraftBoard state={state} /> : null}

        {state && game ? (
          heroesLoading ? (
            <div className="text-sm text-neutral-500">Loading hero pool…</div>
          ) : (
            <HeroPool
              heroes={heroes}
              state={state}
              disabled={heroPoolDisabled}
              onPick={callCommit}
            />
          )
        ) : null}
      </main>
    </>
  );
}

// SSR validation : verify the match exists in the staff's tenant AND that
// its tournament is tagged with a draftable game (lol / dota2). Surfaces a
// clean "Draft indisponible" page instead of letting the operator click
// "Initialise draft" and eat a 400 GAME_NOT_DRAFTABLE toast.
export const getServerSideProps = withStaffPage<PageProps>(
  { permission: 'arbitrate_matches' },
  async (ctx, staffCtx) => {
    const rawMatchId = ctx.params?.matchId;
    const matchId = typeof rawMatchId === 'string' ? rawMatchId : '';
    if (!isValidUUID(matchId) || !supabaseAdmin) {
      return { blockReason: { code: 'MATCH_NOT_FOUND' } };
    }

    const { data: match } = await supabaseAdmin
      .from('matches')
      .select('id, tournament_id')
      .eq('id', matchId)
      .eq('tenant_id', staffCtx.tenantId)
      .maybeSingle();
    if (!match) {
      return { blockReason: { code: 'MATCH_NOT_FOUND' } };
    }
    const tournamentId = (match as { tournament_id: string | null })
      .tournament_id;
    if (!tournamentId) {
      return { blockReason: { code: 'NO_TOURNAMENT' } };
    }

    const { data: tournament } = await supabaseAdmin
      .from('tournaments')
      .select('id, game')
      .eq('id', tournamentId)
      .maybeSingle();
    const game = (tournament as { game: string | null } | null)?.game ?? null;
    if (!game || !isGameSlug(game) || (game !== 'lol' && game !== 'dota2')) {
      return {
        blockReason: {
          code: 'GAME_NOT_DRAFTABLE',
          detail: game ?? undefined,
        },
      };
    }

    return {};
  }
);

export default AdminDraftPage;
