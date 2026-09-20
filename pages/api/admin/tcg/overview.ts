// pages/api/admin/tcg/overview.ts
//
// GET : l'état de l'économie du TCG, en un appel.
//
// POURQUOI CET ENDPOINT EXISTE. Le seul écran TCG côté staff est la file de
// modération des photos (`photos.ts`) : on sait ce qu'il reste à relire, on ne
// sait rien de ce qui circule. Combien de paquets dorment sans être ouverts ?
// Combien de pièces sont en circulation ? Les légendaires sortent-elles au taux
// attendu ? Une économie fermée (gagner → ouvrir → recycler → racheter) dérive
// sans prévenir, et sans mesure la dérive ne se voit qu'une fois installée.
//
// LES NOMS DE CLÉS SONT UN CONTRAT, PAS UN GOÛT.
// `components/admin/tcg/TcgOverviewPanel.tsx` et son test épinglent exactement
// cette forme, clé pour clé. Sa normalisation est DÉFENSIVE : une clé renommée
// ici n'y produirait ni exception ni log, seulement des « — » partout — le mode
// de panne le plus silencieux possible pour un tableau de bord. Renommer une
// sortie de cet endpoint impose donc de toucher les deux fichiers en même
// temps ; `tests/unit/adminTcgOverview.test.ts` fait passer la vraie réponse
// dans la vraie normalisation pour que l'oubli échoue au lieu de se voir en
// production.
//
// TOUT EST AGRÉGÉ CÔTÉ SERVEUR. Aucune ligne de détail ne sort d'ici : le
// panneau reçoit des nombres. Renvoyer les paquets ou les écritures pour les
// compter dans le navigateur ferait transiter des milliers de lignes à chaque
// ouverture d'onglet, et exposerait qui possède quoi sans raison.
//
// `null` N'EST PAS `0`, et c'est le cœur de la convention retenue ici (la même
// que `overview-summary.ts`, et celle que le panneau applique à l'affichage) :
// `0` veut dire « mesuré, et vide », `null` veut dire « pas mesurable
// maintenant ». Confondre les deux ferait lire une panne de lecture comme un
// effondrement de l'économie — exactement le genre de faux signal qu'un tableau
// de bord ne doit pas produire. Une lecture en échec dégrade donc SA clé, et le
// reste de la réponse part quand même en 200.
//
// LES CARTES N'ONT PAS DE `tenant_id`. `tcg_pack_cards` est cadrée par son
// paquet (`pack_id`), pas par le tenant : compter les cartes d'un tenant exige
// de passer par les identifiants de SES paquets. C'est la subtilité de cette
// table — un `.select()` direct sur `tcg_pack_cards` compterait les cartes de
// tous les tenants sans que rien ne le signale.
//
// UNE CARTE RECYCLÉE N'EST PLUS POSSÉDÉE, MAIS ELLE A EXISTÉ. `recycled_at`
// marque la revente sans supprimer la ligne (cf. `tcg_recycle_duplicates.sql`).
// D'où trois nombres et non un : `total` = ce qui est encore possédé (c'est
// aussi ce qui rend `foil / total` juste côté panneau), `drawn` = tout ce qui a
// jamais été tiré, `recycled` = ce qui a été revendu. La répartition par rareté
// et les sujets du palmarès ne comptent QUE les cartes possédées — sinon on
// compterait comme possédée une carte déjà vendue. `recycled` est l'indicateur
// le plus direct d'une dérive de la boucle économique : si les joueuses
// recyclent massivement, c'est là qu'on le voit d'abord.
//
// UN REFUS N'EST PAS UN RETRAIT, d'où deux compteurs de photos distincts.
// `rejected` = la modération a écarté un cliché ; `revoked` = la joueuse a
// repris son accord. Les additionner accuserait l'une ou l'autre à tort.
//
// SOMMES BORNÉES, ET DITES COMME TELLES. PostgREST ne sait pas faire `SUM()`
// sans RPC : les totaux de pièces se calculent en lisant les lignes. Ces
// lectures sont donc plafonnées, et un plafond atteint lève `truncated` plutôt
// que de laisser passer un total tronqué pour un total exact. Un chiffre faux
// présenté comme sûr est pire que pas de chiffre.

import type { NextApiRequest, NextApiResponse } from 'next';

import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { formatZodError } from '@/utils/validation';
import { BOOSTER_PRICE_COINS } from '@/utils/tcg/economy';
import { RARITY_ORDER, type TcgRarity } from '@/utils/tcg/rarity';
import {
  readPlayerFaces,
  readTeamFaces,
  readFanartFaces,
} from '@/utils/tcg/readCardFaces';
import {
  gameMascotDisplayName,
  gameMascotUrl,
  type GameMascotSlug,
} from '@/utils/tcg/gameMascots';
import { readMapFaces } from '@/utils/tcg/readMapFaces';
import { cardSubjectKey } from '@/utils/tcg/subjectKey';
import { logger } from '@/utils/logger';
import { querySchema } from '@/lib/apiContracts/admin/tcg/overview.query';

/* -------------------------------------------------------------------------- */
/* Bornes                                                                      */
/* -------------------------------------------------------------------------- */

// Plafonds des lectures de détail. Dimensionnés très au-dessus du volume actuel
// (quelques paquets par victoire, une poignée de tournois par saison) : ils
// n'existent pas pour tronquer le cas normal, mais pour qu'un cas anormal ne
// tire pas la table entière en mémoire.
const MAX_PACKS = 5000;
const MAX_CARDS = 20000;
const MAX_WALLETS = 2000;
const MAX_ENTRIES = 10000;

/* -------------------------------------------------------------------------- */
/* Forme de la réponse                                                         */
/* -------------------------------------------------------------------------- */

type Count = number | null;

/**
 * Un sujet du palmarès.
 *
 * L'identifiant est nommé SELON LA NATURE (`userId` / `teamId`) : c'est ce que
 * lit le panneau, et c'est ce qui lui permet de construire un lien honnête. Une
 * équipe porte en plus son `slug` — son uuid ne route nulle part, l'erreur que
 * `TcgCard` a déjà payée d'un 404 sur chaque carte d'équipe.
 */
export type TcgTopSubject =
  | {
      kind: 'player';
      userId: string;
      name: string | null;
      imageUrl: string | null;
      /** Exemplaires ENCORE possédés (les recyclés sont exclus). */
      count: number;
      /** Dont brillants — un foil reste un exemplaire, pas une carte de plus. */
      foilCount: number;
    }
  | {
      kind: 'team';
      teamId: string;
      slug: string | null;
      name: string | null;
      imageUrl: string | null;
      count: number;
      foilCount: number;
    }
  | {
      kind: 'map';
      /** Le slug EST l'identifiant : les maps vivent dans un registre, pas en base. */
      slug: string;
      name: string | null;
      imageUrl: string | null;
      count: number;
      foilCount: number;
    }
  | {
      kind: 'fanart';
      fanartId: string;
      /** Le TITRE de l'œuvre ; le crédit n'est pas montré dans ce panneau. */
      name: string | null;
      imageUrl: string | null;
      count: number;
      foilCount: number;
    }
  | {
      /** Comme les maps : le slug est l'identifiant, le registre la source. */
      kind: 'mascot';
      slug: string;
      name: string | null;
      imageUrl: string | null;
      count: number;
      foilCount: number;
    };

export type TcgOverview = {
  packs: {
    /** Paquets distribués, toutes origines confondues. */
    granted: Count;
    opened: Count;
    /** Distribués mais jamais ouverts. */
    pending: Count;
    bySource: {
      victory: Count;
      purchase: Count;
      welcome: Count;
      /** Drop Twitch en direct. */
      drop: Count;
      /** Palmarès de fin de tournoi. */
      placement: Count;
      /** Série de check-ins. */
      streak: Count;
    };
  };
  coins: {
    /** Somme des soldes : ce qui est détenu, donc dépensable demain. */
    inCirculation: Count;
    /** Cumul des crédits du registre. */
    earned: Count;
    /**
     * `earned` VENTILÉ par origine (`source_kind` brut), crédits seulement.
     *
     * POURQUOI CETTE CLÉ EXISTE. `earned` seul répond « combien », jamais
     * « d'où ». Or surveiller une économie qui « dérive sans prévenir » — les
     * termes de l'en-tête — c'est justement savoir si les pièces viennent des
     * matchs, des drops en direct ou d'un cadeau d'accueil. Les paquets se
     * ventilaient déjà ; la monnaie, non, et c'est là que le drop était
     * invisible (il ne crée aucun paquet).
     *
     * `null` = registre non lisible, cohérent avec `earned`. `{}` = lu et sans
     * aucun crédit. Les clés sont les `source_kind` RÉELLEMENT présents : on
     * n'invente pas une ligne à zéro pour une origine jamais utilisée.
     *
     * Hérite du plafond de `truncated` : la somme est minorée, jamais majorée.
     */
    earnedBySource: Record<string, number> | null;
    /** Cumul des débits, en valeur absolue. */
    spent: Count;
    /** Porte-monnaie non vides. */
    wallets: Count;
    /** Rappelé ici pour que le panneau n'ait pas à recopier le barème. */
    boosterPrice: number;
    truncated: boolean;
  };
  cards: {
    /** Cartes ENCORE possédées (recyclées exclues). */
    total: Count;
    /** Brillantes parmi les cartes encore possédées. */
    foil: Count;
    /** Répartition des cartes encore possédées. */
    byRarity: Record<TcgRarity, Count>;
    /** Revendues contre des pièces : la boucle économique en action. */
    recycled: Count;
    /** Toutes les cartes jamais tirées, recyclées comprises. */
    drawn: Count;
    truncated: boolean;
  };
  photos: {
    pending: Count;
    approved: Count;
    /** Clichés écartés par la modération. */
    rejected: Count;
    /** Accords en cours (opt-in non révoqué). */
    optedIn: Count;
    /** Accords RETIRÉS — un retrait n'est pas un refus. */
    revoked: Count;
  };
  topSubjects: TcgTopSubject[];
  generatedAt: string;
};

type ApiResponse = TcgOverview | { error: string; code?: string };

/* -------------------------------------------------------------------------- */
/* Entrée                                                                      */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */

/**
 * Résout un `count`-only en `number | null`.
 *
 * Trois façons d'échouer, une seule valeur de sortie : promesse rejetée, erreur
 * PostgREST, ou `count` absent. Les deux premières valent `null` (inconnu) ; la
 * troisième vaut `0`, parce qu'un ensemble vide est une réponse, pas une panne.
 */
function resolveCount(
  result: PromiseSettledResult<{ count: number | null; error: unknown }>,
  label: string
): Count {
  if (result.status !== 'fulfilled') {
    logger.error('[admin/tcg/overview] %s rejeté: %o', label, result.reason);
    return null;
  }
  if (result.value.error) {
    logger.error(
      '[admin/tcg/overview] %s en erreur: %o',
      label,
      result.value.error
    );
    return null;
  }
  return result.value.count ?? 0;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service indisponible.' });
  }

  // Plus bas que la file de modération (60/min) : cet agrégat lit davantage, et
  // un tableau de bord se consulte, il ne se sonde pas en boucle.
  if (
    applyRateLimit(
      req,
      res,
      { max: 30, windowMs: 60_000 },
      'admin-tcg-overview'
    )
  ) {
    return;
  }

  const parsed = querySchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: formatZodError(parsed.error), code: 'INVALID_QUERY' });
  }
  const { top: topLimit } = parsed.data;

  const tenantId = ctx.tenantId;
  const db = supabaseAdmin;

  /* ---------------------------------------------------------------------- */
  /* 1) Les comptages exacts, en `head: true` — aucune ligne transférée      */
  /* ---------------------------------------------------------------------- */

  // `pending` et `purchase` sont comptés, pas déduits d'une soustraction : une
  // clé en échec vaut `null`, et `null - null` produirait un nombre inventé.
  const [
    packsGrantedR,
    packsOpenedR,
    packsPendingR,
    packsVictoryR,
    packsPurchaseR,
    packsWelcomeR,
    packsDropR,
    packsPlacementR,
    packsStreakR,
    photosPendingR,
    photosApprovedR,
    photosRejectedR,
    photosOptedInR,
    photosRevokedR,
    walletsR,
  ] = await Promise.allSettled([
    // `trade` exclu des deux compteurs : un paquet d'échange recueille des
    // cartes DÉJÀ distribuées (`tcg_card_trades.sql`), il ne sort d'aucune
    // victoire ni d'aucun achat. Ses cartes, elles, restent comptées une fois —
    // la ligne a changé de paquet, elle n'a pas été recopiée.
    db
      .from('tcg_packs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .neq('source_kind', 'trade'),
    db
      .from('tcg_packs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .not('opened_at', 'is', null)
      .neq('source_kind', 'trade'),
    db
      .from('tcg_packs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('opened_at', null),
    db
      .from('tcg_packs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('source_kind', 'victory'),
    db
      .from('tcg_packs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('source_kind', 'purchase'),
    // Cadeau d'accueil d'une édition. COMPTÉ, pas déduit de
    // `granted - victory - purchase` : la convention `null` ≠ `0` de ce fichier
    // interdit l'arithmétique entre compteurs, puisqu'une clé en échec vaut
    // `null` et qu'une soustraction produirait un nombre inventé. C'est la même
    // raison qui fait compter `pending` au lieu de le déduire.
    db
      .from('tcg_packs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('source_kind', 'welcome'),
    // Les trois origines sans match (migration
    // `tcg_earn_sources_drop_streak_placement.sql`), comptées une à une pour la
    // même raison : aucune arithmétique entre compteurs. Écrites en toutes
    // lettres, pas en `.map` étalé : `Promise.allSettled` perdrait le typage
    // positionnel du tuple déstructuré plus haut.
    db
      .from('tcg_packs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('source_kind', 'drop'),
    db
      .from('tcg_packs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('source_kind', 'placement'),
    db
      .from('tcg_packs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('source_kind', 'streak'),

    // La file de relecture : le même filtre que `photos.ts`, pour que le
    // compteur du tableau de bord et la file affichée ne se contredisent pas.
    db
      .from('tcg_player_cards')
      .select('user_id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('photo_status', 'pending'),
    db
      .from('tcg_player_cards')
      .select('user_id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('photo_status', 'approved'),
    db
      .from('tcg_player_cards')
      .select('user_id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('photo_status', 'rejected'),
    // Accord DONNÉ et TOUJOURS VALIDE : les deux conditions sont
    // indépendantes, et une seule des deux compterait des retraits comme des
    // accords en cours.
    db
      .from('tcg_player_cards')
      .select('user_id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .not('opted_in_at', 'is', null)
      .is('revoked_at', null),
    db
      .from('tcg_player_cards')
      .select('user_id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .not('revoked_at', 'is', null),

    // Porte-monnaie non vides : un solde à zéro est un compte, pas un
    // détenteur de pièces.
    db
      .from('tcg_wallets')
      .select('user_id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gt('balance', 0),
  ]);

  /* ---------------------------------------------------------------------- */
  /* 2) Les sommes — bornées, faute de SUM() sans RPC                        */
  /* ---------------------------------------------------------------------- */

  const [packIdsR, balancesR, entriesR] = await Promise.allSettled([
    // Les identifiants des paquets OUVERTS du tenant : indispensables pour
    // cadrer les cartes (cf. l'en-tête — `tcg_pack_cards` ignore le tenant).
    // Un paquet scellé ne contient encore rien, ses cartes n'existent qu'à
    // l'ouverture.
    db
      .from('tcg_packs')
      .select('id')
      .eq('tenant_id', tenantId)
      .not('opened_at', 'is', null)
      .limit(MAX_PACKS),
    db
      .from('tcg_wallets')
      .select('balance')
      .eq('tenant_id', tenantId)
      .limit(MAX_WALLETS),
    db
      // `source_kind` en plus de `amount` : la ventilation des crédits se fait
      // dans la boucle qui suit, sans requête supplémentaire.
      .from('tcg_wallet_entries')
      .select('amount, source_kind')
      .eq('tenant_id', tenantId)
      .limit(MAX_ENTRIES),
  ]);

  // -- Pièces --------------------------------------------------------------

  const balanceRows = rowsOf<{ balance: number | null }>(balancesR, 'balances');
  const entryRows = rowsOf<{ amount: number | null; source_kind?: unknown }>(
    entriesR,
    'entries'
  );

  const inCirculation =
    balanceRows === null
      ? null
      : balanceRows.reduce((sum, w) => sum + toInt(w.balance), 0);

  let earned: Count = null;
  let spent: Count = null;
  // `null` tant que le registre n'est pas lisible — même convention que
  // `earned`, pour qu'une panne de lecture ne se lise pas comme une économie
  // sans aucun gain.
  let earnedBySource: Record<string, number> | null = null;
  if (entryRows !== null) {
    earned = 0;
    spent = 0;
    earnedBySource = {};
    for (const entry of entryRows) {
      const amount = toInt(entry.amount);
      // Le registre est signé : crédit > 0, débit < 0. `spent` est rendu en
      // valeur ABSOLUE — un tableau de bord qui affiche « -4 200 dépensées »
      // se lit deux fois avant d'être compris, et le panneau écarte de toute
      // façon les compteurs négatifs.
      if (amount > 0) {
        earned += amount;
        // Ventilation des CRÉDITS seulement : un débit a déjà sa place dans
        // `spent`, et le mêler aux origines de gain ferait apparaître l'achat
        // de booster comme une façon d'obtenir des pièces.
        //
        // Une origine illisible ou absente est rangée sous `unknown` plutôt
        // qu'écartée : le total ventilé doit rester égal à `earned`, sinon
        // l'écart passerait pour une perte.
        const kind =
          typeof entry.source_kind === 'string' && entry.source_kind.trim()
            ? entry.source_kind
            : 'unknown';
        earnedBySource[kind] = (earnedBySource[kind] ?? 0) + amount;
      } else spent += -amount;
    }
  }

  const coinsTruncated =
    (balanceRows?.length ?? 0) >= MAX_WALLETS ||
    (entryRows?.length ?? 0) >= MAX_ENTRIES;

  // -- Cartes --------------------------------------------------------------

  const packIdRows = rowsOf<{ id: string }>(packIdsR, 'packIds');
  const packIds = (packIdRows ?? []).map((p) => p.id);

  const rarityCounts = emptyRarityCounts();
  let cardsOwned: Count = packIdRows === null ? null : 0;
  let cardsDrawn: Count = packIdRows === null ? null : 0;
  let cardsRecycled: Count = packIdRows === null ? null : 0;
  let cardsFoil: Count = packIdRows === null ? null : 0;
  let cardsTruncated = (packIdRows?.length ?? 0) >= MAX_PACKS;

  const bySubject = new Map<
    string,
    {
      kind: 'player' | 'team' | 'map' | 'fanart' | 'mascot';
      subjectId: string;
      count: number;
      foilCount: number;
    }
  >();

  if (packIds.length > 0) {
    // Les cartes recyclées ne sont PAS filtrées ici : la même lecture sert à
    // les compter à part. Filtrer en SQL obligerait à une seconde requête pour
    // obtenir un chiffre qu'on a déjà sous la main.
    const { data, error } = await db
      .from('tcg_pack_cards')
      .select(
        'pack_id, subject_kind, card_user_id, card_team_id, card_map_slug, card_fanart_id, card_mascot_slug, rarity, is_foil, recycled_at'
      )
      .in('pack_id', packIds)
      .limit(MAX_CARDS);

    if (error) {
      logger.error('[admin/tcg/overview] cartes illisibles: %s', error.message);
      cardsOwned = null;
      cardsDrawn = null;
      cardsRecycled = null;
      cardsFoil = null;
      for (const rarity of RARITY_ORDER) rarityCounts[rarity] = null;
    } else {
      const cardRows = (data ?? []) as Array<{
        subject_kind: 'player' | 'team' | 'map' | 'fanart' | 'mascot';
        card_user_id: string | null;
        card_team_id: string | null;
        card_map_slug: string | null;
        card_fanart_id: string | null;
        card_mascot_slug: string | null;
        rarity: TcgRarity;
        is_foil: boolean | null;
        recycled_at: string | null;
      }>;
      if (cardRows.length >= MAX_CARDS) cardsTruncated = true;

      cardsDrawn = cardRows.length;
      cardsOwned = 0;
      cardsRecycled = 0;
      cardsFoil = 0;

      for (const row of cardRows) {
        if (row.recycled_at) {
          cardsRecycled += 1;
          // Une carte revendue ne compte ni dans la répartition par rareté, ni
          // parmi les sujets distribués : elle n'appartient plus à personne.
          continue;
        }
        cardsOwned += 1;
        if (row.is_foil) cardsFoil += 1;

        const current = rarityCounts[row.rarity];
        // Une rareté hors barème serait une corruption : on l'ignore plutôt que
        // d'inventer une cinquième catégorie dans la réponse.
        if (typeof current === 'number') rarityCounts[row.rarity] = current + 1;

        // Le CHECK du schéma garantit exactement un sujet ; une ligne sans
        // sujet est une corruption, pas une carte à compter.
        const key = cardSubjectKey(row);
        if (!key) continue;
        const subjectId = key.slice(key.indexOf(':') + 1);

        const agg = bySubject.get(key);
        if (agg) {
          agg.count += 1;
          if (row.is_foil) agg.foilCount += 1;
        } else {
          bySubject.set(key, {
            kind: row.subject_kind,
            subjectId,
            count: 1,
            foilCount: row.is_foil ? 1 : 0,
          });
        }
      }
    }
  }

  /* ---------------------------------------------------------------------- */
  /* 3) Les sujets les plus distribués, nommés                               */
  /* ---------------------------------------------------------------------- */

  const ranked = [...bySubject.values()]
    .sort((a, b) => b.count - a.count || a.subjectId.localeCompare(b.subjectId))
    .slice(0, topLimit);

  // Les faces sont relues par `readCardFaces`, jamais reconstruites ici : c'est
  // ce module qui porte le filtre de consentement (photo approuvée ET accord
  // non retiré). Lire `tcg_player_cards` en direct pour gagner une requête
  // contournerait ce filtre, et le panneau staff afficherait des photos que le
  // site public n'a plus le droit de montrer.
  const [playerFaces, teamFaces, mapFaces, fanartFaces] = await Promise.all([
    readPlayerFaces(
      tenantId,
      ranked.filter((s) => s.kind === 'player').map((s) => s.subjectId)
    ),
    readTeamFaces(
      tenantId,
      ranked.filter((s) => s.kind === 'team').map((s) => s.subjectId)
    ),
    // Sans `tenantId` : les maps sont un registre commun, pas des données de
    // tenant. Rien à filtrer non plus — une maquette n'est pas une photo.
    readMapFaces(
      ranked.filter((s) => s.kind === 'map').map((s) => s.subjectId)
    ),
    readFanartFaces(
      tenantId,
      ranked.filter((s) => s.kind === 'fanart').map((s) => s.subjectId)
    ),
  ]);

  const topSubjects: TcgTopSubject[] = ranked.map((subject) => {
    if (subject.kind === 'map') {
      const face = mapFaces.get(subject.subjectId);
      return {
        kind: 'map' as const,
        slug: subject.subjectId,
        name: face?.name ?? null,
        imageUrl: face?.imageUrl ?? null,
        count: subject.count,
        foilCount: subject.foilCount,
      };
    }
    if (subject.kind === 'player') {
      const face = playerFaces.get(subject.subjectId);
      return {
        kind: 'player' as const,
        userId: subject.subjectId,
        name: face?.displayName ?? null,
        imageUrl: face?.imageUrl ?? null,
        count: subject.count,
        foilCount: subject.foilCount,
      };
    }
    if (subject.kind === 'fanart') {
      const face = fanartFaces.get(subject.subjectId);
      return {
        kind: 'fanart' as const,
        fanartId: subject.subjectId,
        name: face?.title ?? null,
        imageUrl: face?.imageUrl ?? null,
        count: subject.count,
        foilCount: subject.foilCount,
      };
    }
    if (subject.kind === 'mascot') {
      // Une mascotte n'a rien à lire : son nom vient du registre, sa figurine
      // est une route, pas un fichier stocké.
      return {
        kind: 'mascot' as const,
        slug: subject.subjectId,
        name: gameMascotDisplayName(subject.subjectId),
        imageUrl: gameMascotUrl(subject.subjectId as GameMascotSlug),
        count: subject.count,
        foilCount: subject.foilCount,
      };
    }
    const face = teamFaces.get(subject.subjectId);
    return {
      kind: 'team' as const,
      teamId: subject.subjectId,
      slug: face?.slug ?? null,
      name: face?.name ?? null,
      // L'overview n'affiche qu'une vignette : illustration si elle existe,
      // logo sinon. Pas de cadrage à décider ici, donc pas de second champ.
      imageUrl: face?.cardImageUrl ?? face?.logoUrl ?? null,
      count: subject.count,
      foilCount: subject.foilCount,
    };
  });

  /* ---------------------------------------------------------------------- */

  const overview: TcgOverview = {
    packs: {
      granted: resolveCount(packsGrantedR, 'packs.granted'),
      opened: resolveCount(packsOpenedR, 'packs.opened'),
      pending: resolveCount(packsPendingR, 'packs.pending'),
      bySource: {
        victory: resolveCount(packsVictoryR, 'packs.victory'),
        purchase: resolveCount(packsPurchaseR, 'packs.purchase'),
        welcome: resolveCount(packsWelcomeR, 'packs.welcome'),
        drop: resolveCount(packsDropR, 'packs.drop'),
        placement: resolveCount(packsPlacementR, 'packs.placement'),
        streak: resolveCount(packsStreakR, 'packs.streak'),
      },
    },
    coins: {
      inCirculation,
      earned,
      earnedBySource,
      spent,
      wallets: resolveCount(walletsR, 'coins.wallets'),
      boosterPrice: BOOSTER_PRICE_COINS,
      truncated: coinsTruncated,
    },
    cards: {
      total: cardsOwned,
      foil: cardsFoil,
      byRarity: rarityCounts,
      recycled: cardsRecycled,
      drawn: cardsDrawn,
      truncated: cardsTruncated,
    },
    photos: {
      pending: resolveCount(photosPendingR, 'photos.pending'),
      approved: resolveCount(photosApprovedR, 'photos.approved'),
      rejected: resolveCount(photosRejectedR, 'photos.rejected'),
      optedIn: resolveCount(photosOptedInR, 'photos.optedIn'),
      revoked: resolveCount(photosRevokedR, 'photos.revoked'),
    },
    topSubjects,
    generatedAt: new Date().toISOString(),
  };

  // 30 s : assez pour absorber un aller-retour entre onglets du panneau, assez
  // peu pour qu'une relecture de photo se voie tout de suite dans le compteur.
  res.setHeader('Cache-Control', 'private, max-age=30');
  return res.status(200).json(overview);
}

/* -------------------------------------------------------------------------- */
/* Petits outils                                                               */
/* -------------------------------------------------------------------------- */

/** Répartition vide, dérivée du barème : jamais une liste de raretés recopiée. */
function emptyRarityCounts(): Record<TcgRarity, Count> {
  const counts = {} as Record<TcgRarity, Count>;
  for (const rarity of RARITY_ORDER) counts[rarity] = 0;
  return counts;
}

/**
 * Les lignes d'une lecture bornée, ou `null` si elle a échoué.
 *
 * `null` se propage jusqu'à la réponse : une somme calculée sur une lecture
 * ratée vaudrait `0`, et « 0 pièce en circulation » est une affirmation.
 */
function rowsOf<T>(
  result: PromiseSettledResult<{ data: unknown; error: unknown }>,
  label: string
): T[] | null {
  if (result.status !== 'fulfilled') {
    logger.error('[admin/tcg/overview] %s rejeté: %o', label, result.reason);
    return null;
  }
  if (result.value.error) {
    logger.error(
      '[admin/tcg/overview] %s en erreur: %o',
      label,
      result.value.error
    );
    return null;
  }
  return (result.value.data ?? []) as T[];
}

/** Une valeur non entière en base ne doit pas propager un NaN dans un total. */
function toInt(value: number | null | undefined): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.trunc(value)
    : 0;
}

// Même garde que la file de modération : `manage_tcg` est la permission
// qui ouvre déjà le panneau TCG du staff. La graduer plus haut (rôle `admin`)
// couperait la relectrice du contexte de ce qu'elle relit ; l'ouvrir plus bas
// exposerait qui possède quoi à des rôles qui n'ont rien à en faire.
export default withStaffRoute(handler, { permission: 'manage_tcg' });
