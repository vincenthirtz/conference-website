// pages/api/admin/tcg/grant.ts
//
// Corriger le solde de pièces d'une joueuse — l'écrivain d'`admin_grant`.
//
//   POST { userId, amount, reason, idempotencyKey }
//     → 200 { ok: true, entryId, balance, replayed }
//
// POURQUOI CETTE ROUTE EXISTE. Le `source_kind` `admin_grant` était accepté par
// le schéma et affiché dans l'historique (« Ajustement par l'équipe »), mais
// rien ne l'écrivait : un solde faux ne se corrigeait qu'à la main en base,
// c'est-à-dire sans trace de QUI l'avait corrigé ni POURQUOI.
//
// UNE CORRECTION, PAS UNE VENTE. La monnaie du TCG se gagne, elle ne s'achète
// pas (cf. `utils/tcg/economy.ts`) : cette route ne connaît aucun moyen de
// paiement, aucun don, aucune référence à une transaction. Elle répare un solde
// que le jeu a mal tenu — une victoire non créditée, un doublon payé deux fois.
// La brancher sur un paiement en ferait une loot box payante.
//
// LE REGISTRE D'ABORD, LE SOLDE ENSUITE. On écrit une ligne dans
// `tcg_wallet_entries` (source de vérité), puis `refreshBalance` recalcule le
// cache `tcg_wallets.balance`. Jamais d'incrément direct du solde : un
// incrément perdu creuserait un écart définitif.
//
// IDEMPOTENCE PORTÉE PAR LA BASE. `idempotencyKey` devient `source_ref`, et
// l'unicité `(tenant_id, user_id, source_kind, source_ref)` de
// `tcg_wallet_entries` interdit la seconde écriture — aucune migration requise.
// Une relecture « ai-je déjà écrit ? » en mémoire laisserait une fenêtre entre
// la lecture et l'écriture (leçon des doublons Discord du 2026-09-12). La
// relecture préalable ci-dessous ne sert qu'à RÉPONDRE `replayed: true` sans
// passer par l'erreur ; la garantie, elle, reste la contrainte.
//
// LE MOTIF VIT DANS LE JOURNAL STAFF, PAS DANS LE REGISTRE. `tcg_wallet_entries`
// n'a pas de colonne de motif ; en ajouter une exigerait une migration appliquée
// AVANT le déploiement, faute de quoi chaque correction échouerait en 500. Le
// motif est écrit dans `staff_logs` avec l'identifiant de l'écriture, ce qui
// suffit à répondre « qui, combien, pourquoi » depuis l'une ou l'autre table.
//
// UN RETRAIT NE REND JAMAIS UN SOLDE NÉGATIF. Même discipline que l'achat d'un
// booster : le cache est débité CONDITIONNELLEMENT (`.eq('balance', avant)`)
// avant l'écriture au registre. Un achat simultané ne peut donc pas dépenser
// les pièces que le staff est en train de retirer.
//
// MÊME PERMISSION QUE LE RESTE DE L'ÉCONOMIE DU TCG (`manage_tcg`), comme
// le cadeau d'accueil : c'est la même économie qu'on touche.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { applyRateLimit } from '@/utils/rateLimit';
import { formatZodError } from '@/utils/validation';
import { refreshBalance } from '@/utils/tcg/grantVictoryRewards';
import { logger } from '@/utils/logger';

const SOURCE_KIND = 'admin_grant';

/** Borne d'une correction : au-delà, ce n'est plus une correction. */
const ADMIN_GRANT_MAX_ABS = 10_000;

/**
 * Tentatives du débit conditionnel. Perdre trois fois de suite la course contre
 * un achat à vitesse humaine n'arrive pas ; la borne évite seulement une boucle
 * infinie sur un cache qui bougerait sans cesse.
 */
const DEBIT_ATTEMPTS = 3;

const adminGrantSchema = z.object({
  userId: z.string().uuid(),
  amount: z
    .number()
    .int()
    .min(-ADMIN_GRANT_MAX_ABS)
    .max(ADMIN_GRANT_MAX_ABS)
    // Le schéma refuse aussi `amount = 0` (CHECK amount <> 0) : on le dit ici
    // en 400 lisible plutôt que de laisser Postgres répondre en 500.
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

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  // Aiguillage en forme POSITIVE : c'est ce que lit le garde de dérive OpenAPI.
  if (req.method === 'POST') return grant(req, res, ctx);

  res.setHeader('Allow', 'POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

async function grant(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (applyRateLimit(req, res, { max: 30, windowMs: 60_000 }, 'tcg-grant')) {
    return;
  }
  res.setHeader('Cache-Control', 'private, no-store');

  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service indisponible.' });
  }
  const tenantId = ctx.tenantId;
  if (!tenantId) {
    return res.status(400).json({ error: 'Espace non résolu.' });
  }

  const parsed = adminGrantSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: formatZodError(parsed.error), code: 'INVALID_BODY' });
  }
  const { userId, amount, reason, idempotencyKey } = parsed.data;

  // 1) Rejeu ? La clé est cherchée SANS filtrer sur la joueuse : réutiliser une
  //    clé pour une autre personne ou un autre montant est un bug d'appelant,
  //    et répondre « déjà fait » masquerait une correction jamais appliquée.
  const prior = await findByKey(tenantId, idempotencyKey);
  if (prior.error) {
    logger.error('[admin/tcg/grant] relecture impossible: %s', prior.error);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }
  if (prior.row) {
    return replyReplay(res, prior.row, { tenantId, userId, amount });
  }

  // 2) La joueuse existe-t-elle ? Une ERREUR de lecture n'est pas une absence :
  //    conclure « introuvable » sur un 504 ferait croire au staff que le compte
  //    n'existe pas, et il renoncerait à une correction légitime.
  const lookup = await supabaseAdmin.auth.admin.getUserById(userId);
  if (lookup.error) {
    const status = (lookup.error as { status?: number }).status;
    const code = (lookup.error as { code?: string }).code;
    if (status === 404 || code === 'user_not_found') {
      return userNotFound(res);
    }
    logger.error(
      '[admin/tcg/grant] compte illisible (%s): %s',
      userId,
      lookup.error.message
    );
    return res.status(500).json({ error: 'Lecture impossible.' });
  }
  if (!lookup.data?.user) return userNotFound(res);

  // 3) Un retrait réserve d'abord les pièces sur le cache (cf. l'en-tête).
  let debited = false;
  if (amount < 0) {
    const debit = await debitCache(tenantId, userId, -amount);
    if (debit.kind === 'error') {
      return res.status(500).json({ error: 'Lecture impossible.' });
    }
    if (debit.kind === 'insufficient') {
      return res.status(409).json({
        error: 'Solde insuffisant pour ce retrait.',
        code: 'INSUFFICIENT_BALANCE',
        balance: debit.available,
      });
    }
    if (debit.kind === 'contended') {
      return res.status(409).json({
        error: 'Le solde a changé pendant la correction, réessaie.',
        code: 'BALANCE_CHANGED',
      });
    }
    debited = true;
  }

  // 4) L'écriture au registre — la seule qui fasse foi.
  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('tcg_wallet_entries')
    .insert({
      tenant_id: tenantId,
      user_id: userId,
      amount,
      source_kind: SOURCE_KIND,
      source_ref: idempotencyKey,
      // Le motif est RECOPIÉ au registre (migration `tcg_wallet_entries_note`)
      // pour que la joueuse lise pourquoi son solde a bougé ; le journal staff
      // le garde aussi, avec l'auteur.
      note: reason,
    })
    .select('id')
    .maybeSingle();

  let entryId = (inserted as { id?: string } | null)?.id ?? null;

  if (insertError || !entryId) {
    // UNE ERREUR N'EST PAS UNE ABSENCE D'ÉCRITURE : un 504 après commit rend
    // une erreur alors que la ligne existe. On relit par la clé avant de
    // conclure — la contrainte a déjà tranché, on constate son verdict.
    // Relecture cadrée sur la joueuse : l'unicité du registre inclut
    // `user_id`, c'est donc NOTRE ligne qu'on cherche, pas celle d'une autre.
    const recheck = await findByKey(tenantId, idempotencyKey, userId);

    if (recheck.error) {
      // Indéterminé. On ne rend RIEN : si la ligne existe, `refreshBalance`
      // la compte ; sinon il rend les pièces réservées. Le cache revient juste
      // dans les deux cas, et un rejeu avec la même clé tranchera.
      logger.error(
        '[admin/tcg/grant] état indéterminé pour la clé %s: %s',
        idempotencyKey,
        recheck.error
      );
      await refreshBalance(tenantId, userId);
      return res.status(500).json({ error: 'Correction impossible.' });
    }

    if (!recheck.row) {
      // Rien d'écrit : le recalcul depuis un registre non débité rend les
      // pièces réservées à l'étape 3.
      logger.error(
        '[admin/tcg/grant] écriture refusée: %s',
        insertError?.message ?? 'aucune ligne rendue'
      );
      if (debited) await refreshBalance(tenantId, userId);
      return res.status(500).json({ error: 'Correction impossible.' });
    }

    // `23505` = une requête CONCURRENTE portant la même clé a gagné : c'est un
    // rejeu, et notre réservation doit être rendue. Toute autre erreur avec
    // une ligne présente = NOTRE écriture a bien eu lieu, seul l'accusé de
    // réception s'est perdu.
    if ((insertError as { code?: string } | null)?.code === '23505') {
      if (debited) await refreshBalance(tenantId, userId);
      return replyReplay(res, recheck.row, { tenantId, userId, amount });
    }
    logger.warn(
      '[admin/tcg/grant] écriture committée malgré une erreur (%s)',
      insertError?.message ?? 'aucune ligne rendue'
    );
    entryId = recheck.row.id;
  }

  // 5) Le cache se réaligne sur le registre.
  await refreshBalance(tenantId, userId);
  const balance = await readLedgerBalance(tenantId, userId);

  // 6) La trace : QUI a corrigé, de COMBIEN, POURQUOI. Un échec de journal ne
  //    doit pas faire croire que la correction a échoué — elle est écrite.
  try {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'tcg_admin_grant',
      entity_type: 'user',
      entity_id: userId,
      tenant_id: tenantId,
      payload: { userId, amount, reason, entryId },
    });
  } catch (logErr) {
    logger.error('[admin/tcg/grant] journal non écrit:', logErr);
  }

  return res.status(200).json({
    ok: true,
    entryId,
    balance,
    replayed: false,
  } satisfies AdminTcgGrantResponse);
}

/* -------------------------------------------------------------------------- */
/* Aides                                                                       */
/* -------------------------------------------------------------------------- */

function userNotFound(res: NextApiResponse) {
  return res
    .status(404)
    .json({ error: 'Compte introuvable.', code: 'USER_NOT_FOUND' });
}

/**
 * L'écriture déjà portée par cette clé, s'il y en a une.
 *
 * Rend `error` distinct de `row: null` : « je n'ai pas pu lire » et « il n'y a
 * rien » ne mènent pas au même geste.
 */
async function findByKey(
  tenantId: string,
  idempotencyKey: string,
  userId?: string
): Promise<{ row: EntryRow | null; error: string | null }> {
  let query = supabaseAdmin!
    .from('tcg_wallet_entries')
    .select('id, user_id, amount')
    .eq('tenant_id', tenantId)
    .eq('source_kind', SOURCE_KIND)
    .eq('source_ref', idempotencyKey);
  if (userId) query = query.eq('user_id', userId);
  const { data, error } = await query.limit(1);
  if (error) {
    return { row: null, error: (error as { message?: string }).message ?? '?' };
  }
  const rows = (data ?? []) as EntryRow[];
  return { row: rows[0] ?? null, error: null };
}

/**
 * Réponse à un rejeu. Une clé déjà appliquée à une AUTRE joueuse ou à un AUTRE
 * montant est refusée en 400 : l'appelant a recyclé une clé, et répondre
 * `replayed: true` lui ferait croire appliquée une correction qui ne l'est pas.
 */
async function replyReplay(
  res: NextApiResponse,
  row: EntryRow,
  expected: { tenantId: string; userId: string; amount: number }
) {
  if (row.user_id !== expected.userId || row.amount !== expected.amount) {
    return res.status(400).json({
      error: 'Cette clé d’idempotence a déjà servi à une autre correction.',
      code: 'INVALID_BODY',
    });
  }
  const balance = await readLedgerBalance(expected.tenantId, expected.userId);
  return res.status(200).json({
    ok: true,
    entryId: row.id,
    balance,
    replayed: true,
  } satisfies AdminTcgGrantResponse);
}

type DebitOutcome =
  | { kind: 'ok' }
  | { kind: 'insufficient'; available: number }
  | { kind: 'contended' }
  | { kind: 'error' };

/**
 * Réserve `cost` pièces sur le cache, conditionnellement au solde lu.
 *
 * LE DISPONIBLE EST LE MINIMUM DU CACHE ET DU REGISTRE. Le registre fait foi,
 * mais un achat de booster débite le CACHE avant d'écrire au registre : entre
 * les deux, seul le cache dit que ces pièces sont déjà engagées. Prendre le plus
 * petit des deux refuse un retrait dans les deux cas d'écart, sans jamais
 * laisser le registre passer sous zéro.
 */
async function debitCache(
  tenantId: string,
  userId: string,
  cost: number
): Promise<DebitOutcome> {
  let refreshed = false;

  for (let attempt = 0; attempt < DEBIT_ATTEMPTS; attempt += 1) {
    const ledger = await readLedgerSum(tenantId, userId);
    if (ledger === null) return { kind: 'error' };

    const { data: walletRow, error: walletError } = await supabaseAdmin!
      .from('tcg_wallets')
      .select('balance')
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .maybeSingle();
    if (walletError) {
      logger.error(
        '[admin/tcg/grant] solde illisible: %s',
        (walletError as { message?: string }).message
      );
      return { kind: 'error' };
    }

    const cached = (walletRow as { balance?: number } | null)?.balance;
    if (typeof cached !== 'number') {
      // Pas de ligne de cache alors que le registre a peut-être des pièces
      // (un recalcul antérieur a échoué). On le reconstruit UNE fois avant de
      // conclure, sinon on refuserait un retrait légitime.
      if (ledger > 0 && !refreshed) {
        refreshed = true;
        await refreshBalance(tenantId, userId);
        continue;
      }
      return { kind: 'insufficient', available: Math.max(0, ledger) };
    }

    const available = Math.max(0, Math.min(cached, ledger));
    if (available < cost) return { kind: 'insufficient', available };

    const { data: updated, error: updateError } = await supabaseAdmin!
      .from('tcg_wallets')
      .update({
        balance: cached - cost,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('user_id', userId)
      .eq('balance', cached)
      .select('balance');
    if (updateError) {
      logger.error(
        '[admin/tcg/grant] réservation impossible: %s',
        (updateError as { message?: string }).message
      );
      return { kind: 'error' };
    }
    if (updated && updated.length > 0) return { kind: 'ok' };
    // Zéro ligne : un autre mouvement est passé entre la lecture et l'écriture.
    // On relit tout plutôt que de réserver sur un solde périmé.
  }

  return { kind: 'contended' };
}

/** Somme brute du registre, `null` si illisible (jamais `0` par défaut). */
async function readLedgerSum(
  tenantId: string,
  userId: string
): Promise<number | null> {
  const { data, error } = await supabaseAdmin!
    .from('tcg_wallet_entries')
    .select('amount')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId);
  if (error) {
    logger.error(
      '[admin/tcg/grant] registre illisible (%s): %s',
      userId,
      (error as { message?: string }).message
    );
    return null;
  }
  return ((data ?? []) as Array<{ amount: number }>).reduce(
    (sum, row) => sum + (Number.isFinite(row.amount) ? row.amount : 0),
    0
  );
}

/**
 * Le solde rendu à l'appelant, lu dans le REGISTRE et plafonné à zéro comme le
 * fait `refreshBalance`. Si la relecture échoue APRÈS une écriture réussie, on
 * se rabat sur le cache : la correction est faite, un 500 ferait croire le
 * contraire et pousserait à la rejouer.
 */
async function readLedgerBalance(
  tenantId: string,
  userId: string
): Promise<number> {
  const sum = await readLedgerSum(tenantId, userId);
  if (sum !== null) return Math.max(0, sum);

  const { data } = await supabaseAdmin!
    .from('tcg_wallets')
    .select('balance')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle();
  return (data as { balance?: number } | null)?.balance ?? 0;
}

export default withStaffRoute(handler, { permission: 'manage_tcg' });
