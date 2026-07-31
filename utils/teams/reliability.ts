// utils/teams/reliability.ts
//
// Réputation de FIABILITÉ d'une équipe (R10) — dérivée, jamais déclarative.
//
// Dans un réseau de scrims, la monnaie n'est pas le niveau : c'est la
// fiabilité. « Est-ce que cette équipe répond ? » est la question qui décide
// si on lui propose un créneau — et elle était invisible.
//
// Deux partis pris :
//
//   1. AUCUNE note subjective. Pas de système d'avis entre équipes : ça
//      produit des règlements de compte, pas de l'information. Tout est calculé
//      à partir de traces existantes (`demandes` type='scrim' : created_at,
//      processed_at, status).
//
//   2. RIEN sous un seuil d'échantillon. Avec une seule proposition reçue et
//      non traitée, un « 0 % de réponse » serait techniquement vrai et
//      totalement trompeur. Sous MIN_SAMPLE, on renvoie null : l'UI n'affiche
//      alors aucun indicateur plutôt qu'un chiffre injuste.
//
// Ce que ça NE mesure pas : les no-shows (personne ne les enregistre
// aujourd'hui — il n'existe pas de résultat de scrim en base). Le jour où les
// scrims porteront un résultat, l'indicateur s'ajoutera ici.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';

/** En dessous, on n'affiche rien : l'échantillon ne veut rien dire. */
export const MIN_SAMPLE = 3;

/** Une proposition sans réponse au-delà de ce délai est comptée « ignorée ». */
export const IGNORED_AFTER_DAYS = 7;

export type TeamReliability = {
  /** Propositions de scrim reçues (toutes issues confondues). */
  received: number;
  /** Propositions traitées (acceptées ou refusées). */
  answered: number;
  /** Propositions laissées sans réponse au-delà du délai. */
  ignored: number;
  /** answered / received, arrondi 0-100. `null` sous MIN_SAMPLE. */
  responseRate: number | null;
  /** Délai médian de réponse, en heures. `null` sous MIN_SAMPLE. */
  medianResponseHours: number | null;
};

export const EMPTY_RELIABILITY: TeamReliability = {
  received: 0,
  answered: 0,
  ignored: 0,
  responseRate: null,
  medianResponseHours: null,
};

type DemandeRow = {
  team_id: string | null;
  status: string | null;
  created_at: string | null;
  processed_at: string | null;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Calcule les indicateurs à partir des demandes REÇUES par une équipe.
 * Pur : testable sans base, et réutilisable si la source change.
 */
export function computeReliability(
  rows: DemandeRow[],
  now: Date = new Date()
): TeamReliability {
  const received = rows.length;
  let answered = 0;
  let ignored = 0;
  const delaysHours: number[] = [];

  const ignoreCutoffMs = IGNORED_AFTER_DAYS * 24 * 60 * 60 * 1000;

  for (const row of rows) {
    const isPending = (row.status ?? 'pending') === 'pending';
    if (!isPending) {
      answered += 1;
      const created = row.created_at ? Date.parse(row.created_at) : NaN;
      const processed = row.processed_at ? Date.parse(row.processed_at) : NaN;
      if (Number.isFinite(created) && Number.isFinite(processed)) {
        const hours = (processed - created) / (60 * 60 * 1000);
        // Garde-fou : une horodate incohérente (processed < created) ne doit
        // pas tirer la médiane vers le négatif.
        if (hours >= 0) delaysHours.push(hours);
      }
      continue;
    }
    const created = row.created_at ? Date.parse(row.created_at) : NaN;
    if (Number.isFinite(created) && now.getTime() - created > ignoreCutoffMs) {
      ignored += 1;
    }
  }

  const enoughSample = received >= MIN_SAMPLE;
  const rawMedian = median(delaysHours);

  return {
    received,
    answered,
    ignored,
    responseRate: enoughSample ? Math.round((answered / received) * 100) : null,
    medianResponseHours:
      enoughSample && rawMedian != null
        ? Math.round(rawMedian * 10) / 10
        : null,
  };
}

/**
 * Charge la fiabilité de PLUSIEURS équipes en une requête (annuaire).
 * Ne throw jamais : une erreur de lecture renvoie une map vide, et l'UI
 * n'affiche simplement aucun indicateur.
 */
export async function loadReliabilityMap(
  tenantId: string,
  teamIds: string[]
): Promise<Map<string, TeamReliability>> {
  const out = new Map<string, TeamReliability>();
  if (!supabaseAdmin || teamIds.length === 0) return out;

  try {
    const { data, error } = await supabaseAdmin
      .from('demandes')
      .select('team_id, status, created_at, processed_at')
      .eq('tenant_id', tenantId)
      .eq('type', 'scrim')
      .in('team_id', teamIds);

    if (error) {
      logger.error('[reliability] read error', error);
      return out;
    }

    const byTeam = new Map<string, DemandeRow[]>();
    for (const row of (data || []) as DemandeRow[]) {
      if (!row.team_id) continue;
      const list = byTeam.get(row.team_id) ?? [];
      list.push(row);
      byTeam.set(row.team_id, list);
    }

    for (const [teamId, rows] of byTeam) {
      out.set(teamId, computeReliability(rows));
    }
    return out;
  } catch (err) {
    logger.error('[reliability] crash', err);
    return out;
  }
}

/** Fiabilité d'une seule équipe (fiche publique). */
export async function loadTeamReliability(
  tenantId: string,
  teamId: string
): Promise<TeamReliability> {
  const map = await loadReliabilityMap(tenantId, [teamId]);
  return map.get(teamId) ?? EMPTY_RELIABILITY;
}
