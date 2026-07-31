// utils/teams/teamHealth.ts
//
// Santé d'équipe (N3) — cœur PUR du diagnostic.
//
// Le constat qui justifie ce module : le diagnostic EXISTAIT déjà, mais nulle
// part où une équipe puisse le lire. `utils/teamMessages.ts` calcule roster
// incomplet, comptes jamais connectés et BattleTags manquants… uniquement pour
// composer une relance Discord (`cron/team-roster-reminders`). Une équipe ne
// pouvait donc découvrir ce qui la bloque qu'en recevant un message — jamais en
// venant regarder. Et rien ne couvrait le reste : capitanat vacant, comptes
// Discord non liés, rythme non déclaré, invisibilité pour les scrims.
//
// Trois partis pris :
//
//   1. AUCUN INDICATEUR DÉCLARATIF, aucun score de « santé » sur 100. Un score
//      agrégé se contemple ; il ne se répare pas. On ne renvoie que des
//      constats nommés et comptés, chacun rattachable à un geste précis.
//
//   2. DES CODES, PAS DES PHRASES. L'UI porte le libellé, le « pourquoi ça
//      compte » et le lien qui répare — le serveur ne fait que constater.
//      Même séparation que les raisons du score d'adversaire (N4).
//
//   3. RIEN QUAND TOUT VA BIEN. Une liste vide est la réponse normale d'une
//      équipe en règle, et la carte disparaît. Un tableau de bord qui affiche
//      en permanence « 0 problème » entraîne à ne plus le lire.

/** Ce qui empêche de jouer, ce qui gêne, ce qui manque à gagner. */
export type HealthSeverity = 'blocking' | 'warning' | 'info';

export type HealthCode =
  /** Aucune capitaine désignée (état légitime, mais personne ne décide). */
  | 'no_captain'
  /** Moins de titulaires que l'effectif requis pour aligner une équipe. */
  | 'roster_shortfall'
  /** Membres sans BattleTag : impossible de les identifier en jeu. */
  | 'missing_battle_tag'
  /** BattleTag renseigné mais jamais vérifié. */
  | 'unverified_battle_tag'
  /** Membres sans compte Discord lié : ni rôle, ni salon, ni notification. */
  | 'discord_unlinked'
  /** Comptes créés mais jamais utilisés pour ouvrir une session. */
  | 'never_logged_in'
  /** Membres n'ayant pas déclaré leur rythme : le noyau est incalculable. */
  | 'no_rhythm'
  /** Ni annonce vivante ni rythme : l'équipe est introuvable pour un scrim. */
  | 'invisible_for_scrims'
  /** Affrontements joués et jamais débriefés. */
  | 'unreviewed_encounters';

export type HealthIssue = {
  code: HealthCode;
  severity: HealthSeverity;
  /** Nombre de personnes / d'objets concernés. 0 pour un constat binaire. */
  count: number;
};

export type TeamHealthFacts = {
  memberCount: number;
  /** Membres non remplaçantes. */
  starters: number;
  /**
   * Effectif requis pour aligner une équipe. Vient du `min_players` du tournoi
   * quand l'équipe y est inscrite, sinon de la taille de line-up du jeu.
   */
  requiredStarters: number;
  hasCaptain: boolean;
  missingBattleTags: number;
  unverifiedBattleTags: number;
  discordUnlinked: number;
  neverLoggedIn: number;
  /** Membres ayant déclaré au moins un créneau récurrent (N1). */
  rhythmDeclared: number;
  /** L'équipe a-t-elle une recherche de scrim vivante ? */
  hasLiveScrimSearch: boolean;
  /** Le rythme agrégé produit-il au moins un créneau de noyau ? */
  hasRhythmCore: boolean;
  unreviewedEncounters: number;
};

/** Au-delà, une pile de débriefs en retard cesse d'être un détail. */
export const UNREVIEWED_THRESHOLD = 3;

const SEVERITY_ORDER: Record<HealthSeverity, number> = {
  blocking: 0,
  warning: 1,
  info: 2,
};

/**
 * Constats d'une équipe, du plus bloquant au plus accessoire.
 *
 * Chaque règle ne se déclenche que lorsqu'elle est ACTIONNABLE : on ne réclame
 * pas un BattleTag à une équipe vide, ni un rythme à une équipe d'une personne.
 * Un constat qu'on ne peut pas corriger n'est pas un diagnostic, c'est un
 * reproche.
 */
export function computeTeamHealth(facts: TeamHealthFacts): HealthIssue[] {
  const issues: HealthIssue[] = [];
  const add = (code: HealthCode, severity: HealthSeverity, count = 0) =>
    issues.push({ code, severity, count });

  if (!facts.hasCaptain) add('no_captain', 'blocking');

  const shortfall = Math.max(0, facts.requiredStarters - facts.starters);
  if (shortfall > 0) add('roster_shortfall', 'blocking', shortfall);

  if (facts.missingBattleTags > 0) {
    add('missing_battle_tag', 'blocking', facts.missingBattleTags);
  }
  if (facts.unverifiedBattleTags > 0) {
    add('unverified_battle_tag', 'warning', facts.unverifiedBattleTags);
  }
  if (facts.discordUnlinked > 0) {
    add('discord_unlinked', 'warning', facts.discordUnlinked);
  }
  if (facts.neverLoggedIn > 0) {
    add('never_logged_in', 'warning', facts.neverLoggedIn);
  }

  // Le rythme n'a de sens qu'à plusieurs : le réclamer à une équipe d'une
  // personne serait du bruit.
  if (facts.memberCount > 1) {
    const missing = Math.max(0, facts.memberCount - facts.rhythmDeclared);
    if (missing > 0) add('no_rhythm', 'warning', missing);
  }

  // Invisible pour les scrims : ni annonce datée, ni habitude exploitable.
  // Redondant en apparence avec `no_rhythm`, mais c'est la CONSÉQUENCE qui
  // parle à une capitaine — « personne ne peut vous proposer de scrim ».
  if (!facts.hasLiveScrimSearch && !facts.hasRhythmCore) {
    add('invisible_for_scrims', 'info');
  }

  if (facts.unreviewedEncounters >= UNREVIEWED_THRESHOLD) {
    add('unreviewed_encounters', 'info', facts.unreviewedEncounters);
  }

  return issues.sort((a, b) => {
    const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (s !== 0) return s;
    return b.count - a.count;
  });
}

/** Un seul compteur pour l'en-tête : ce qui bloque vraiment. */
export function countBlocking(issues: HealthIssue[]): number {
  return issues.filter((i) => i.severity === 'blocking').length;
}
