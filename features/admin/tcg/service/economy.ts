// features/admin/tcg/service/economy.ts — l'économie du TCG côté staff :
// catalogue d'une joueuse, engagement, recherche, correction de solde, cadeau
// d'accueil, rattrapage Battle.net, lien d'overlay OBS.
//
// LA MONNAIE SE GAGNE, ELLE NE S'ACHÈTE PAS (cf. utils/tcg/economy.ts). Rien
// ici ne connaît un moyen de paiement : la correction de solde RÉPARE un solde
// mal tenu, les distributions collectives créditent des gains prévus.
//
// UNE JOUEUSE DE L'ESPACE, PAS N'IMPORTE QUEL COMPTE (correctif du
// 2026-09-15). `manage_tcg` appartient à tout owner d'espace, y compris un
// espace développeur en libre-service : toute cible nommée par le client est
// revérifiée RATTACHÉE au tenant (`utils/tcg/tenantAttachment.ts`), et un
// compte étranger reçoit la même réponse qu'un compte inexistant.
//
// Une lecture en ÉCHEC n'est jamais une absence : `null` ≠ « rien ».

import * as z from 'zod';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import { AdminError, LegacyAdminError } from '@/utils/admin/errors';
import { firstParam } from '@/utils/admin/pathParams';
import { isValidUUID } from '@/utils/apiHelpers';
import { formatZodError } from '@/utils/validation';
import { readTcgCatalogue } from '@/utils/tcg/readTcgCatalogue';
import { readTcgEngagement } from '@/utils/tcg/readEngagement';
import { isUserAttachedToTenant } from '@/utils/tcg/tenantAttachment';
import {
  adminDebitAtomic,
  isMissingRpc,
  sumLedgerPaginated,
} from '@/utils/tcg/walletRpc';
import { refreshBalance } from '@/utils/tcg/grantVictoryRewards';
import { resolveCurrentTournamentId } from '@/utils/currentTournament';
import {
  grantWelcomeGift,
  type WelcomeGiftReport,
} from '@/utils/tcg/grantWelcomeGift';
import { earnReward } from '@/utils/tcg/earnSources';
import {
  runBattlenetBackfill,
  simulateBattlenetBackfill,
} from '@/utils/tcg/battlenetBackfill';
import {
  getActiveOverlayToken,
  revokeOverlayToken,
  rotateOverlayToken,
} from '@/utils/tcg/overlayToken';
import { absoluteSiteUrl } from '@/utils/siteUrl';
import type { Audited } from '../../_shared/audited';
import * as repo from '../repository';

const unreadable = () => new AdminError(500, 'internal', 'Lecture impossible.');

/* ---------------------------------------------------------------------------
 * GET /catalogue[?userId=] — catalogue de l'espace (+ possession d'une joueuse)
 * ------------------------------------------------------------------------ */

export async function getCatalogue(ctx: ServiceContext, rawUserId: unknown) {
  const userId = typeof rawUserId === 'string' ? rawUserId.trim() : '';
  if (userId && !isValidUUID(userId)) {
    throw new LegacyAdminError(400, 'userId invalide.', {
      code: 'INVALID_USER_ID',
    });
  }

  if (userId) {
    const attached = await isUserAttachedToTenant(ctx.tenantId, userId);
    if (attached === null) {
      ctx.logger.error('[admin/tcg/catalogue] rattachement illisible');
      throw unreadable();
    }
    // 404 et non 403 : « interdit » confirmerait que le compte existe ailleurs.
    if (!attached) {
      throw new LegacyAdminError(404, 'Joueuse introuvable.', {
        code: 'PLAYER_NOT_FOUND',
      });
    }
  }

  const result = await readTcgCatalogue(ctx.tenantId, userId || null);
  if (!result.ok) {
    ctx.logger.error(
      '[admin/tcg/catalogue] lecture impossible: %s',
      result.error
    );
    throw unreadable();
  }
  return {
    cards: result.value.cards,
    total: result.value.cards.length,
    ownedCount: result.value.ownedCount,
    userId: userId || null,
  };
}

/* ---------------------------------------------------------------------------
 * GET /engagement[?weeks=8] — qui a un paquet qui dort (nominatif)
 * ------------------------------------------------------------------------ */

const MIN_WEEKS = 2;
const MAX_WEEKS = 26;
const DEFAULT_WEEKS = 8;

export async function getEngagement(ctx: ServiceContext, rawWeeks: unknown) {
  const parsed =
    typeof rawWeeks === 'string' ? Number.parseInt(rawWeeks, 10) : NaN;
  const weeks = Number.isFinite(parsed)
    ? Math.min(MAX_WEEKS, Math.max(MIN_WEEKS, parsed))
    : DEFAULT_WEEKS;

  const result = await readTcgEngagement(ctx.tenantId, weeks);
  if (!result.ok) {
    ctx.logger.error(
      '[admin/tcg/engagement] lecture impossible: %s',
      result.error
    );
    throw unreadable();
  }
  return {
    players: result.value.players,
    weekly: result.value.weekly,
    totals: result.value.totals,
  };
}

/* ---------------------------------------------------------------------------
 * GET /players?q= — trouver une joueuse de l'ESPACE (sans email)
 * ------------------------------------------------------------------------ */

/** Même forme que `/api/admin/users/search` : le sélecteur lit l'une ou l'autre. */
export type TcgPlayerSearchRow = {
  id: string;
  /** Toujours `null` : l'email n'est ni rendu ni cherché (oracle). */
  email: null;
  display_name: string | null;
  battle_tag: string | null;
  team_name: string | null;
};

const MIN_CHARS = 2;
const MAX_CHARS = 100;
const MAX_RESULTS = 20;

export async function searchPlayers(
  ctx: ServiceContext,
  rawQuery: unknown
): Promise<{ players: TcgPlayerSearchRow[] }> {
  const raw = firstParam(rawQuery);
  const query = (typeof raw === 'string' ? raw : undefined)?.trim() ?? '';
  if (query.length < MIN_CHARS || query.length > MAX_CHARS) {
    throw new AdminError(
      400,
      'validation',
      `La recherche doit faire entre ${MIN_CHARS} et ${MAX_CHARS} caractères.`
    );
  }

  // RPC cantonnée au tenant, filtrée EN BASE. Jamais de repli sur la RPC
  // globale : une recherche indisponible vaut mieux qu'une fuite.
  const { rows, error } = await repo.searchTenantPlayers(
    ctx.db,
    ctx.tenantId,
    query
  );
  if (error) {
    if (isMissingRpc(error)) {
      ctx.logger.error(
        '[admin/tcg/players] admin_search_tcg_players absente (migration tcg_admin_search_players_scoped.sql)'
      );
      throw new LegacyAdminError(503, 'Recherche momentanément indisponible.', {
        code: 'SEARCH_UNAVAILABLE',
      });
    }
    ctx.logger.error(
      '[admin/tcg/players] recherche impossible: %s',
      error.message
    );
    throw new AdminError(500, 'internal', 'Recherche impossible.');
  }

  const players = rows
    .filter((row) => typeof row.id === 'string')
    .slice(0, MAX_RESULTS)
    .map((row) => ({
      id: row.id as string,
      email: null,
      display_name:
        typeof row.display_name === 'string' ? row.display_name : null,
      battle_tag: typeof row.battle_tag === 'string' ? row.battle_tag : null,
      team_name: typeof row.team_name === 'string' ? row.team_name : null,
    }));
  return { players };
}

/* ---------------------------------------------------------------------------
 * POST /grant — corriger le solde d'une joueuse (`admin_grant`)
 *
 * LE REGISTRE D'ABORD, LE SOLDE ENSUITE : une ligne dans `tcg_wallet_entries`,
 * puis `refreshBalance` recalcule le cache. IDEMPOTENCE PORTÉE PAR LA BASE :
 * `idempotencyKey` devient `source_ref`, l'unicité interdit la seconde
 * écriture. UN RETRAIT NE REND JAMAIS UN SOLDE NÉGATIF (`tcg_admin_debit`, une
 * transaction ; sans la migration, retrait refusé en 503). Le motif vit dans
 * le journal staff ET au registre (`note`).
 * ------------------------------------------------------------------------ */

const ADMIN_GRANT_MAX_ABS = 10_000;

const adminGrantSchema = z.object({
  userId: z.string().uuid(),
  amount: z
    .number()
    .int()
    .min(-ADMIN_GRANT_MAX_ABS)
    .max(ADMIN_GRANT_MAX_ABS)
    .refine((n) => n !== 0, { message: 'amount ne peut pas être nul' }),
  reason: z.string().trim().min(3).max(500),
  idempotencyKey: z.string().uuid(),
});

export type AdminTcgGrantResponse = {
  ok: true;
  entryId: string;
  balance: number;
  replayed: boolean;
};

type EntryRow = { id: string; user_id: string; amount: number };

const userNotFound = () =>
  new LegacyAdminError(404, 'Compte introuvable.', { code: 'USER_NOT_FOUND' });

async function findByKey(
  ctx: ServiceContext,
  key: string,
  userId?: string
): Promise<{ row: EntryRow | null; error: string | null }> {
  const { row, error } = await repo.findGrantByKey(
    ctx.db,
    ctx.tenantId,
    key,
    userId
  );
  if (error) return { row: null, error: error.message ?? '?' };
  return { row, error: null };
}

/** Solde lu au REGISTRE (somme paginée), repli sur le cache après écriture. */
async function currentBalance(ctx: ServiceContext, userId: string) {
  const sum = await sumLedgerPaginated(ctx.tenantId, userId);
  if (sum !== null) return Math.max(0, sum);
  return repo.cachedBalance(ctx.db, ctx.tenantId, userId);
}

/**
 * Rejeu : une clé déjà appliquée à une AUTRE joueuse ou un AUTRE montant est
 * refusée (400) — répondre `replayed` ferait croire appliquée une correction
 * qui ne l'est pas. Un rejeu n'est pas journalisé une seconde fois.
 */
async function replay(
  ctx: ServiceContext,
  row: EntryRow,
  userId: string,
  amount: number
): Promise<Audited<AdminTcgGrantResponse>> {
  if (row.user_id !== userId || row.amount !== amount) {
    throw new LegacyAdminError(
      400,
      'Cette clé d’idempotence a déjà servi à une autre correction.',
      { code: 'INVALID_BODY' }
    );
  }
  return {
    result: {
      ok: true,
      entryId: row.id,
      balance: await currentBalance(ctx, userId),
      replayed: true,
    },
    audit: { skip: true },
  };
}

export async function grantCoins(
  ctx: ServiceContext,
  rawBody: unknown
): Promise<Audited<AdminTcgGrantResponse>> {
  const parsed = adminGrantSchema.safeParse(rawBody ?? {});
  if (!parsed.success) {
    throw new LegacyAdminError(400, formatZodError(parsed.error), {
      code: 'INVALID_BODY',
    });
  }
  const { userId, amount, reason, idempotencyKey } = parsed.data;
  const tenantId = ctx.tenantId;

  // 1) Rejeu ? Clé cherchée SANS filtrer sur la joueuse (clé recyclée = bug).
  const prior = await findByKey(ctx, idempotencyKey);
  if (prior.error) {
    ctx.logger.error('[admin/tcg/grant] relecture impossible: %s', prior.error);
    throw unreadable();
  }
  if (prior.row) return replay(ctx, prior.row, userId, amount);

  // 2) Rattachée à CET espace ? Vérifié AVANT GoTrue.
  const attached = await isUserAttachedToTenant(tenantId, userId);
  if (attached === null) throw unreadable();
  if (!attached) throw userNotFound();

  // 3) Le compte existe-t-il encore ? Une ERREUR de lecture n'est pas une absence.
  const lookup = await ctx.db.auth.admin.getUserById(userId);
  if (lookup.error) {
    const status = (lookup.error as { status?: number }).status;
    const code = (lookup.error as { code?: string }).code;
    if (status === 404 || code === 'user_not_found') throw userNotFound();
    ctx.logger.error(
      '[admin/tcg/grant] compte illisible (%s): %s',
      userId,
      lookup.error.message
    );
    throw unreadable();
  }
  if (!lookup.data?.user) throw userNotFound();

  let entryId: string | null = null;
  let balance: number | null = null;
  const correctionFailed = () =>
    new AdminError(500, 'internal', 'Correction impossible.');

  if (amount < 0) {
    // 4a) RETRAIT : contrôle et écriture dans une seule transaction SQL.
    const debit = await adminDebitAtomic({
      tenantId,
      userId,
      cost: -amount,
      sourceRef: idempotencyKey,
      note: reason,
    });
    switch (debit.kind) {
      case 'ok':
        entryId = debit.entryId;
        balance = debit.balance;
        break;
      case 'insufficient':
        throw new LegacyAdminError(409, 'Solde insuffisant pour ce retrait.', {
          code: 'INSUFFICIENT_BALANCE',
          extra: { balance: debit.balance },
        });
      case 'contended':
        throw new LegacyAdminError(
          409,
          'Le solde a changé pendant la correction, réessaie.',
          { code: 'BALANCE_CHANGED' }
        );
      case 'unavailable':
        ctx.logger.error(
          '[admin/tcg/grant] tcg_admin_debit absente — retrait refusé (migration tcg_wallet_atomic_balance.sql)'
        );
        throw new LegacyAdminError(503, 'Retrait momentanément indisponible.', {
          code: 'WITHDRAWAL_UNAVAILABLE',
        });
      case 'duplicate':
      case 'error': {
        // La contrainte a tranché : on constate son verdict par la clé.
        const recheck = await findByKey(ctx, idempotencyKey, userId);
        if (recheck.error || !recheck.row) {
          ctx.logger.error(
            '[admin/tcg/grant] retrait indéterminé pour la clé %s: %s',
            idempotencyKey,
            debit.kind === 'error' ? debit.message : 'doublon sans ligne'
          );
          throw correctionFailed();
        }
        if (debit.kind === 'duplicate') {
          return replay(ctx, recheck.row, userId, amount);
        }
        ctx.logger.warn(
          '[admin/tcg/grant] retrait committé malgré une erreur (%s)',
          debit.message
        );
        entryId = recheck.row.id;
        break;
      }
    }
  } else {
    // 4b) CRÉDIT : rien ne peut devenir négatif, écriture directe au registre.
    const inserted = await repo.insertGrantCredit(ctx.db, {
      tenantId,
      userId,
      amount,
      idempotencyKey,
      note: reason,
    });
    entryId = inserted.id;

    if (inserted.error || !entryId) {
      // UNE ERREUR N'EST PAS UNE ABSENCE D'ÉCRITURE (504 après commit).
      const recheck = await findByKey(ctx, idempotencyKey, userId);
      if (recheck.error) {
        ctx.logger.error(
          '[admin/tcg/grant] état indéterminé pour la clé %s: %s',
          idempotencyKey,
          recheck.error
        );
        await refreshBalance(tenantId, userId);
        throw correctionFailed();
      }
      if (!recheck.row) {
        ctx.logger.error(
          '[admin/tcg/grant] écriture refusée: %s',
          inserted.error?.message ?? 'aucune ligne rendue'
        );
        throw correctionFailed();
      }
      // 23505 = une requête CONCURRENTE portant la même clé a gagné.
      if ((inserted.error as { code?: string } | null)?.code === '23505') {
        return replay(ctx, recheck.row, userId, amount);
      }
      ctx.logger.warn(
        '[admin/tcg/grant] écriture committée malgré une erreur (%s)',
        inserted.error?.message ?? 'aucune ligne rendue'
      );
      entryId = recheck.row.id;
    }
  }

  // 5) Le cache se réaligne sur le registre (sous verrou, somme en base).
  const refreshed = await refreshBalance(tenantId, userId);
  if (refreshed !== null) balance = refreshed;
  if (balance === null) balance = await currentBalance(ctx, userId);

  // 6) La trace : QUI a corrigé, de COMBIEN, POURQUOI.
  return {
    result: { ok: true, entryId: entryId as string, balance, replayed: false },
    audit: {
      entity_type: 'user',
      entity_id: userId,
      payload: { userId, amount, reason, entryId },
    },
  };
}

/* ---------------------------------------------------------------------------
 * GET · POST /welcome-gift — le cadeau d'accueil de l'édition EN COURS
 * (résolue côté serveur, jamais choisie par le client)
 * ------------------------------------------------------------------------ */

export type TcgWelcomeGiftState = WelcomeGiftReport & {
  tournamentId: string | null;
  reward: { coins: number; packs: number };
};

export async function welcomeGift(
  ctx: ServiceContext,
  dryRun: boolean
): Promise<Audited<TcgWelcomeGiftState>> {
  const reward = earnReward('welcome_gift');
  const tournamentId = await resolveCurrentTournamentId(ctx.tenantId);
  if (!tournamentId) {
    return {
      result: {
        tournamentId: null,
        eligible: 0,
        alreadyGifted: 0,
        granted: 0,
        packsGranted: 0,
        teams: 0,
        reward,
      },
      audit: { skip: true },
    };
  }

  const report = await grantWelcomeGift({
    tenantId: ctx.tenantId,
    tournamentId,
    ...(dryRun ? { dryRun: true } : {}),
  });
  return {
    result: { ...report, tournamentId, reward },
    audit: {
      entity_type: 'tournament',
      entity_id: tournamentId,
      payload: {
        granted: report.granted,
        packsGranted: report.packsGranted,
        eligible: report.eligible,
        alreadyGifted: report.alreadyGifted,
        coins: reward.coins,
      },
    },
  };
}

/* ---------------------------------------------------------------------------
 * GET · POST /battlenet-backfill — rattrapage « compte Battle.net vérifié »
 * (audience = l'espace du staff : la récompense est unique par personne)
 * ------------------------------------------------------------------------ */

export async function simulateBackfill(ctx: ServiceContext) {
  const simulation = await simulateBattlenetBackfill(ctx.tenantId);
  if (!simulation) {
    // Une audience illisible n'est pas une audience vide.
    throw new LegacyAdminError(500, 'Audience illisible.', {
      code: 'AUDIENCE_UNREADABLE',
    });
  }
  return simulation;
}

export async function runBackfill(ctx: ServiceContext) {
  const report = await runBattlenetBackfill(ctx.tenantId);
  if (!report) {
    throw new LegacyAdminError(
      500,
      'Audience illisible, rien n’a été distribué.',
      { code: 'AUDIENCE_UNREADABLE' }
    );
  }
  return {
    result: report,
    audit: {
      entity_type: 'tenant',
      entity_id: ctx.tenantId,
      payload: {
        eligible: report.eligible,
        granted: report.granted,
        already: report.already,
        errors: report.errors,
        coins: report.reward.coins,
      },
    },
  };
}

/* ---------------------------------------------------------------------------
 * GET · POST · DELETE /overlay-token — lien PORTEUR de la source OBS
 * (un seul jeton actif par espace : émettre révoque). Journalisé SANS le jeton.
 * ------------------------------------------------------------------------ */

export type TcgOverlayTokenState = {
  url: string | null;
  createdAt: string | null;
  lastUsedAt: string | null;
};

function presentToken(
  token: string | null,
  createdAt: string | null,
  lastUsedAt: string | null
): TcgOverlayTokenState {
  if (!token) return { url: null, createdAt: null, lastUsedAt: null };
  return {
    url: absoluteSiteUrl(`/overlay/tcg/${token}`),
    createdAt,
    lastUsedAt,
  };
}

export async function getOverlayToken(ctx: ServiceContext) {
  const row = await getActiveOverlayToken(ctx.tenantId);
  return presentToken(
    row?.token ?? null,
    row?.created_at ?? null,
    row?.last_used_at ?? null
  );
}

export async function rotateToken(
  ctx: ServiceContext,
  userId: string | null
): Promise<Audited<TcgOverlayTokenState>> {
  const token = await rotateOverlayToken(ctx.tenantId, userId);
  if (!token) throw new AdminError(500, 'internal', 'Émission impossible.');
  // On relit pour rendre les horodatages réels plutôt que de les deviner.
  const row = await getActiveOverlayToken(ctx.tenantId);
  return {
    result: presentToken(
      token,
      row?.created_at ?? null,
      row?.last_used_at ?? null
    ),
    audit: {
      entity_type: 'broadcast',
      payload: { mode: 'tcg-overlay-token-rotated' },
    },
  };
}

export async function revokeToken(
  ctx: ServiceContext
): Promise<Audited<TcgOverlayTokenState>> {
  await revokeOverlayToken(ctx.tenantId);
  return {
    result: presentToken(null, null, null),
    audit: {
      entity_type: 'broadcast',
      payload: { mode: 'tcg-overlay-token-revoked' },
    },
  };
}
