// features/admin/matches/service/drafts.ts — draft MOBA d'une partie
// (ban/pick). Toute la logique vit dans le moteur (utils/draftEngine) ; ce
// service le branche au tenant du staff et garde les corps d'erreur des
// routes d'origine. Aucune de ces routes n'écrivait au journal staff.

import { LegacyAdminError } from '@/utils/admin/errors';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import { isValidUUID } from '@/utils/apiHelpers';
import {
  applyAutoPickIfExpired,
  commitDraftStep,
  deleteDraft,
  getDraftState,
  initDraft,
  setDraftSides,
  startDraft,
} from '@/utils/draftEngine';
import * as repo from '../repository/drafts';
import { withDraftErrors } from './internal';

type Raw = Record<string, unknown>;
type DraftKey = { matchId: string; gameIndex: number };

/** POST …/drafts — `{ gameIndex, fearless?, pickTimerSeconds? }`. */
export async function initMatchDraft(
  ctx: ServiceContext,
  matchId: string,
  body: Raw
) {
  const gameIndex = Number(body.gameIndex);
  if (!Number.isInteger(gameIndex) || gameIndex < 1) {
    throw new LegacyAdminError(400, 'gameIndex must be a positive integer.');
  }
  const fearless =
    typeof body.fearless === 'boolean' ? body.fearless : undefined;
  const pickTimerSeconds =
    body.pickTimerSeconds === undefined
      ? undefined
      : Number(body.pickTimerSeconds);

  return withDraftErrors(
    ctx,
    '[admin/matches/:id/drafts] init error:',
    async () => {
      const state = await initDraft({
        matchId,
        gameIndex,
        tenantId: ctx.tenantId,
        fearless,
        pickTimerSeconds,
      });
      return { draft: state };
    }
  );
}

export async function getMatchDraft(ctx: ServiceContext, key: DraftKey) {
  return withDraftErrors(
    ctx,
    '[admin/matches/:id/drafts/:gameIndex] GET error:',
    async () => ({
      draft: await getDraftState({ ...key, tenantId: ctx.tenantId }),
    })
  );
}

/** DELETE — refuse un draft en cours sans `?force=1` (garde du moteur). */
export async function deleteMatchDraft(
  ctx: ServiceContext,
  key: DraftKey,
  force: boolean
) {
  return withDraftErrors(
    ctx,
    '[admin/matches/:id/drafts/:gameIndex] DELETE error:',
    async () => {
      const result = await deleteDraft({
        ...key,
        tenantId: ctx.tenantId,
        force,
      });
      return { success: true as const, ...result };
    }
  );
}

/** PATCH …/side — `{ team1Side, team2Side }`. */
export async function setMatchDraftSides(
  ctx: ServiceContext,
  key: DraftKey,
  body: Raw
) {
  const { team1Side, team2Side } = body;
  if (typeof team1Side !== 'string' || typeof team2Side !== 'string') {
    throw new LegacyAdminError(
      400,
      'team1Side and team2Side are required strings.'
    );
  }
  return withDraftErrors(
    ctx,
    '[admin/matches/:id/drafts/:gameIndex/side] error:',
    async () => ({
      draft: await setDraftSides({
        ...key,
        tenantId: ctx.tenantId,
        team1Side,
        team2Side,
      }),
    })
  );
}

/** POST …/start — pending → in_progress, arme le minuteur du step 1. */
export async function startMatchDraft(ctx: ServiceContext, key: DraftKey) {
  return withDraftErrors(
    ctx,
    '[admin/matches/:id/drafts/:gameIndex/start] error:',
    async () => ({
      draft: await startDraft({ ...key, tenantId: ctx.tenantId }),
    })
  );
}

/** POST …/commit — `{ stepNumber, heroId }`. */
export async function commitMatchDraftStep(
  ctx: ServiceContext,
  key: DraftKey,
  body: Raw
) {
  const stepNumber = Number(body.stepNumber);
  const heroId = body.heroId;
  if (!Number.isInteger(stepNumber) || stepNumber < 1) {
    throw new LegacyAdminError(400, 'stepNumber must be a positive integer.');
  }
  if (typeof heroId !== 'string' || !isValidUUID(heroId)) {
    throw new LegacyAdminError(400, 'heroId must be a UUID.');
  }
  return withDraftErrors(
    ctx,
    '[admin/matches/:id/drafts/:gameIndex/commit] error:',
    async () => ({
      draft: await commitDraftStep({
        ...key,
        tenantId: ctx.tenantId,
        stepNumber,
        heroId,
      }),
    })
  );
}

/** POST …/auto-pick — déclenche l'auto-pick si l'échéance est passée. */
export async function autoPickMatchDraft(ctx: ServiceContext, key: DraftKey) {
  return withDraftErrors(
    ctx,
    '[admin/matches/:id/drafts/:gameIndex/auto-pick] error:',
    async () => {
      const { row, error } = await repo.findDraftId(
        ctx.db,
        ctx.tenantId,
        key.matchId,
        key.gameIndex
      );
      if (error) throw new LegacyAdminError(500, error.message);
      if (!row) {
        throw new LegacyAdminError(404, 'Draft not found.', {
          code: 'DRAFT_NOT_FOUND',
        });
      }

      const result = await applyAutoPickIfExpired({
        draftId: row.id,
        tenantId: ctx.tenantId,
      });
      if (!result) return { autoPicked: false as const };
      return {
        autoPicked: true as const,
        stepNumber: result.stepNumber,
        heroId: result.heroId,
        draft: result.state,
      };
    }
  );
}
