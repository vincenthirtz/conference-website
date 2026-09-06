// utils/discord/placementRoles.ts
//
// Rôles Discord attribués selon le classement final — lot 8 de
// docs/PLAN-plateforme-tournois.md, ticket T3 de BACKLOG-tournois.md.
//
// LE PROBLÈME. Un tournoi se termine, le podium est figé, et rien ne se passe
// côté Discord : pas de rôle « Vainqueure 2026 », pas de « Top 8 », pas même
// « Participante ». La reconnaissance se fait à la main ou pas du tout, et
// l'engagement retombe le lendemain de la finale.
//
// LE MODÈLE : DES PLAGES, PAS DES RANGS. « Top 8 » n'est pas un rang, c'est un
// intervalle, et il change de sens entre un tournoi à 8 équipes et un à 64.
// Une règle est donc `{ from, to, roleId }` — `to: null` signifiant « et tout
// le reste », ce qui donne « participante » sans avoir à connaître le nombre
// d'inscrites au moment de configurer.
//
// LES PLAGES PEUVENT SE CHEVAUCHER, et c'est voulu : la gagnante mérite
// « Vainqueure » ET « Top 8 » ET « Participante ». Chaque équipe reçoit donc
// TOUS les rôles dont elle satisfait la plage, dans l'ordre des règles.
//
// Logique PURE : aucun accès base, aucun appel Discord. Le site résout, le bot
// applique — et le bot reste seul à parler à Discord.

export interface PlacementRule {
  /** Rang de début, inclusif (1 = première). */
  from: number;
  /** Rang de fin, inclusif. `null` = jusqu'au dernier rang du classement. */
  to: number | null;
  /** Snowflake du rôle Discord. */
  roleId: string;
  /** Ce que l'admin a écrit ; sert à relire la config, jamais à la résoudre. */
  label?: string | null;
}

export interface FinalRanking {
  teamId: string;
  teamName?: string | null;
  rank: number;
}

export interface ResolvedPlacementRole {
  teamId: string;
  teamName: string | null;
  rank: number;
  /** Rôles à poser, sans doublon, dans l'ordre des règles. */
  roleIds: string[];
}

const SNOWFLAKE_RE = /^[0-9]{15,25}$/;
const MAX_RULES = 12;
const LABEL_MAX = 60;

/**
 * Valide et normalise ce qui vient de la base ou d'un formulaire.
 *
 * Rend `[]` — jamais `null` — sur une entrée inexploitable : l'absence de règle
 * et une règle illisible ont le même effet (aucun rôle posé), et distinguer les
 * deux ne servirait qu'à faire échouer un tournoi au moment de sa finalisation.
 * Une règle invalide dans une liste valide est écartée seule ; les autres
 * s'appliquent.
 */
export function parsePlacementRules(value: unknown): PlacementRule[] {
  if (!Array.isArray(value)) return [];
  const out: PlacementRule[] = [];

  for (const raw of value.slice(0, MAX_RULES)) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;

    const roleId = typeof r.roleId === 'string' ? r.roleId.trim() : '';
    if (!SNOWFLAKE_RE.test(roleId)) continue;

    const from = Number(r.from);
    if (!Number.isInteger(from) || from < 1 || from > 9999) continue;

    let to: number | null;
    if (r.to === null || r.to === undefined || r.to === '') {
      to = null;
    } else {
      const parsed = Number(r.to);
      if (!Number.isInteger(parsed) || parsed < from || parsed > 9999) continue;
      to = parsed;
    }

    const label =
      typeof r.label === 'string' && r.label.trim()
        ? r.label.trim().slice(0, LABEL_MAX)
        : null;

    out.push({ from, to, roleId, label });
  }

  return out;
}

/** La règle couvre-t-elle ce rang ? */
export function ruleCoversRank(rule: PlacementRule, rank: number): boolean {
  if (rank < rule.from) return false;
  return rule.to === null || rank <= rule.to;
}

/**
 * Qui reçoit quoi, une fois le classement figé.
 *
 * Les équipes sans aucun rôle applicable sont ABSENTES du résultat : le bot
 * n'a rien à faire pour elles, et une entrée vide l'obligerait à distinguer
 * « rien à poser » de « poser rien », ce qui est la même chose vue de deux
 * façons.
 */
export function resolvePlacementRoles(
  rankings: FinalRanking[],
  rules: PlacementRule[]
): ResolvedPlacementRole[] {
  if (rules.length === 0) return [];

  const out: ResolvedPlacementRole[] = [];
  for (const entry of rankings) {
    if (!entry.teamId || !Number.isInteger(entry.rank) || entry.rank < 1) {
      continue;
    }
    const roleIds: string[] = [];
    for (const rule of rules) {
      if (!ruleCoversRank(rule, entry.rank)) continue;
      // Deux règles peuvent viser le même rôle (« 1re » et « Top 3 » pointant
      // le même) : le bot n'a pas à poser deux fois.
      if (!roleIds.includes(rule.roleId)) roleIds.push(rule.roleId);
    }
    if (roleIds.length === 0) continue;
    out.push({
      teamId: entry.teamId,
      teamName: entry.teamName ?? null,
      rank: entry.rank,
      roleIds,
    });
  }
  return out;
}

/** Une règle en une phrase, pour la relire dans la liste admin. */
export function describePlacementRule(rule: PlacementRule): string {
  if (rule.to === null) {
    return rule.from === 1
      ? 'Toutes les équipes classées'
      : `À partir de la ${rule.from}e place`;
  }
  if (rule.from === rule.to) {
    return rule.from === 1 ? '1re place' : `${rule.from}e place`;
  }
  return `De la ${rule.from === 1 ? '1re' : `${rule.from}e`} à la ${rule.to}e place`;
}
