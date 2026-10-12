// utils/tcg/live.ts
//
// Le TCG « EN ACTION », côté public : trois blocs lus par
// `GET /api/public/tcg/live` et affichés par `components/tcg/live/`.
//
//   1. Les DERNIERS TIRAGES RARES — cartes rare / épique / légendaire sorties
//      d'un paquet OUVERT. Un échange n'est pas une ouverture : ses paquets
//      (`source_kind = 'trade'`) sont écartés.
//   2. Le CLASSEMENT DES COLLECTIONNEUSES — top 10 par taux de complétion,
//      calculé comme la barre de progression de la joueuse (cartes distinctes
//      possédées / vivier du tirage).
//   3. La CARTE DE LA SEMAINE — déterministe par semaine ISO.
//
// LE CONSENTEMENT : LA VITRINE, ET RIEN D'AUTRE.
//   Une collection est personnelle (docs/TCG.md §2.5) : le seul geste par
//   lequel une joueuse rend publique une part de son activité TCG est
//   d'ACTIVER sa vitrine (`tcg_showcases.enabled = true`, dans CET espace).
//   C'est donc la seule condition qui fait apparaître son nom ici.
//   - L'opt-in de DÉCOUVERTE (`player_discovery_profiles.discoverable`) n'en
//     est PAS un : il ouvre une carte de profil derrière connexion, « aucune
//     surface publique/SEO » (cf. sa migration). L'utiliser ici publierait
//     sous son nom ce qu'elle a accepté de montrer à des comptes connectés.
//   - Une joueuse RETIRÉE du TCG (`tcg_player_cards.excluded_at`) n'a plus de
//     nom, même vitrine activée : le nom passe par `readPlayerFaces`, qui
//     l'anonymise déjà partout ailleurs.
//   - Le texte de la vitrine (namespace `tcgShowcase`) le dit AVANT qu'on
//     l'active : un consentement qui couvre une surface non annoncée n'en
//     serait pas un.
//
// CE QUI NE SORT JAMAIS.
//   - Aucun identifiant de compte de la tireuse ou de la collectionneuse : un
//     nom consenti, ou rien. (Les cartes portent leur SUJET, comme partout.)
//   - Aucun horodatage : un âge en HEURES entières (« il y a 2 h »). Une heure
//     exacte, recoupée avec la fin d'un match, désignerait la joueuse qu'on
//     vient justement d'anonymiser.
//
// POURQUOI EXCLURE PLUTÔT QU'ANONYMISER AU CLASSEMENT. Un tirage anonyme reste
// une information (« une légendaire vient de sortir ») sans rien dire de
// personne. Une ligne de classement anonyme, elle, ne dit RIEN d'utile
// (« Une joueuse — 87 % ») et décrit pourtant une personne : son rang et sa
// progression sont stables d'un affichage à l'autre, donc recoupables, et le
// rang 1 deviendrait vite « celle dont tout le monde sait que c'est elle ». Un
// classement est une reconnaissance : sans consentement, pas de ligne.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { MASCOT_CARD_RARITY, MAP_CARD_RARITY, type TcgRarity } from './rarity';
import { readPlayerFaces } from './readCardFaces';
import { readDrawPool, readDrawPoolSizes } from './readDrawPool';
import { MAP_POOL_SLUGS } from './readMapFaces';
import { GAME_MASCOT_SLUGS } from './gameMascots';
import { readOwnedCardRows } from './readOwnedCards';
import { readTeamRarities } from './readTeamRarity';
import { cardSubjectKey, type CardSubjectRow } from './subjectKey';
import { POOL_LIMIT } from './drawPack';
import { DEFAULT_FANART_RARITY } from './fanart';
import {
  buildShowcaseCards,
  parseShowcaseKey,
  type ShowcaseCard,
  type ShowcaseSubject,
} from './showcase';

/* -------------------------------------------------------------------------
 * Bornes
 * ---------------------------------------------------------------------- */

/** Tirages rares montrés. */
export const RECENT_PULLS_LIMIT = 8;
/** Paquets ouverts relus pour les trouver (les plus récents). */
export const RECENT_PACKS_SCANNED = 60;
/** Lignes du classement. */
export const LEADERBOARD_SIZE = 10;
/**
 * Vitrines actives relues au plus pour le classement. Chacune coûte une lecture
 * de collection ; au-delà, on journalise au lieu de ralentir la route.
 */
export const MAX_COLLECTORS_SCANNED = 200;
/** Collections lues en parallèle. */
const COLLECTION_CONCURRENCY = 8;

const RARE_TIERS: readonly TcgRarity[] = ['rare', 'epic', 'legendary'];

/* -------------------------------------------------------------------------
 * Types de réponse
 * ---------------------------------------------------------------------- */

export type LivePull = {
  card: ShowcaseCard;
  /** Nom consenti (vitrine active), sinon `null` → « Une joueuse ». */
  collector: string | null;
  /** Âge du tirage en heures entières (0 = moins d'une heure). */
  ageHours: number;
};

export type LiveCollector = {
  rank: number;
  name: string;
  /** Cartes distinctes possédées. */
  owned: number;
  /** Taille du vivier (dénominateur). */
  total: number;
  /** Pourcentage arrondi au dixième, plafonné à 100. */
  completion: number;
};

export type LiveCardOfWeek = {
  /** `2026-W41`. */
  week: string;
  card: ShowcaseCard;
};

export type TcgLiveResponse = {
  recentPulls: LivePull[];
  collectors: LiveCollector[];
  cardOfWeek: LiveCardOfWeek | null;
};

/* -------------------------------------------------------------------------
 * Logique pure (testée seule)
 * ---------------------------------------------------------------------- */

/** Âge en heures entières, jamais négatif (horloges désaccordées). */
export function ageInHours(openedAt: string, now: Date): number {
  const ms = now.getTime() - Date.parse(openedAt);
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.floor(ms / 3_600_000);
}

/** Semaine ISO 8601 d'une date (en UTC) : `{ year, week }`. */
export function isoWeekOf(date: Date): { year: number; week: number } {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  // Le jeudi de la semaine décide de l'année ISO.
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

export function isoWeekLabel(w: { year: number; week: number }): string {
  return `${w.year}-W${String(w.week).padStart(2, '0')}`;
}

/** FNV-1a 32 bits : stable, sans dépendance, suffisant pour mélanger. */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * L'ORDRE de passage d'une année ISO : les clés triées par empreinte de
 * `année:clé`. Ne dépend que de l'ensemble des clés, pas de leur ordre de
 * lecture — une base qui renvoie les lignes autrement ne change pas la carte.
 */
function yearOrder(keys: readonly string[], year: number): string[] {
  return [...new Set(keys)]
    .map((key) => ({ key, h: fnv1a(`${year}:${key}`) }))
    .sort((a, b) => a.h - b.h || (a.key < b.key ? -1 : 1))
    .map((x) => x.key);
}

function rawPick(
  keys: readonly string[],
  w: { year: number; week: number }
): string | null {
  const order = yearOrder(keys, w.year);
  if (order.length === 0) return null;
  return order[(w.week - 1) % order.length];
}

/**
 * La carte de la semaine `w` parmi `keys`.
 *
 * PAS DE REDITE AVANT D'AVOIR TOUT MONTRÉ. Chaque année ISO a son ordre de
 * passage (mélange déterministe), et la semaine N prend la N-ième carte : sur
 * un vivier de 53 cartes ou plus, aucune ne revient dans l'année ; en dessous,
 * toutes passent avant la première redite.
 *
 * STABLE DANS LA SEMAINE. Seul un changement du vivier (une équipe ajoutée)
 * peut décaler l'ordre, et d'une place au plus.
 *
 * LA JOINTURE D'ANNÉE. Deux ordres indépendants peuvent faire se suivre la
 * même carte (dernière semaine de l'an passé, première de l'an neuf) : la
 * semaine 1 prend alors la suivante. `previous` = la semaine qui précède.
 */
export function pickWeeklyKey(
  keys: readonly string[],
  w: { year: number; week: number },
  previous: { year: number; week: number }
): string | null {
  const order = yearOrder(keys, w.year);
  if (order.length === 0) return null;
  const index = (w.week - 1) % order.length;
  const pick = order[index];
  if (w.week === 1 && order.length > 1 && previous.year !== w.year) {
    // La semaine précédente n'est jamais elle-même ajustée (ce n'est pas une
    // semaine 1) : son tirage brut est son tirage réel.
    if (rawPick(keys, previous) === pick) return order[index + 1];
  }
  return pick;
}

/**
 * Classe des collections. Pure : `rows` = une ligne par collectionneuse
 * CONSENTANTE déjà nommée. Tri : complétion, puis nombre de cartes, puis nom
 * (ordre stable d'un affichage à l'autre). Une collection vide n'est pas
 * classée.
 */
export function rankCollectors(
  rows: ReadonlyArray<{ name: string; owned: number }>,
  total: number,
  size = LEADERBOARD_SIZE
): LiveCollector[] {
  if (total <= 0) return [];
  return rows
    .filter((r) => r.owned > 0 && r.name.trim().length > 0)
    .map((r) => ({
      name: r.name,
      owned: r.owned,
      ratio: Math.min(1, r.owned / total),
    }))
    .sort(
      (a, b) =>
        b.ratio - a.ratio ||
        b.owned - a.owned ||
        a.name.localeCompare(b.name, 'fr')
    )
    .slice(0, size)
    .map((r, i) => ({
      rank: i + 1,
      name: r.name,
      owned: r.owned,
      total,
      completion: Math.round(r.ratio * 1000) / 10,
    }));
}

/* -------------------------------------------------------------------------
 * Lectures
 * ---------------------------------------------------------------------- */

/**
 * Parmi `userIds`, celles qui ont une vitrine ACTIVE dans cet espace.
 * `null` = lecture en échec : l'appelant n'affiche alors AUCUN nom.
 */
export async function readConsentingUserIds(
  tenantId: string,
  userIds: readonly string[]
): Promise<Set<string> | null> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Set();
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from('tcg_showcases')
    .select('user_id, enabled')
    .eq('tenant_id', tenantId)
    .eq('enabled', true)
    .in('user_id', ids);
  if (error) {
    logger.warn('[tcg/live] vitrines illisibles: %s', error.message);
    return null;
  }
  return new Set(
    ((data ?? []) as Array<{ user_id: string; enabled: unknown }>)
      // Revérifié : un opt-in ne se présume jamais.
      .filter((r) => r.enabled === true)
      .map((r) => r.user_id)
  );
}

/**
 * Les noms PUBLIABLES : vitrine active ET nom lisible par `readPlayerFaces`
 * (qui anonymise une joueuse retirée du TCG). Les autres sont absentes.
 */
export async function readConsentedNames(
  tenantId: string,
  userIds: readonly string[]
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const consenting = await readConsentingUserIds(tenantId, userIds);
  if (!consenting || consenting.size === 0) return names;
  const faces = await readPlayerFaces(tenantId, [...consenting]);
  for (const id of consenting) {
    const name = faces.get(id)?.displayName?.trim();
    if (name) names.set(id, name);
  }
  return names;
}

function subjectOfRow(row: CardSubjectRow): ShowcaseSubject | null {
  const key = cardSubjectKey(row);
  return key ? parseShowcaseKey(key) : null;
}

type PackRow = { id: string; user_id: string; opened_at: string };
type PullRow = CardSubjectRow & {
  pack_id: string;
  position: number;
  rarity: TcgRarity;
  is_foil: boolean | null;
};

/** Les derniers tirages rares de l'espace. `[]` sur échec. */
export async function readRecentRarePulls(
  tenantId: string,
  now: Date = new Date(),
  limit = RECENT_PULLS_LIMIT
): Promise<LivePull[]> {
  if (!supabaseAdmin) return [];
  const { data: packData, error: packErr } = await supabaseAdmin
    .from('tcg_packs')
    .select('id, user_id, opened_at')
    .eq('tenant_id', tenantId)
    .not('opened_at', 'is', null)
    // Un échange n'est pas une ouverture : la carte a déjà été tirée.
    .neq('source_kind', 'trade')
    .order('opened_at', { ascending: false })
    .limit(RECENT_PACKS_SCANNED);
  if (packErr) {
    logger.warn('[tcg/live] paquets illisibles: %s', packErr.message);
    return [];
  }
  const packs = ((packData ?? []) as PackRow[]).filter((p) => p.opened_at);
  if (packs.length === 0) return [];
  const packById = new Map(packs.map((p) => [p.id, p]));

  const { data: cardData, error: cardErr } = await supabaseAdmin
    .from('tcg_pack_cards')
    .select(
      'pack_id, position, subject_kind, card_user_id, card_team_id, card_map_slug, card_fanart_id, card_mascot_slug, rarity, is_foil'
    )
    .in(
      'pack_id',
      packs.map((p) => p.id)
    )
    .in('rarity', [...RARE_TIERS]);
  if (cardErr) {
    logger.warn('[tcg/live] cartes illisibles: %s', cardErr.message);
    return [];
  }

  const picked = ((cardData ?? []) as PullRow[])
    .filter((c) => RARE_TIERS.includes(c.rarity) && packById.has(c.pack_id))
    .map((c) => ({ row: c, pack: packById.get(c.pack_id) as PackRow }))
    .sort(
      (a, b) =>
        Date.parse(b.pack.opened_at) - Date.parse(a.pack.opened_at) ||
        (a.pack.id < b.pack.id ? -1 : a.pack.id > b.pack.id ? 1 : 0) ||
        a.row.position - b.row.position
    )
    .map((x) => ({ ...x, subject: subjectOfRow(x.row) }))
    .filter(
      (x): x is typeof x & { subject: ShowcaseSubject } => x.subject !== null
    )
    .slice(0, limit);
  if (picked.length === 0) return [];

  const [cards, names] = await Promise.all([
    buildShowcaseCards(
      tenantId,
      picked.map((x) => ({
        subject: x.subject,
        rarity: x.row.rarity,
        isFoil: Boolean(x.row.is_foil),
      }))
    ),
    readConsentedNames(
      tenantId,
      picked.map((x) => x.pack.user_id)
    ),
  ]);

  return picked.map((x, i) => ({
    card: cards[i],
    collector: names.get(x.pack.user_id) ?? null,
    ageHours: ageInHours(x.pack.opened_at, now),
  }));
}

/**
 * Le dénominateur de la complétion — LE MÊME que la barre de progression de
 * la joueuse (`features/player/tcg/service/collection.ts`) : vivier du tirage,
 * cinq types, chacun plafonné à `POOL_LIMIT`. `null` si illisible.
 */
export async function readPoolTotal(tenantId: string): Promise<number | null> {
  const sizes = await readDrawPoolSizes(tenantId);
  if (!sizes.ok) return null;
  return (
    Math.min(sizes.value.players, POOL_LIMIT) +
    Math.min(sizes.value.teams, POOL_LIMIT) +
    Math.min(sizes.value.fanarts, POOL_LIMIT) +
    Math.min(MAP_POOL_SLUGS.length, POOL_LIMIT) +
    Math.min(GAME_MASCOT_SLUGS.length, POOL_LIMIT)
  );
}

/** Le top des collectionneuses CONSENTANTES de l'espace. `[]` sur échec. */
export async function readCollectorsLeaderboard(
  tenantId: string
): Promise<LiveCollector[]> {
  if (!supabaseAdmin) return [];
  const { data, error } = await supabaseAdmin
    .from('tcg_showcases')
    .select('user_id, enabled')
    .eq('tenant_id', tenantId)
    .eq('enabled', true)
    .order('user_id', { ascending: true })
    .limit(MAX_COLLECTORS_SCANNED + 1);
  if (error) {
    logger.warn('[tcg/live] vitrines illisibles: %s', error.message);
    return [];
  }
  const rows = ((data ?? []) as Array<{ user_id: string; enabled: unknown }>)
    .filter((r) => r.enabled === true)
    .map((r) => r.user_id);
  if (rows.length > MAX_COLLECTORS_SCANNED) {
    logger.warn(
      '[tcg/live] plus de %d vitrines actives : classement partiel',
      MAX_COLLECTORS_SCANNED
    );
  }
  const userIds = rows.slice(0, MAX_COLLECTORS_SCANNED);
  if (userIds.length === 0) return [];

  const [total, names] = await Promise.all([
    readPoolTotal(tenantId),
    readConsentedNames(tenantId, userIds),
  ]);
  if (total === null) return [];

  const named = userIds.filter((id) => names.has(id));
  const counted: Array<{ name: string; owned: number }> = [];
  for (let i = 0; i < named.length; i += COLLECTION_CONCURRENCY) {
    const batch = named.slice(i, i + COLLECTION_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (userId) => {
        const owned = await readOwnedCardRows(tenantId, userId);
        // Une collection illisible ou tronquée n'est pas classée : un rang
        // faux est pire qu'une absence.
        if (!owned.ok || owned.truncated) return null;
        const keys = new Set<string>();
        for (const row of owned.value) {
          const key = cardSubjectKey(row);
          if (key) keys.add(key);
        }
        return { name: names.get(userId) as string, owned: keys.size };
      })
    );
    for (const r of results) if (r) counted.push(r);
  }
  return rankCollectors(counted, total);
}

/**
 * Les cartes ÉLIGIBLES à la carte de la semaine : équipes, maps, fan arts
 * approuvées, mascottes — tout le vivier SAUF les cartes de joueuses.
 *
 * Pourquoi pas les joueuses : la mise en avant d'une personne réelle, une
 * semaine entière en tête de la page publique, n'est couverte par aucun de ses
 * consentements (être dans les paquets n'est pas être affichée en une).
 */
async function readWeeklyCandidates(
  tenantId: string
): Promise<string[] | null> {
  const pool = await readDrawPool(tenantId);
  if (!pool.ok) return null;
  return [
    ...pool.value.teamIds.slice(0, POOL_LIMIT).map((id) => `team:${id}`),
    ...MAP_POOL_SLUGS.map((slug) => `map:${slug}`),
    ...pool.value.fanartIds.slice(0, POOL_LIMIT).map((id) => `fanart:${id}`),
    ...GAME_MASCOT_SLUGS.map((slug) => `mascot:${slug}`),
  ];
}

async function readSubjectRarity(
  tenantId: string,
  subject: ShowcaseSubject
): Promise<TcgRarity> {
  if (subject.kind === 'team') {
    const map = await readTeamRarities(tenantId, [subject.id]);
    return map.get(subject.id) ?? 'common';
  }
  if (subject.kind === 'map') return MAP_CARD_RARITY;
  if (subject.kind === 'mascot') return MASCOT_CARD_RARITY;
  if (subject.kind === 'fanart' && supabaseAdmin) {
    const { data } = await supabaseAdmin
      .from('tcg_fanart_cards')
      .select('rarity')
      .eq('tenant_id', tenantId)
      .eq('id', subject.id)
      .maybeSingle();
    const rarity = (data as { rarity?: unknown } | null)?.rarity;
    if (
      rarity === 'common' ||
      rarity === 'rare' ||
      rarity === 'epic' ||
      rarity === 'legendary'
    ) {
      return rarity;
    }
    return DEFAULT_FANART_RARITY;
  }
  return 'common';
}

/** La carte de la semaine ISO de `now`. `null` sur échec ou vivier vide. */
export async function readCardOfWeek(
  tenantId: string,
  now: Date = new Date()
): Promise<LiveCardOfWeek | null> {
  const candidates = await readWeeklyCandidates(tenantId);
  if (!candidates || candidates.length === 0) return null;
  const week = isoWeekOf(now);
  const previous = isoWeekOf(new Date(now.getTime() - 7 * 86_400_000));
  const key = pickWeeklyKey(candidates, week, previous);
  const subject = key ? parseShowcaseKey(key) : null;
  if (!subject) return null;
  const rarity = await readSubjectRarity(tenantId, subject);
  const [card] = await buildShowcaseCards(tenantId, [
    { subject, rarity, isFoil: false },
  ]);
  if (!card) return null;
  return { week: isoWeekLabel(week), card };
}

/**
 * Les trois blocs. Chacun échoue SEUL : une lecture en panne vide son bloc,
 * jamais la réponse entière.
 */
export async function readTcgLive(
  tenantId: string,
  now: Date = new Date()
): Promise<TcgLiveResponse> {
  const settle = async <T>(p: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await p;
    } catch (err) {
      logger.warn(
        '[tcg/live] bloc indisponible: %s',
        err instanceof Error ? err.message : String(err)
      );
      return fallback;
    }
  };
  const [recentPulls, collectors, cardOfWeek] = await Promise.all([
    settle(readRecentRarePulls(tenantId, now), [] as LivePull[]),
    settle(readCollectorsLeaderboard(tenantId), [] as LiveCollector[]),
    settle(readCardOfWeek(tenantId, now), null as LiveCardOfWeek | null),
  ]);
  return { recentPulls, collectors, cardOfWeek };
}
