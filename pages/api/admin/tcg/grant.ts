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
// booster, et même fonction SQL de principe (`tcg_admin_debit`, migration
// `tcg_wallet_atomic_balance.sql`) : verrou de la ligne de porte-monnaie,
// solde relu par `SUM(amount)` sur le registre, écriture — une transaction. Un
// achat simultané attend le verrou et voit le retrait. L'ancien débit
// conditionnel du CACHE ne protégeait pas d'un recalcul intercalé, et la somme
// JavaScript du registre était coupée à 1000 lignes. Sans la migration, un
// retrait est REFUSÉ (503) ; un crédit, qui ne peut rien rendre négatif, passe.
//
// UNE JOUEUSE DE L'ESPACE, PAS N'IMPORTE QUEL COMPTE (correctif du 2026-09-15).
// `manage_tcg` appartient à tout owner d'espace, y compris un espace
// développeur créé en libre-service. Accepter n'importe quel `userId` laissait
// un owner tiers créditer une étrangère — ce qui lui créait un porte-monnaie
// chez lui, que le rattrapage Battle.net prenait pour un rattachement : la
// récompense unique de cette joueuse était consommée hors de son espace. La
// cible doit donc être RATTACHÉE (`utils/tcg/tenantAttachment.ts` : roster du
// tenant, ou gain réel au registre du tenant — un `admin_grant` ne compte pas).
// Sinon `404 USER_NOT_FOUND`, la MÊME réponse qu'un compte inexistant, vérifiée
// AVANT de consulter GoTrue : la route ne dit pas si un identifiant quelconque
// correspond à un compte de la plateforme.
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
import { isUserAttachedToTenant } from '@/utils/tcg/tenantAttachment';
import { adminDebitAtomic, sumLedgerPaginated } from '@/utils/tcg/walletRpc';
import { logger } from '@/utils/logger';

const SOURCE_KIND = 'admin_grant';

/** Borne d'une correction : au-delà, ce n'est plus une correction. */
const ADMIN_GRANT_MAX_ABS = 10_000;

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

  // 2) La joueuse est-elle rattachée à CET espace ? Vérifié AVANT d'interroger
  //    GoTrue : un identifiant étranger reçoit la même réponse qu'un compte
  //    inexistant (cf. l'en-tête). Une lecture en échec n'est pas une absence.
  const attached = await isUserAttachedToTenant(tenantId, userId);
  if (attached === null) {
    return res.status(500).json({ error: 'Lecture impossible.' });
  }
  if (!attached) return userNotFound(res);

  // 3) Le compte existe-t-il encore ? Une ERREUR de lecture n'est pas une
  //    absence : conclure « introuvable » sur un 504 ferait croire au staff que
  //    le compte n'existe pas, et il renoncerait à une correction légitime.
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

  let entryId: string | null = null;
  let balance: number | null = null;

  if (amount < 0) {
    // 4a) Un RETRAIT : contrôle et écriture dans une seule transaction SQL.
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
        return res.status(409).json({
          error: 'Solde insuffisant pour ce retrait.',
          code: 'INSUFFICIENT_BALANCE',
          balance: debit.balance,
        });
      case 'contended':
        return res.status(409).json({
          error: 'Le solde a changé pendant la correction, réessaie.',
          code: 'BALANCE_CHANGED',
        });
      case 'unavailable':
        logger.error(
          '[admin/tcg/grant] tcg_admin_debit absente — retrait refusé (migration tcg_wallet_atomic_balance.sql)'
        );
        return res.status(503).json({
          error: 'Retrait momentanément indisponible.',
          code: 'WITHDRAWAL_UNAVAILABLE',
        });
      case 'duplicate':
      case 'error': {
        // `duplicate` : une requête CONCURRENTE portant la même clé a gagné.
        // `error` : résultat INCONNU (un 504 après commit rend une erreur alors
        // que la transaction est passée). Dans les deux cas la contrainte a
        // tranché : on constate son verdict en relisant par la clé.
        const recheck = await findByKey(tenantId, idempotencyKey, userId);
        if (recheck.error || !recheck.row) {
          logger.error(
            '[admin/tcg/grant] retrait indéterminé pour la clé %s: %s',
            idempotencyKey,
            debit.kind === 'error' ? debit.message : 'doublon sans ligne'
          );
          return res.status(500).json({ error: 'Correction impossible.' });
        }
        if (debit.kind === 'duplicate') {
          return replyReplay(res, recheck.row, { tenantId, userId, amount });
        }
        logger.warn(
          '[admin/tcg/grant] retrait committé malgré une erreur (%s)',
          debit.message
        );
        entryId = recheck.row.id;
        break;
      }
    }
  } else {
    // 4b) Un CRÉDIT ne peut rien rendre négatif : écriture directe au registre.
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

    entryId = (inserted as { id?: string } | null)?.id ?? null;

    if (insertError || !entryId) {
      // UNE ERREUR N'EST PAS UNE ABSENCE D'ÉCRITURE : un 504 après commit rend
      // une erreur alors que la ligne existe. On relit par la clé avant de
      // conclure. Relecture cadrée sur la joueuse : l'unicité du registre
      // inclut `user_id`, c'est donc NOTRE ligne qu'on cherche.
      const recheck = await findByKey(tenantId, idempotencyKey, userId);

      if (recheck.error) {
        logger.error(
          '[admin/tcg/grant] état indéterminé pour la clé %s: %s',
          idempotencyKey,
          recheck.error
        );
        await refreshBalance(tenantId, userId);
        return res.status(500).json({ error: 'Correction impossible.' });
      }

      if (!recheck.row) {
        logger.error(
          '[admin/tcg/grant] écriture refusée: %s',
          insertError?.message ?? 'aucune ligne rendue'
        );
        return res.status(500).json({ error: 'Correction impossible.' });
      }

      // `23505` = une requête CONCURRENTE portant la même clé a gagné : c'est un
      // rejeu. Toute autre erreur avec une ligne présente = NOTRE écriture a
      // bien eu lieu, seul l'accusé de réception s'est perdu.
      if ((insertError as { code?: string } | null)?.code === '23505') {
        return replyReplay(res, recheck.row, { tenantId, userId, amount });
      }
      logger.warn(
        '[admin/tcg/grant] écriture committée malgré une erreur (%s)',
        insertError?.message ?? 'aucune ligne rendue'
      );
      entryId = recheck.row.id;
    }
  }

  // 5) Le cache se réaligne sur le registre (sous verrou, somme faite par la
  //    base). Le solde rendu est celui que ce recalcul a écrit.
  const refreshed = await refreshBalance(tenantId, userId);
  if (refreshed !== null) balance = refreshed;
  if (balance === null) balance = await currentBalance(tenantId, userId);

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
    entryId: entryId as string,
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
  const balance = await currentBalance(expected.tenantId, expected.userId);
  return res.status(200).json({
    ok: true,
    entryId: row.id,
    balance,
    replayed: true,
  } satisfies AdminTcgGrantResponse);
}

/**
 * Le solde rendu à l'appelant, lu dans le REGISTRE (somme paginée, sans
 * plafond de 1000 lignes) et plafonné à zéro comme le recalcul. Si la lecture
 * échoue APRÈS une écriture réussie, on se rabat sur le cache : la correction
 * est faite, un 500 ferait croire le contraire et pousserait à la rejouer.
 */
async function currentBalance(
  tenantId: string,
  userId: string
): Promise<number> {
  const sum = await sumLedgerPaginated(tenantId, userId);
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
