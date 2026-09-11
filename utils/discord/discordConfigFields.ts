// utils/discord/discordConfigFields.ts
//
// Source unique des champs de l'écran « Configuration Discord » d'un tenant
// (pages/admin/tenants/[id]/discord-config/[guildId].tsx).
//
// POURQUOI CE FICHIER VIT HORS DE LA PAGE. La vraie raison n'est pas la taille
// du fichier : c'est que cette liste doit pouvoir être confrontée EN TEST à la
// whitelist du handler PUT (pages/api/admin/tenants/[id]/discord-config/
// [guildId].ts). Un champ affiché ici mais absent de cette whitelist est
// enregistré... nulle part : le PUT répond 200, l'écran affiche « Configuration
// Discord enregistrée », et la valeur est jetée EN SILENCE.
//
// Ce n'est pas une hypothèse. `free_players_channel_id` — le salon où le bot
// annonce les joueuses sans équipe — n'a jamais existé côté base : le bot
// résolvait NULL et sortait sans un log, et onze inscriptions n'ont été
// annoncées à personne. Le garde-fou « tout champ de l'UI est accepté par
// l'API » vit dans tests/unit/apiAdminTenants.test.ts et importe ce module.
//
// Corollaire : ne JAMAIS ajouter une entrée ici sans (1) la colonne en base,
// (2) la whitelist du PUT, (3) le SELECT des endpoints bot qui la relaient.

import type nsAdminTenantDiscordConfig from '@/lib/i18n/locales/admin-fr/adminTenantDiscordConfig';

type Dict = (typeof nsAdminTenantDiscordConfig)['fr'];

/** Règle rang → rôle, stockée en JSONB (cf. utils/discord/placementRoles.ts). */
type PlacementRuleLike = { from: number; to: number | null; roleId: string };

// Aligné sur les colonnes réelles de `tenant_discord_config` (source de vérité :
// migration create_tenant_discord_config_table.sql + whitelist du handler PUT).
export type DiscordConfig = {
  guild_id: string;
  guild_name?: string | null;
  staff_log_channel_id: string | null;
  matches_live_channel_id: string | null;
  disputes_forum_channel_id: string | null;
  news_ingest_channel_id: string | null;
  scrims_announce_channel_id: string | null;
  /** Salon d'annonce des joueuses « sans équipe » (event free_player.registered). */
  free_players_channel_id: string | null;
  teams_voice_category_id: string | null;
  captain_role_id: string | null;
  substitute_role_id: string | null;
  staff_role_owner_id: string | null;
  staff_role_admin_id: string | null;
  staff_role_caster_id: string | null;
  disputes_forum_tag_open_id: string | null;
  disputes_forum_tag_pending_id: string | null;
  disputes_forum_tag_resolved_id: string | null;
  member_leave_channel_id: string | null;
  welcome_enabled?: boolean | null;
  welcome_channel_id?: string | null;
  welcome_message?: string | null;
  welcome_dm_message?: string | null;
  /** Règles rang → rôle Discord posées à la finalisation d'un tournoi (lot 8). */
  placement_roles?: PlacementRuleLike[] | null;
};

// Familles de salons proposées par champ (filtre les options du <select>).
// Discord ChannelType (numérique) : 0 texte, 2 vocal, 4 catégorie, 5 annonces,
// 13 stage, 15 forum, 16 media.
export type ChannelKind = 'text' | 'voice' | 'forum' | 'category';

export const CHANNEL_TYPES: Record<ChannelKind, number[]> = {
  text: [0, 5], // texte + annonces
  voice: [2, 13], // vocal + stage
  forum: [15, 16], // forum + media
  category: [4], // catégorie
};

// Champs rendus dans le formulaire. Snowflake unique ou liste de snowflakes.
// channelKind (facultatif) : famille de salons proposée dans le sélecteur ;
// absent sur les champs de rôles (section 'roles' → liste de rôles).
export type FieldSection = 'channels' | 'voice' | 'roles' | 'tags';

export type FieldDef =
  | {
      key: keyof DiscordConfig;
      label: string;
      help?: string;
      kind: 'single';
      section: FieldSection;
      channelKind?: ChannelKind;
    }
  | {
      key: keyof DiscordConfig;
      label: string;
      help?: string;
      kind: 'list';
      section: FieldSection;
      channelKind?: ChannelKind;
    };

export function getDiscordConfigFields(t: Dict): FieldDef[] {
  return [
    {
      key: 'staff_log_channel_id',
      label: t.fieldStaffLogLabel,
      help: t.fieldStaffLogHelp,
      kind: 'single',
      section: 'channels',
      channelKind: 'text',
    },
    {
      key: 'matches_live_channel_id',
      label: t.fieldMatchesLiveLabel,
      help: t.fieldMatchesLiveHelp,
      kind: 'single',
      section: 'channels',
      channelKind: 'text',
    },
    {
      key: 'disputes_forum_channel_id',
      label: t.fieldDisputesForumLabel,
      help: t.fieldDisputesForumHelp,
      kind: 'single',
      section: 'channels',
      channelKind: 'forum',
    },
    {
      key: 'news_ingest_channel_id',
      label: t.fieldNewsIngestLabel,
      help: t.fieldNewsIngestHelp,
      kind: 'single',
      section: 'channels',
      channelKind: 'text',
    },
    {
      key: 'scrims_announce_channel_id',
      label: t.fieldScrimsAnnounceLabel,
      help: t.fieldScrimsAnnounceHelp,
      kind: 'single',
      section: 'channels',
      channelKind: 'text',
    },
    {
      key: 'free_players_channel_id',
      label: t.fieldFreePlayersLabel,
      help: t.fieldFreePlayersHelp,
      kind: 'single',
      section: 'channels',
      channelKind: 'text',
    },
    {
      key: 'member_leave_channel_id',
      label: t.fieldMemberLeaveLabel,
      help: t.fieldMemberLeaveHelp,
      kind: 'single',
      section: 'channels',
      channelKind: 'text',
    },
    {
      key: 'teams_voice_category_id',
      label: t.fieldTeamsVoiceLabel,
      help: t.fieldTeamsVoiceHelp,
      kind: 'single',
      section: 'voice',
      channelKind: 'category',
    },
    {
      key: 'captain_role_id',
      label: t.fieldCaptainRoleLabel,
      help: t.fieldCaptainRoleHelp,
      kind: 'single',
      section: 'roles',
    },
    {
      key: 'substitute_role_id',
      label: t.fieldSubstituteRoleLabel,
      help: t.fieldSubstituteRoleHelp,
      kind: 'single',
      section: 'roles',
    },
    {
      key: 'staff_role_owner_id',
      label: t.fieldStaffOwnerLabel,
      help: t.fieldStaffOwnerHelp,
      kind: 'single',
      section: 'roles',
    },
    {
      key: 'staff_role_admin_id',
      label: t.fieldStaffAdminLabel,
      help: t.fieldStaffAdminHelp,
      kind: 'single',
      section: 'roles',
    },
    {
      key: 'staff_role_caster_id',
      label: t.fieldStaffCasterLabel,
      help: t.fieldStaffCasterHelp,
      kind: 'single',
      section: 'roles',
    },
    {
      key: 'disputes_forum_tag_open_id',
      label: t.fieldTagOpenLabel,
      help: t.fieldTagOpenHelp,
      kind: 'single',
      section: 'tags',
    },
    {
      key: 'disputes_forum_tag_pending_id',
      label: t.fieldTagPendingLabel,
      help: t.fieldTagPendingHelp,
      kind: 'single',
      section: 'tags',
    },
    {
      key: 'disputes_forum_tag_resolved_id',
      label: t.fieldTagResolvedLabel,
      help: t.fieldTagResolvedHelp,
      kind: 'single',
      section: 'tags',
    },
  ];
}

/**
 * Clés éditées par l'écran, sans dépendre des libellés. Sert au garde-fou de
 * whitelist : le test n'a pas à charger le dictionnaire pour savoir ce que
 * l'admin peut modifier.
 */
export const DISCORD_CONFIG_FIELD_KEYS: readonly (keyof DiscordConfig)[] =
  getDiscordConfigFields(new Proxy({} as Dict, { get: () => '' }) as Dict).map(
    (f) => f.key
  );
