// features/player/tcg/service/cosmetics.ts — les habillages de vitrine :
// lire (GET), acheter (POST, 201), poser (PUT). Lot P14, extrait tel quel de
// pages/api/player/tcg/cosmetics.ts : mêmes contrôles, mêmes refus.
//
// DEUX VERBES, DEUX RÈGLES OPPOSÉES : POST fait payer — des pièces GAGNÉES,
// une fois — et refuse un second achat ; PUT ne fait JAMAIS payer (changer
// d'habillage, revenir au rendu par défaut : gratuit).
//
// L'ACHAT EST TRANSACTIONNEL (`tcg_buy_cosmetic`) : débiter puis débloquer,
// tout ou rien ; « déjà possédé » et « solde insuffisant » sont RE-vérifiés
// par la base. Ce service ne fait que planifier et traduire.
//
// ERREUR DE LECTURE ≠ VALEUR ABSENTE : vitrine ou registre illisibles
// répondent 500, jamais « rien de possédé » ni « solde 0 ».

import {
  COSMETICS,
  canEquip,
  planCosmeticPurchase,
  type CosmeticKind,
} from '@/utils/tcg/cosmetics';
import * as repo from '../repository/core';
import { BuyCosmeticBody, EquipCosmeticsBody } from '../schemas';
import { parseOrRefuse, refuse } from './errors';
import type { TcgServiceContext } from './context';

type ShowcaseRow = {
  frame: string | null;
  background: string | null;
  unlocked_cosmetics: string[] | null;
};

/** La ligne de vitrine, ou ses valeurs par défaut ; illisible ⇒ 500. */
async function readShowcase(ctx: TcgServiceContext): Promise<ShowcaseRow> {
  const { row, error } = await repo.readShowcaseCosmetics(ctx.db, ctx);
  if (error) {
    ctx.logger.error('[tcg/cosmetics] vitrine illisible: %s', error.message);
    throw refuse(500, 'Lecture impossible.');
  }
  return (
    (row as ShowcaseRow | null) ?? {
      frame: null,
      background: null,
      unlocked_cosmetics: [],
    }
  );
}

/** Le solde, lu au REGISTRE : c'est lui qui fait foi, pas son cache. */
async function readBalance(ctx: TcgServiceContext): Promise<number> {
  const { amounts, error } = await repo.readLedgerAmounts(ctx.db, ctx);
  if (error) {
    ctx.logger.error('[tcg/cosmetics] solde illisible: %s', error.message);
    throw refuse(500, 'Solde illisible.');
  }
  return amounts.reduce((sum, a) => sum + a, 0);
}

function refusal(reason: string): string {
  switch (reason) {
    case 'already_owned':
      return 'Tu possèdes déjà cet habillage.';
    case 'insufficient_funds':
      return 'Solde insuffisant.';
    default:
      return 'Habillage inconnu.';
  }
}

export async function readCosmetics(ctx: TcgServiceContext) {
  const row = await readShowcase(ctx);
  return {
    catalog: COSMETICS,
    owned: row.unlocked_cosmetics ?? [],
    frame: row.frame,
    background: row.background,
  };
}

export async function buyCosmetic(ctx: TcgServiceContext, rawBody: unknown) {
  const row = await readShowcase(ctx);
  const balance = await readBalance(ctx);
  const body = parseOrRefuse(BuyCosmeticBody, rawBody);

  const plan = planCosmeticPurchase({
    key: body.key,
    owned: row.unlocked_cosmetics ?? [],
    balance,
  });
  if (!plan.ok) {
    throw refuse(
      plan.reason === 'unknown_cosmetic' ? 400 : 409,
      refusal(plan.reason),
      plan.reason
    );
  }

  const bought = await repo.buyCosmeticRpc(ctx.db, {
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    key: plan.cosmetic.key,
    price: plan.cosmetic.priceCoins,
  });
  if (bought.error) {
    // Les refus levés PAR LA TRANSACTION (une autre requête a pu passer
    // entre la lecture et l'écriture).
    if (bought.error.message.includes('cosmetic_already_owned')) {
      throw refuse(409, refusal('already_owned'), 'already_owned');
    }
    if (bought.error.message.includes('cosmetic_insufficient_funds')) {
      throw refuse(409, refusal('insufficient_funds'), 'insufficient_funds');
    }
    ctx.logger.error('[tcg/cosmetics] achat refusé: %s', bought.error.message);
    throw refuse(500, 'Achat impossible.');
  }

  return {
    key: plan.cosmetic.key,
    balance: bought.balance ?? balance - plan.cosmetic.priceCoins,
  };
}

export async function equipCosmetics(ctx: TcgServiceContext, rawBody: unknown) {
  const body = parseOrRefuse(EquipCosmeticsBody, rawBody, {
    message: 'Habillage invalide.',
    code: 'invalid_body',
  });
  const patch: { frame?: string | null; background?: string | null } = {};

  const row = await readShowcase(ctx);
  const owned = row.unlocked_cosmetics ?? [];

  // Seules les clés PRÉSENTES sont appliquées ; `null` = rendu par défaut.
  for (const kind of ['frame', 'background'] as CosmeticKind[]) {
    if (!(kind in body)) continue;
    const raw = body[kind];
    const key = raw === null ? null : typeof raw === 'string' ? raw : undefined;
    if (key === undefined) {
      throw refuse(400, 'Habillage invalide.', 'invalid_body');
    }
    if (!canEquip({ key, kind, owned })) {
      throw refuse(409, 'Habillage non débloqué.', 'not_unlocked');
    }
    patch[kind] = key;
  }

  if (Object.keys(patch).length === 0) {
    throw refuse(400, 'Rien à changer.', 'invalid_body');
  }

  const { error } = await repo.upsertEquippedCosmetics(ctx.db, {
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    patch,
  });
  if (error) {
    ctx.logger.error('[tcg/cosmetics] habillage non écrit: %s', error.message);
    throw refuse(500, 'Enregistrement impossible.');
  }
  return { ...patch };
}
