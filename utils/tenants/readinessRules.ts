// utils/tenants/readinessRules.ts
//
// « Qu'est-ce qui manque à cet espace pour fonctionner ? » — les règles, et
// elles seules.
//
// La liste des critères vivait à l'intérieur de `/api/admin/tenants/readiness`,
// qui les calcule pour TOUS les espaces d'un coup. La fiche d'un espace pose la
// même question pour UN espace : recopier les six lignes aurait garanti la
// dérive — deux écrans, deux définitions de « opérationnel », et le jour où
// l'un gagne un critère, l'autre ment.
//
// La fonction est pure : les comptages restent la responsabilité de l'appelant,
// qui sait s'il lit un espace ou cinquante.

/** Les manques possibles, du plus bloquant au plus secondaire. */
export const READINESS_BLOCKERS = [
  'inactive',
  'plan_sans_bot',
  'aucun_serveur',
  'personne_rattache',
  'discord_non_configure',
  'emails_non_configures',
] as const;

export type ReadinessBlocker = (typeof READINESS_BLOCKERS)[number];

export type ReadinessInputs = {
  isActive: boolean;
  /** Le plan EFFECTIF inclut-il le bot ? (un plan payant expiré n'en a plus) */
  botEnabled: boolean;
  guildCount: number;
  /** Nombre de lignes `tenant_staff`, tous rôles confondus. */
  staffCount: number;
  /** Clés de configuration Discord renseignées, tous serveurs confondus. */
  configuredKeys: number;
  hasEmailSender: boolean;
};

/**
 * Ce qui bloque, dans l'ordre : un espace sans serveur Discord ne fait rien du
 * tout, un espace sans compte d'envoi fait presque tout.
 *
 * Le critère « quelqu'un peut-il administrer cet espace ? » compte les lignes
 * `tenant_staff`, pas les rôles `owner` : l'espace historique n'a que des rôles
 * `admin`, et un critère qui crie à tort finit par ne plus être lu.
 */
export function computeBlockers(i: ReadinessInputs): ReadinessBlocker[] {
  const blockers: ReadinessBlocker[] = [];
  if (!i.isActive) blockers.push('inactive');
  if (!i.botEnabled) blockers.push('plan_sans_bot');
  if (i.guildCount === 0) blockers.push('aucun_serveur');
  if (i.staffCount === 0) blockers.push('personne_rattache');
  if (i.configuredKeys === 0 && i.guildCount > 0) {
    blockers.push('discord_non_configure');
  }
  if (!i.hasEmailSender) blockers.push('emails_non_configures');
  return blockers;
}

/**
 * Salons et rôles dont la présence signale une configuration Discord
 * commencée. On ne cherche PAS l'exhaustivité : chaque clé vide vaut
 * « fonctionnalité en veille », pas « panne ». Ce qui compte est de distinguer
 * un espace jamais configuré d'un espace en service.
 */
export const CONFIG_KEYS = [
  'staff_log_channel_id',
  'matches_live_channel_id',
  'disputes_forum_channel_id',
  'news_ingest_channel_id',
  'scrims_announce_channel_id',
  'welcome_channel_id',
  'member_leave_channel_id',
  'teams_voice_category_id',
  'captain_role_id',
  'staff_role_admin_id',
] as const;

/** Compte les clés de `CONFIG_KEYS` réellement renseignées sur une ligne. */
export function countConfiguredKeys(row: Record<string, unknown>): number {
  return CONFIG_KEYS.filter((k) => {
    const v = row[k];
    return typeof v === 'string' && v.length > 0;
  }).length;
}
