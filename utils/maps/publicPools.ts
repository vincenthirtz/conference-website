// utils/maps/publicPools.ts
//
// Pools de cartes PAR JOURNÉE et PAR DATE tels que la page publique
// /tournament/[id]/maps les présente.
//
// Le visiteur cherche « le pool du 30/09 » : c'est ainsi que l'organisation
// l'annonce. Un pool daté REMPLACE donc, pour son jour, le pool de la journée —
// c'est la priorité appliquée aux matchs (utils/maps/pool.ts). Pour que la page
// ne mente pas, une date couverte par son propre pool est retirée des dates
// affichées sous la journée : J2 « 23/09 · 25/09 · 16/10 » et, à part,
// « Pool du 30/09 ». Le tout est trié chronologiquement.
//
// PURE : testable sans base.

import { parisDayKey } from './roundPools';

export type PublicPoolMap = {
  name: string;
  type: string | null;
  image: string | null;
};

export type ScopedPool = {
  /** Clé stable pour React et la sélection : `round:2` ou `date:2026-09-30`. */
  key: string;
  kind: 'round' | 'date';
  /** Journée (kind `round`) ; null pour une date. */
  round: number | null;
  /** Date `YYYY-MM-DD` (kind `date`) ; null pour une journée. */
  date: string | null;
  /** Libellé de journée (« J2 ») ; null pour une date. */
  label: string | null;
  /**
   * Dates `YYYY-MM-DD` couvertes : pour une journée, ses jours programmés SANS
   * ceux qui ont leur propre pool ; pour une date, elle-même.
   */
  dates: string[];
  /** Pour une date : libellés des journées jouées ce jour-là. */
  rounds: string[];
  /**
   * Pour une journée : ses jours programmés qui suivent LEUR propre pool
   * (`YYYY-MM-DD`), à signaler au visiteur. Vide pour une date.
   */
  overriddenDates: string[];
  maps: PublicPoolMap[];
};

type MapRow = {
  map_name: string;
  map_type: string | null;
  image_url: string | null;
  order_index?: number | null;
  round_number?: number | null;
  play_date?: string | null;
};

type MatchRow = {
  round_number?: number | null;
  round_name?: string | null;
  scheduled_at?: string | null;
};

function byOrder(a: MapRow, b: MapRow): number {
  const ai = a.order_index;
  const bi = b.order_index;
  if (ai == null && bi != null) return 1;
  if (ai != null && bi == null) return -1;
  if (ai != null && bi != null && ai !== bi) return ai - bi;
  return a.map_name.localeCompare(b.map_name);
}

function toMap(row: MapRow): PublicPoolMap {
  return {
    name: row.map_name,
    type: row.map_type ?? null,
    image: row.image_url ?? null,
  };
}

/**
 * Construit les pools scopés à partir des lignes `tournament_maps` (activées,
 * hors pool par défaut) et du planning. Les lignes du pool par défaut
 * éventuellement présentes sont ignorées.
 */
export function buildScopedPools(
  mapRows: MapRow[],
  matches: MatchRow[]
): ScopedPool[] {
  const roundRows = new Map<number, MapRow[]>();
  const dateRows = new Map<string, MapRow[]>();
  for (const row of mapRows) {
    if (typeof row.round_number === 'number') {
      const bucket = roundRows.get(row.round_number) ?? [];
      bucket.push(row);
      roundRows.set(row.round_number, bucket);
    } else if (typeof row.play_date === 'string' && row.play_date) {
      const day = row.play_date.slice(0, 10);
      const bucket = dateRows.get(day) ?? [];
      bucket.push(row);
      dateRows.set(day, bucket);
    }
  }

  // Planning : libellé et jours de chaque journée, journées de chaque jour.
  const roundMeta = new Map<
    number,
    { label: string | null; days: Set<string> }
  >();
  const roundsByDay = new Map<string, Map<number, string>>();
  for (const m of matches) {
    const round = typeof m.round_number === 'number' ? m.round_number : null;
    const day = parisDayKey(m.scheduled_at ?? null);
    if (round !== null) {
      const meta = roundMeta.get(round) ?? { label: null, days: new Set() };
      if (!meta.label && m.round_name) meta.label = m.round_name;
      if (day) meta.days.add(day);
      roundMeta.set(round, meta);
    }
    if (day && round !== null) {
      const labels = roundsByDay.get(day) ?? new Map<number, string>();
      if (!labels.has(round)) labels.set(round, m.round_name || `J${round}`);
      roundsByDay.set(day, labels);
    }
  }

  const pools: ScopedPool[] = [];

  for (const [round, rows] of roundRows) {
    const meta = roundMeta.get(round);
    const remaining = [...(meta?.days ?? [])].filter((d) => !dateRows.has(d));
    // Journée dont CHAQUE jour a son propre pool : son pool ne s'applique à
    // aucun match. L'afficher laisserait croire qu'il compte.
    if (meta && meta.days.size > 0 && remaining.length === 0) continue;
    pools.push({
      key: `round:${round}`,
      kind: 'round',
      round,
      date: null,
      label: meta?.label || `J${round}`,
      dates: remaining.sort(),
      rounds: [],
      overriddenDates: [...(meta?.days ?? [])]
        .filter((d) => dateRows.has(d))
        .sort(),
      maps: [...rows].sort(byOrder).map(toMap),
    });
  }

  for (const [date, rows] of dateRows) {
    const labels = roundsByDay.get(date);
    pools.push({
      key: `date:${date}`,
      kind: 'date',
      round: null,
      date,
      label: null,
      dates: [date],
      rounds: labels
        ? [...labels.entries()].sort((a, b) => a[0] - b[0]).map(([, l]) => l)
        : [],
      overriddenDates: [],
      maps: [...rows].sort(byOrder).map(toMap),
    });
  }

  // Chronologique sur le premier jour couvert. Une journée sans match daté
  // passe après, par numéro. À date égale, la journée précède le pool daté.
  return pools.sort((a, b) => {
    const da = a.dates[0];
    const db = b.dates[0];
    if (da && db && da !== db) return da.localeCompare(db);
    if (da && !db) return -1;
    if (!da && db) return 1;
    if (a.kind !== b.kind) return a.kind === 'round' ? -1 : 1;
    return (a.round ?? 0) - (b.round ?? 0);
  });
}

/**
 * Pool à ouvrir par défaut : celui de la PROCHAINE date de jeu (aujourd'hui
 * compris, jour calendaire à Paris).
 *
 * POURQUOI : la page s'ouvrait toujours sur « Tout le tournoi ». Le visiteur
 * qui vient voir le pool annoncé (« Map Pool 30/09 ») tombait sur les 30 cartes
 * du tournoi et devait deviner qu'une pastille en bout de ligne portait le bon.
 *
 * Règle : la plus proche date ≥ aujourd'hui couverte par au moins un pool. Si
 * UN seul pool la couvre (un pool daté, ou une seule journée ce jour-là), on
 * l'ouvre. Si plusieurs journées se partagent ce jour sans pool daté, aucune
 * n'est « le » pool du jour : on garde `null` (pool du tournoi) plutôt que de
 * choisir arbitrairement. Aucune date à venir → `null`. PURE.
 */
export function pickDefaultPoolKey(
  pools: ScopedPool[],
  today: string | null
): string | null {
  if (!today) return null;
  let nextDay: string | null = null;
  for (const pool of pools) {
    for (const day of pool.dates) {
      if (day >= today && (nextDay === null || day < nextDay)) nextDay = day;
    }
  }
  if (nextDay === null) return null;
  const covering = pools.filter((p) => p.dates.includes(nextDay as string));
  return covering.length === 1 ? covering[0]!.key : null;
}

/**
 * Pool demandé par l'URL : `?date=2026-09-30` ou `?journee=2` — le lien à
 * partager avec le visuel « Map Pool 30/09 ». Clé d'un pool EXISTANT, sinon
 * `null` (paramètre absent, illisible ou sans pool : on garde le défaut). PURE.
 */
export function poolKeyFromQuery(
  pools: ScopedPool[],
  query: { date?: unknown; journee?: unknown }
): string | null {
  const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);
  const date = first(query.date);
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const hit = pools.find((p) => p.kind === 'date' && p.date === date);
    if (hit) return hit.key;
  }
  const round = first(query.journee);
  if (typeof round === 'string' && /^\d+$/.test(round)) {
    const hit = pools.find(
      (p) => p.kind === 'round' && p.round === Number(round)
    );
    if (hit) return hit.key;
  }
  return null;
}

/* ── Vue PAR SOIRÉE ─────────────────────────────────────────────────────── */

/**
 * Un pool affiché sous une soirée : celui du jour, ou celui d'une journée qui
 * s'y joue.
 */
export type EveningBlock = {
  /** Clé du `ScopedPool` d'origine — sert au lien partageable. */
  key: string;
  kind: 'round' | 'date';
  /** « J2 » pour un pool de journée ; null pour un pool daté. */
  label: string | null;
  maps: PublicPoolMap[];
};

export type EveningPool = {
  /** `day:2026-09-30`, ou `round:5` pour une journée sans date programmée. */
  key: string;
  /** `YYYY-MM-DD`, ou null pour une journée encore non planifiée. */
  date: string | null;
  /** Libellé de repli quand il n'y a pas de date (« J5 »). */
  label: string | null;
  /** Journées qui se jouent ce soir-là (« J1 », « J2 »…). */
  rounds: string[];
  /** Un bloc, ou plusieurs quand la soirée réunit des journées distinctes. */
  blocks: EveningBlock[];
};

/**
 * Regroupe les pools PAR SOIRÉE de jeu, et non par journée.
 *
 * POURQUOI CE CHANGEMENT DE MAILLE. Une joueuse vient chercher « les maps de
 * ce soir ». Or une journée s'étale sur plusieurs soirées quand des matchs
 * sont reportés, et surtout plusieurs journées tombent le même soir : à la Cup
 * 2026, le 23/09 réunit J1, J2 et J3, qui ont trois pools différents. Le
 * sélecteur affichait donc « J1 · 18/09 / 23/09 », « J2 · 23/09 / 25/09 /
 * 16/10 », « J3 · 23/09 / 25/09 » — exact, illisible, et incapable de répondre
 * à la seule question posée. L'organisation avait déjà tranché à la main en
 * créant un pool daté pour le 30/09 : cette fonction généralise sa façon de
 * faire.
 *
 * Priorité, reprise de `utils/maps/pool.ts` : un pool daté REMPLACE ceux des
 * journées pour son jour. Sans pool daté, la soirée montre le pool de chaque
 * journée qui s'y joue — plusieurs blocs plutôt qu'un choix arbitraire entre
 * trois pools également valables.
 *
 * Une journée dont aucun match n'est encore programmé n'a pas de soirée : son
 * pool sort quand même, en fin de liste, sous son propre libellé — sinon un
 * pool saisi par le staff deviendrait invisible le temps que le calendrier se
 * fasse. PURE.
 */
export function buildEveningPools(
  pools: ScopedPool[],
  matches: MatchRow[]
): EveningPool[] {
  const roundsByDay = new Map<string, Map<number, string>>();
  const daysOfRound = new Map<number, Set<string>>();
  for (const m of matches) {
    const round = typeof m.round_number === 'number' ? m.round_number : null;
    const day = parisDayKey(m.scheduled_at ?? null);
    if (!day || round === null) continue;
    const labels = roundsByDay.get(day) ?? new Map<number, string>();
    if (!labels.has(round)) labels.set(round, m.round_name || `J${round}`);
    roundsByDay.set(day, labels);
    const days = daysOfRound.get(round) ?? new Set<string>();
    days.add(day);
    daysOfRound.set(round, days);
  }

  const datePools = new Map(
    pools.filter((p) => p.kind === 'date' && p.date).map((p) => [p.date!, p])
  );
  const roundPools = new Map(
    pools
      .filter((p) => p.kind === 'round' && p.round !== null)
      .map((p) => [p.round!, p])
  );

  const evenings: EveningPool[] = [];
  const days = new Set<string>([...roundsByDay.keys(), ...datePools.keys()]);

  for (const day of [...days].sort()) {
    const labels = roundsByDay.get(day);
    const rounds = labels
      ? [...labels.entries()].sort((a, b) => a[0] - b[0]).map(([, l]) => l)
      : [];

    const dated = datePools.get(day);
    const blocks: EveningBlock[] = [];
    if (dated) {
      blocks.push({
        key: dated.key,
        kind: 'date',
        label: null,
        maps: dated.maps,
      });
    } else {
      for (const round of [...(labels?.keys() ?? [])].sort((a, b) => a - b)) {
        const pool = roundPools.get(round);
        if (!pool) continue;
        blocks.push({
          key: pool.key,
          kind: 'round',
          label: pool.label ?? labels?.get(round) ?? `J${round}`,
          maps: pool.maps,
        });
      }
    }

    // Soirée sans aucun pool propre : le pool du tournoi s'applique, et la page
    // l'affiche déjà sous « Tout le tournoi ». Un onglet vide n'apprendrait
    // rien.
    if (blocks.length === 0) continue;

    evenings.push({
      key: `day:${day}`,
      date: day,
      label: null,
      rounds,
      blocks,
    });
  }

  // Les pools de journées encore non planifiées, pour qu'ils restent visibles.
  for (const [round, pool] of roundPools) {
    if ((daysOfRound.get(round)?.size ?? 0) > 0) continue;
    evenings.push({
      key: pool.key,
      date: null,
      label: pool.label ?? `J${round}`,
      rounds: pool.label ? [pool.label] : [`J${round}`],
      blocks: [
        {
          key: pool.key,
          kind: 'round',
          label: pool.label ?? `J${round}`,
          maps: pool.maps,
        },
      ],
    });
  }

  return evenings;
}

/**
 * Soirée à ouvrir par défaut : la prochaine à jouer (aujourd'hui compris).
 *
 * Plus simple que l'ancienne règle par pool, et plus juste : une soirée n'est
 * jamais ambiguë, même quand trois journées s'y croisent — c'est tout l'objet
 * de la maille. Aucune soirée à venir → `null` (pool du tournoi). PURE.
 */
export function pickDefaultEveningKey(
  evenings: EveningPool[],
  today: string | null
): string | null {
  if (!today) return null;
  const upcoming = evenings
    .filter((e) => e.date && e.date >= today)
    .sort((a, b) => (a.date as string).localeCompare(b.date as string));
  return upcoming[0]?.key ?? null;
}

/**
 * Soirée demandée par l'URL : `?date=2026-09-30` (le lien partagé avec le
 * visuel « Map Pool 30/09 »), ou `?journee=2` — qui ouvre la PREMIÈRE soirée où
 * cette journée se joue, faute de mieux. Clé existante, sinon `null`. PURE.
 */
export function eveningKeyFromQuery(
  evenings: EveningPool[],
  query: { date?: unknown; journee?: unknown }
): string | null {
  const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);

  const date = first(query.date);
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const hit = evenings.find((e) => e.date === date);
    if (hit) return hit.key;
  }

  const round = first(query.journee);
  if (typeof round === 'string' && /^\d+$/.test(round)) {
    const key = `round:${Number(round)}`;
    const hit = evenings.find((e) => e.blocks.some((b) => b.key === key));
    if (hit) return hit.key;
  }
  return null;
}
