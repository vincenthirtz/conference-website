// utils/tcg/readEngagement.ts
//
// « Qui a un paquet qui dort, et depuis quand ? »
//
// POURQUOI CE MODULE EXISTE. La vue d'ensemble du TCG compte les paquets
// accordés, ouverts et en attente. C'est suffisant pour constater — 52 paquets
// sur 58 jamais ouverts au 16 septembre 2026 — et inutilisable pour agir :
// aucun de ces trois nombres ne dit À QUI parler. Un total ne se relance pas.
//
// Ce module sort les noms de l'agrégat, et ajoute la dimension que
// `generatedAt` ne donne pas : une SÉRIE. Un instantané ne dira jamais si
// quelque chose qu'on a tenté a marché ; deux points, si.
//
// TOUT SE DÉDUIT DE `tcg_packs`. `granted_at` et `opened_at` suffisent aux deux
// questions, et aucune table d'historique n'est nécessaire : une mesure qu'on
// peut recalculer ne se stocke pas.
//
// NE LÈVE JAMAIS : un panneau de pilotage qui tombe ne pilote rien. Une lecture
// en échec rend `ok: false`, et l'appelant décide — jamais une liste vide, qui
// se lirait « tout le monde a ouvert son paquet », exactement l'inverse de la
// vérité qu'on cherche.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { readPlayerFaces } from './readCardFaces';

export type DormantPlayer = {
  userId: string;
  displayName: string | null;
  /** Paquets reçus et jamais ouverts. */
  pending: number;
  opened: number;
  /** Le plus ancien paquet non ouvert — c'est lui qui mesure l'oubli. */
  oldestPendingAt: string | null;
  lastOpenedAt: string | null;
  /**
   * N'a JAMAIS rien ouvert. Distinct de « en a un qui traîne » : l'une n'a
   * peut-être jamais su que le TCG existait, l'autre connaît et a remis à plus
   * tard. Les deux ne se relancent pas de la même façon.
   */
  neverOpened: boolean;
};

export type WeeklyPoint = {
  /** Lundi de la semaine, en ISO (AAAA-MM-JJ). */
  week: string;
  granted: number;
  opened: number;
};

export type EngagementResult =
  | {
      ok: true;
      value: {
        players: DormantPlayer[];
        weekly: WeeklyPoint[];
        totals: { granted: number; opened: number; pending: number };
      };
    }
  | { ok: false; error: string };

/** Lundi de la semaine d'une date, en UTC — le regroupement de la série. */
function weekStart(iso: string): string {
  const d = new Date(iso);
  const day = (d.getUTCDay() + 6) % 7; // lundi = 0
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

type PackRow = {
  user_id: string;
  granted_at: string | null;
  opened_at: string | null;
};

/** Pages de lecture : PostgREST plafonne une réponse, quoi qu'on demande. */
const PAGE = 1000;
const MAX_PAGES = 50;

export async function readTcgEngagement(
  tenantId: string,
  weeks = 8
): Promise<EngagementResult> {
  if (!supabaseAdmin) return { ok: false, error: 'supabaseAdmin absent' };

  const rows: PackRow[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE;
    const { data, error } = await supabaseAdmin
      .from('tcg_packs')
      .select('user_id, granted_at, opened_at')
      .eq('tenant_id', tenantId)
      .order('granted_at', { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) {
      logger.error('[tcg/engagement] lecture des paquets impossible', error);
      return { ok: false, error: error.message };
    }
    const batch = (data ?? []) as PackRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }

  const byUser = new Map<string, DormantPlayer>();
  const series = new Map<string, WeeklyPoint>();
  let granted = 0;
  let opened = 0;

  const touchWeek = (iso: string): WeeklyPoint => {
    const key = weekStart(iso);
    let point = series.get(key);
    if (!point) {
      point = { week: key, granted: 0, opened: 0 };
      series.set(key, point);
    }
    return point;
  };

  for (const row of rows) {
    granted += 1;
    if (row.granted_at) touchWeek(row.granted_at).granted += 1;
    if (row.opened_at) {
      opened += 1;
      touchWeek(row.opened_at).opened += 1;
    }

    let entry = byUser.get(row.user_id);
    if (!entry) {
      entry = {
        userId: row.user_id,
        displayName: null,
        pending: 0,
        opened: 0,
        oldestPendingAt: null,
        lastOpenedAt: null,
        neverOpened: true,
      };
      byUser.set(row.user_id, entry);
    }

    if (row.opened_at) {
      entry.opened += 1;
      entry.neverOpened = false;
      if (!entry.lastOpenedAt || row.opened_at > entry.lastOpenedAt) {
        entry.lastOpenedAt = row.opened_at;
      }
    } else {
      entry.pending += 1;
      if (
        row.granted_at &&
        (!entry.oldestPendingAt || row.granted_at < entry.oldestPendingAt)
      ) {
        entry.oldestPendingAt = row.granted_at;
      }
    }
  }

  // Seules les personnes qui ont quelque chose en attente sont actionnables :
  // celle qui a tout ouvert n'a rien à relancer.
  const players = [...byUser.values()].filter((p) => p.pending > 0);

  const faces = await readPlayerFaces(
    tenantId,
    players.map((p) => p.userId)
  );
  for (const player of players) {
    player.displayName = faces.get(player.userId)?.displayName ?? null;
  }

  // Le plus ancien oubli d'abord : c'est celui qui risque de ne jamais s'ouvrir.
  players.sort((a, b) => {
    if (a.neverOpened !== b.neverOpened) return a.neverOpened ? -1 : 1;
    return (a.oldestPendingAt ?? '') < (b.oldestPendingAt ?? '') ? -1 : 1;
  });

  const weekly = [...series.values()]
    .sort((a, b) => (a.week < b.week ? -1 : 1))
    .slice(-weeks);

  return {
    ok: true,
    value: {
      players,
      weekly,
      totals: { granted, opened, pending: granted - opened },
    },
  };
}
