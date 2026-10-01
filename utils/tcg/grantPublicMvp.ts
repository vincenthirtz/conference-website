// utils/tcg/grantPublicMvp.ts
//
// Les pièces de la MVP DU PUBLIC, versées à la clôture du scrutin.
//
// EFFET DE BORD, JAMAIS UN ÉCHEC DU DÉPOUILLEMENT. Le résultat du vote est
// annoncé à l'antenne dans la seconde : un porte-monnaie indisponible ne doit
// pas empêcher de le publier. On journalise et on rend la main.
//
// REJOUABLE SANS DOUBLON. `source_ref` = le match, et la contrainte UNIQUE
// (tenant, user, source_kind, source_ref) écarte une seconde clôture — le
// poller et la commande staff peuvent passer tous les deux.
//
// ⚠️ CE QUE LA CLÉ NE COUVRE PAS : un scrutin ROUVERT puis reclos sur une
// autre gagnante paie aussi la seconde, sans reprendre les pièces de la
// première. C'est assumé — une réouverture est un geste du staff, rare, et
// retirer des pièces déjà dépensées n'aurait pas de bonne issue.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { grantCoinsThenPacks } from '@/utils/tcg/grantCoinsThenPacks';
import { getEarnSource, PUBLIC_MVP_COINS } from '@/utils/tcg/earnSources';

export type PublicMvpGrantResult =
  | { ok: true; credited: boolean }
  | { ok: false; reason: 'schema_not_ready' | 'no_account' | 'failed' };

/**
 * Crédite la joueuse élue par le public.
 *
 * `memberId` est une ligne `team_members` : sans `user_id`, la joueuse n'a pas
 * de compte sur le site, donc pas de porte-monnaie — rien à écrire, et ce
 * n'est pas une erreur.
 */
export async function grantPublicMvpCoins(
  tenantId: string,
  matchId: string,
  memberId: string
): Promise<PublicMvpGrantResult> {
  // Le drapeau COMMANDE (cf. `earnSources.ts`).
  if (!getEarnSource('public_mvp')?.schemaReady) {
    return { ok: false, reason: 'schema_not_ready' };
  }

  try {
    const { data: member, error } = await supabaseAdmin
      .from('team_members')
      .select('user_id')
      .eq('tenant_id', tenantId)
      .eq('id', memberId)
      .maybeSingle();
    if (error) {
      logger.error('[tcg] public_mvp: lecture du membre impossible:', error);
      return { ok: false, reason: 'failed' };
    }
    const userId = (member?.user_id as string | null) ?? null;
    if (!userId) return { ok: false, reason: 'no_account' };

    const grant = await grantCoinsThenPacks({
      tenantId,
      walletSourceKind: 'public_mvp',
      packSourceKind: null,
      grants: [
        { userId, sourceRef: matchId, coins: PUBLIC_MVP_COINS, packs: 0 },
      ],
    });
    if (!grant.ok) {
      logger.error('[tcg] public_mvp: crédit refusé: %s', grant.message);
      return { ok: false, reason: 'failed' };
    }
    return { ok: true, credited: grant.credited.length > 0 };
  } catch (err) {
    logger.error('[tcg] public_mvp: crédit en échec:', err);
    return { ok: false, reason: 'failed' };
  }
}
