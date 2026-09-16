// utils/tcg/engagedCards.ts
//
// « Lesquels de mes exemplaires sont déjà PROMIS dans une de mes propositions
// d'échange en attente ? » — une seule lecture, pour deux écrans.
//
// POURQUOI CE MODULE EXISTE. `tcg_propose_trade` réserve un exemplaire PRÉCIS
// (`from_pack_id` + `from_position`) dès la proposition. Le composeur d'échange
// le savait (`trades/cards.ts`, champ `available`), la collection l'ignorait :
// « Recycler » s'affichait sans un mot sur une carte promise, la route de
// recyclage l'acceptait (à dessein, elle ne connaît pas les échanges), et la
// partenaire voyait ensuite son échange annulé à l'acceptation (`stale`).
// Deux lecteurs qui posent la même question doivent lire la même réponse :
// un seul calcul, donc, sans quoi l'un des deux finirait par compter les
// propositions échues et l'autre non.
//
// LA RÈGLE « ENGAGÉ » EST CELLE DE LA FONCTION SQL, AU MOT PRÈS
// (`database/migrations/tcg_card_trades.sql`, `tcg_propose_trade` étape 5) :
// côté `offered`, proposition `pending` ET `expires_at` encore dans le futur.
// Une proposition échue mais pas encore marquée ne réserve plus rien — la
// compter ferait avertir d'un risque qui n'existe pas.
//
// SEULES MES PROPOSITIONS ENVOYÉES RÉSERVENT. Une carte qu'on me DEMANDE n'est
// pas un exemplaire désigné : la fonction SQL choisit le mien à l'acceptation.
//
// BEST-EFFORT. Les deux appelants n'utilisent ce résultat que pour AFFICHER
// (un compteur, un avertissement) ; les règles vivent en SQL. Une lecture en
// échec rend donc un résultat vide marqué `ok: false`, et l'appelant journalise
// sans faire échouer sa page — la collection ne doit pas tomber parce qu'un
// avertissement est illisible.

import { supabaseAdmin } from '@/utils/supabase';
import { cardSubjectKey } from '@/utils/tcg/subjectKey';

/** Une ligne `tcg_trade_items` côté `offered`, telle que lue ici. */
export type EngagedItemRow = {
  subject_kind: string;
  card_user_id: string | null;
  card_team_id: string | null;
  card_map_slug: string | null;
  from_pack_id: string | null;
  from_position: number | null;
};

export type EngagedCopies = {
  /** Exemplaires engagés par clé de sujet (`<kind>:<id>`, cf. `subjectKey.ts`). */
  bySubject: Map<string, number>;
  /** Exemplaires engagés, désignés par `copyRef(packId, position)`. */
  copies: Set<string>;
};

export type EngagedCopiesResult =
  | ({ ok: true } & EngagedCopies)
  | ({ ok: false; error: string } & EngagedCopies);

/**
 * La référence d'un exemplaire. Même couple que la source d'un recyclage
 * (`<pack_id>:<position>`) : c'est ce qui désigne UNE carte, le sujet seul
 * désignant toutes ses copies.
 */
export function copyRef(packId: string, position: number): string {
  return `${packId}:${position}`;
}

/** Agrège des lignes d'items offerts. Pur. */
export function summarizeEngagedItems(
  rows: readonly EngagedItemRow[]
): EngagedCopies {
  const bySubject = new Map<string, number>();
  const copies = new Set<string>();
  for (const row of rows) {
    // Le CHECK du schéma garantit un sujet ; une ligne sans sujet est une
    // corruption, on la saute plutôt que d'inventer un compte.
    const key = cardSubjectKey(row);
    if (!key) continue;
    // Un même exemplaire ne peut pas être engagé deux fois (la fonction SQL
    // l'exclut) ; si la base le montrait quand même, on ne le compterait
    // qu'une fois — sinon le compteur dépasserait les exemplaires possédés.
    if (row.from_pack_id && typeof row.from_position === 'number') {
      const ref = copyRef(row.from_pack_id, row.from_position);
      if (copies.has(ref)) continue;
      copies.add(ref);
    }
    bySubject.set(key, (bySubject.get(key) ?? 0) + 1);
  }
  return { bySubject, copies };
}

const empty = (): EngagedCopies => ({
  bySubject: new Map(),
  copies: new Set(),
});

/**
 * Les exemplaires qu'une joueuse a promis dans ses propositions en attente.
 *
 * Deux requêtes, pas une jointure : le dépôt n'utilise pas les ressources
 * imbriquées de PostgREST (cf. l'en-tête de `collection.ts`). La seconde n'est
 * faite que s'il existe une proposition en attente — le cas de loin le plus
 * courant est « aucune », et la collection est la page la plus fréquentée du
 * TCG.
 */
export async function readEngagedCopies(
  tenantId: string,
  userId: string,
  now: Date = new Date()
): Promise<EngagedCopiesResult> {
  if (!supabaseAdmin) {
    return { ok: false, error: 'supabaseAdmin absent', ...empty() };
  }
  const { data: pending, error: pendingError } = await supabaseAdmin
    .from('tcg_trades')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('proposer_id', userId)
    .eq('status', 'pending')
    .gt('expires_at', now.toISOString());
  if (pendingError) {
    return { ok: false, error: pendingError.message, ...empty() };
  }
  const pendingIds = ((pending ?? []) as Array<{ id: string }>).map(
    (r) => r.id
  );
  if (pendingIds.length === 0) return { ok: true, ...empty() };

  const { data: items, error: itemsError } = await supabaseAdmin
    .from('tcg_trade_items')
    .select(
      'subject_kind, card_user_id, card_team_id, card_map_slug, from_pack_id, from_position'
    )
    .in('trade_id', pendingIds)
    .eq('side', 'offered');
  if (itemsError) {
    return { ok: false, error: itemsError.message, ...empty() };
  }
  return {
    ok: true,
    ...summarizeEngagedItems((items ?? []) as EngagedItemRow[]),
  };
}
