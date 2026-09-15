// utils/tcg/paidMatches.ts
//
// « Ces matchs ont-ils déjà payé des récompenses TCG ? »
//
// POURQUOI. Supprimer PHYSIQUEMENT un match de tournoi (`DELETE ?hard=1`, ou la
// suppression groupée d'une phase) effaçait ses paquets de victoire : la clé
// `tcg_packs.source_match_id` était en `ON DELETE CASCADE`, et les cartes déjà
// ouvertes partaient avec. Les pièces, elles, restaient au registre (leur
// `source_ref` est du texte, sans clé étrangère). Et un match RECRÉÉ a un nouvel
// id : il repayait paquet et pièces aux mêmes gagnantes.
//
// Un match qui a payé ne se supprime donc plus physiquement : on l'ANNULE
// (suppression douce, déjà le comportement par défaut). La base porte la même
// règle en défense (`tcg_packs_source_match_restrict.sql` : `ON DELETE RESTRICT`)
// — ce module sert à refuser PROPREMENT, avec un message, avant qu'elle ne
// réponde par une violation de clé étrangère.
//
// DEUX TRACES DE PAIEMENT, lues toutes les deux : un paquet `victory`, OU une
// écriture de pièces `match_win` dont la référence est le match. Un paquet peut
// avoir été refusé alors que les pièces sont passées (pièces d'abord) : ne lire
// que les paquets laisserait supprimer un match qui a payé.
//
// UNE ERREUR N'EST PAS UNE ABSENCE : `ok: false`, et l'appelant REFUSE la
// suppression plutôt que de conclure « rien n'a été payé ».

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';

/** Identifiants par requête : un `in.(…)` de cent UUID reste court en URL. */
const CHUNK = 100;

export type PaidMatchesResult = { ok: true; paid: Set<string> } | { ok: false };

export async function readPaidMatchIds(
  tenantId: string,
  matchIds: readonly string[]
): Promise<PaidMatchesResult> {
  if (!supabaseAdmin) return { ok: false };
  const ids = [...new Set(matchIds.filter(Boolean))];
  const paid = new Set<string>();

  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const [packs, coins] = await Promise.all([
      supabaseAdmin
        .from('tcg_packs')
        .select('source_match_id')
        .eq('tenant_id', tenantId)
        .in('source_match_id', chunk),
      supabaseAdmin
        .from('tcg_wallet_entries')
        .select('source_ref')
        .eq('tenant_id', tenantId)
        .eq('source_kind', 'match_win')
        .in('source_ref', chunk),
    ]);
    if (packs.error || coins.error) {
      logger.error(
        '[tcg/paid-matches] lecture impossible',
        packs.error ?? coins.error
      );
      return { ok: false };
    }
    for (const row of (packs.data ?? []) as Array<{
      source_match_id: string | null;
    }>) {
      if (row.source_match_id) paid.add(row.source_match_id);
    }
    for (const row of (coins.data ?? []) as Array<{ source_ref: string }>) {
      if (row.source_ref) paid.add(row.source_ref);
    }
  }
  return { ok: true, paid };
}
