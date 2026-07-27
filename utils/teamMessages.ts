// utils/teamMessages.ts
//
// Cœur (testable, sans I/O HTTP) du « message d'équipe » : envoi d'un message
// personnalisé dans le salon textuel Discord provisionné pour chaque équipe
// (`teams.discord_channel_id`, cf. team-voice.js côté bot).
//
// Trois briques indépendantes :
//   1. `loadTeamRosterStates`  — lit l'état roster des équipes d'un tournoi
//      (titulaires / remplaçantes / BattleTags manquants / jamais connectées).
//   2. `renderTemplate`        — substitution de variables `{titulaires}`…
//      dans un gabarit libre écrit par le staff.
//   3. `buildRosterReminder`   — gabarit AUTO : choisit la bonne variante selon
//      l'état (roster incomplet / complet mais comptes dormants / tout bon) et
//      rend un message prêt à poster.
//
// L'envoi lui-même passe par l'event bot `team.message` (outbox → bot), pas par
// un appel Discord direct : le site n'a pas de token Discord.

import { supabaseAdmin } from './supabase';
import { DEFAULT_TENANT_ID } from './tenant';
import { resolveCurrentTournamentId } from './currentTournament';
import { emitBotEvent } from './botEvents';
import { logger } from './logger';

/** Longueur max d'un message Discord (le handler bot re-tronque par sécurité). */
export const TEAM_MESSAGE_MAX = 1900;

export const SITE_URL = 'https://owwomenscup.fr';

/** Clé `site_settings` portant la deadline de verrouillage des rosters (ISO). */
export const ROSTER_DEADLINE_SETTING_KEY = 'roster_lock_deadline';

export type TeamRosterState = {
  teamId: string;
  teamName: string;
  slug: string | null;
  discordChannelId: string | null;
  discordRoleId: string | null;
  captainUserId: string | null;
  /** Membres non `is_substitute`. */
  starters: number;
  substitutes: number;
  /** Titulaires manquants pour atteindre `min_players` (0 si complet). */
  missingStarters: number;
  /** Membres du roster sans BattleTag renseigné. */
  missingBattleTags: number;
  /** Membres avec un compte site qui n'a jamais servi à ouvrir une session. */
  neverLoggedIn: number;
};

export type TeamRosterContext = {
  tournamentId: string;
  tournamentName: string;
  /** `min_players` du tournoi (0 = non configuré → pas de notion de complétude). */
  minPlayers: number;
  /** Date de début du tournoi (`YYYY-MM-DD`) ou null. */
  startDate: string | null;
  /** Deadline de verrouillage des rosters (ISO) ou null si non configurée. */
  deadline: string | null;
  teams: TeamRosterState[];
};

/* -------------------------------------------------------------------------- */
/* 1. Lecture de l'état roster                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Deadline de verrouillage des rosters, lue dans `site_settings`
 * (table globale clé/valeur). Renvoie l'ISO stocké, ou null si absent /
 * illisible — l'absence est un cas NORMAL (la ligne « deadline » du message
 * est alors simplement omise), jamais une erreur bloquante.
 */
export async function loadRosterDeadline(): Promise<string | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from('site_settings')
    .select('value')
    .eq('key', ROSTER_DEADLINE_SETTING_KEY)
    .maybeSingle();
  if (error) {
    logger.warn('[teamMessages] lecture deadline échouée: %s', error.message);
    return null;
  }
  const raw = (data as { value?: string | null } | null)?.value;
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

/**
 * Charge l'état roster des équipes inscrites à un tournoi.
 *
 * `tournamentId` omis ⇒ tournoi en cours (`resolveCurrentTournamentId`). Si
 * aucun tournoi n'est résolu, renvoie `null` — l'appelant doit traiter ça
 * comme « rien à envoyer » (même sémantique que les audiences broadcast).
 *
 * Ne retient que les équipes actives non supprimées. Les équipes sans salon
 * textuel provisionné sont conservées (avec `discordChannelId: null`) pour que
 * l'UI puisse les afficher comme « non contactables » plutôt que de les faire
 * disparaître en silence.
 */
export async function loadTeamRosterStates(
  tournamentId?: string | null,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<TeamRosterContext | null> {
  if (!supabaseAdmin) throw new Error('Supabase admin not configured');

  const resolvedId =
    tournamentId || (await resolveCurrentTournamentId(tenantId));
  if (!resolvedId) return null;

  const { data: tournament, error: tournamentError } = await supabaseAdmin
    .from('tournaments')
    .select('id, name, min_players, start_date')
    .eq('id', resolvedId)
    .maybeSingle();
  if (tournamentError) throw tournamentError;
  if (!tournament) return null;

  const t = tournament as {
    id: string;
    name?: string | null;
    min_players?: number | null;
    start_date?: string | null;
  };

  const { data: entries, error: entriesError } = await supabaseAdmin
    .from('tournament_teams')
    .select('team_id')
    .eq('tournament_id', resolvedId);
  if (entriesError) throw entriesError;

  const teamIds = Array.from(
    new Set(
      (entries ?? [])
        .map((r) => (r as { team_id?: string | null }).team_id)
        .filter((id): id is string => Boolean(id))
    )
  );

  const base: TeamRosterContext = {
    tournamentId: resolvedId,
    tournamentName: t.name || 'le tournoi',
    minPlayers: Math.max(0, Number(t.min_players) || 0),
    startDate: t.start_date ?? null,
    deadline: await loadRosterDeadline(),
    teams: [],
  };
  if (teamIds.length === 0) return base;

  const { data: teams, error: teamsError } = await supabaseAdmin
    .from('teams')
    .select(
      'id, name, slug, captain_id, discord_channel_id, discord_role_id'
    )
    .in('id', teamIds)
    .eq('is_active', true)
    .is('deleted_at', null);
  if (teamsError) throw teamsError;

  const { data: members, error: membersError } = await supabaseAdmin
    .from('team_members')
    .select('team_id, user_id, is_substitute, battle_tag')
    .in('team_id', teamIds);
  if (membersError) throw membersError;

  type MemberRow = {
    team_id?: string | null;
    user_id?: string | null;
    is_substitute?: boolean | null;
    battle_tag?: string | null;
  };
  const memberRows = (members ?? []) as MemberRow[];

  // « Jamais connecté » se lit sur auth.users, hors portée de PostgREST : on
  // résout les comptes concernés via l'API admin auth, en un seul scan.
  const dormantUserIds = await listNeverSignedInUserIds(
    memberRows
      .map((m) => m.user_id)
      .filter((id): id is string => Boolean(id))
  );

  const byTeam = new Map<
    string,
    { starters: number; subs: number; noTag: number; dormant: number }
  >();
  for (const m of memberRows) {
    if (!m.team_id) continue;
    const acc =
      byTeam.get(m.team_id) ?? { starters: 0, subs: 0, noTag: 0, dormant: 0 };
    if (m.is_substitute) acc.subs += 1;
    else acc.starters += 1;
    if (!m.battle_tag || !m.battle_tag.trim()) acc.noTag += 1;
    if (m.user_id && dormantUserIds.has(m.user_id)) acc.dormant += 1;
    byTeam.set(m.team_id, acc);
  }

  base.teams = ((teams ?? []) as Array<{
    id: string;
    name?: string | null;
    slug?: string | null;
    captain_id?: string | null;
    discord_channel_id?: string | null;
    discord_role_id?: string | null;
  }>)
    .map((team) => {
      const acc =
        byTeam.get(team.id) ?? { starters: 0, subs: 0, noTag: 0, dormant: 0 };
      return {
        teamId: team.id,
        teamName: team.name || 'équipe',
        slug: team.slug ?? null,
        discordChannelId: team.discord_channel_id ?? null,
        discordRoleId: team.discord_role_id ?? null,
        captainUserId: team.captain_id ?? null,
        starters: acc.starters,
        substitutes: acc.subs,
        missingStarters: Math.max(0, base.minPlayers - acc.starters),
        missingBattleTags: acc.noTag,
        neverLoggedIn: acc.dormant,
      } satisfies TeamRosterState;
    })
    .sort((a, b) => a.teamName.localeCompare(b.teamName, 'fr'));

  return base;
}

/**
 * Sous-ensemble d'ids qui n'ont JAMAIS ouvert de session (`last_sign_in_at`
 * absent). Scan paginé de auth.users, filtré aux ids demandés — même approche
 * que `utils/broadcasts.ts`. Renvoie un Set vide si aucun id demandé.
 */
async function listNeverSignedInUserIds(
  userIds: string[]
): Promise<Set<string>> {
  const wanted = new Set(userIds);
  const dormant = new Set<string>();
  if (!supabaseAdmin || wanted.size === 0) return dormant;

  let page = 1;
  const perPage = 1000;
  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw error;
    const batch = data?.users ?? [];
    for (const u of batch) {
      if (wanted.has(u.id) && !u.last_sign_in_at) dormant.add(u.id);
    }
    if (batch.length < perPage) break;
    page += 1;
  }
  return dormant;
}

/* -------------------------------------------------------------------------- */
/* 2. Rendu de gabarit                                                         */
/* -------------------------------------------------------------------------- */

/** Variables acceptées dans un gabarit libre, documentées dans l'UI admin. */
export const TEMPLATE_VARIABLES = [
  'equipe',
  'tournoi',
  'titulaires',
  'remplacantes',
  'manquants',
  'minimum',
  'sans_battletag',
  'jamais_connectees',
  'deadline',
  'debut',
  'lien_equipe',
] as const;

export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];

/** Formate une date ISO/`YYYY-MM-DD` en français long (« lundi 31 août »). */
export function formatFrDate(iso: string | null, withTime = false): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return '';
  const date = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Paris',
  }).format(d);
  if (!withTime) return date;
  const time = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  }).format(d);
  return `${date} à ${time}`;
}

export function buildTemplateValues(
  team: TeamRosterState,
  ctx: TeamRosterContext
): Record<TemplateVariable, string> {
  return {
    equipe: team.teamName,
    tournoi: ctx.tournamentName,
    titulaires: String(team.starters),
    remplacantes: String(team.substitutes),
    manquants: String(team.missingStarters),
    minimum: String(ctx.minPlayers),
    sans_battletag: String(team.missingBattleTags),
    jamais_connectees: String(team.neverLoggedIn),
    deadline: formatFrDate(ctx.deadline, true),
    debut: formatFrDate(ctx.startDate),
    lien_equipe: `${SITE_URL}/player/manage-team`,
  };
}

/**
 * Substitue `{variable}` dans un gabarit. Une variable inconnue est laissée
 * TELLE QUELLE (visible à la relecture) plutôt que remplacée par du vide : un
 * message parti avec un trou silencieux est pire qu'un `{typo}` repéré au
 * moment de l'aperçu.
 */
export function renderTemplate(
  template: string,
  values: Record<string, string>
): string {
  return template.replace(/\{([a-z_]+)\}/gi, (match, name: string) => {
    const key = name.toLowerCase();
    return Object.prototype.hasOwnProperty.call(values, key)
      ? values[key]
      : match;
  });
}

/* -------------------------------------------------------------------------- */
/* 3. Preset « rappel roster »                                                 */
/* -------------------------------------------------------------------------- */

export type RosterReminderKind =
  /** Moins de `min_players` titulaires — l'équipe ne peut pas être seedée. */
  | 'incomplete'
  /** Roster complet mais points de friction (comptes dormants, BattleTags). */
  | 'complete_with_warnings'
  /** Roster complet et rien à signaler. */
  | 'complete';

export type RenderedTeamMessage = {
  team: TeamRosterState;
  kind: RosterReminderKind | 'custom';
  content: string;
  /** false si l'équipe n'a pas de salon textuel provisionné. */
  deliverable: boolean;
};

export function classifyRoster(
  team: TeamRosterState,
  ctx: TeamRosterContext
): RosterReminderKind {
  if (ctx.minPlayers > 0 && team.starters < ctx.minPlayers) return 'incomplete';
  if (team.neverLoggedIn > 0 || team.missingBattleTags > 0) {
    return 'complete_with_warnings';
  }
  return 'complete';
}

const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

/**
 * Construit le message de rappel personnalisé d'une équipe. Trois variantes
 * (cf. `classifyRoster`) qui partagent le même en-tête et le même pied.
 *
 * `mention: true` préfixe la mention du rôle d'équipe — c'est le seul moyen de
 * notifier les joueuses ; le handler bot autorise alors explicitement ce rôle
 * dans `allowedMentions`.
 */
export function buildRosterReminder(
  team: TeamRosterState,
  ctx: TeamRosterContext,
  opts: { mention?: boolean } = {}
): RenderedTeamMessage {
  const kind = classifyRoster(team, ctx);
  const lines: string[] = [];

  if (opts.mention && team.discordRoleId) {
    lines.push(`<@&${team.discordRoleId}>`, '');
  }

  lines.push(`📋 **Point roster — ${ctx.tournamentName}**`, '');

  const rosterLine =
    ctx.minPlayers > 0
      ? `**${team.starters}/${ctx.minPlayers} ${plural(team.starters, 'titulaire', 'titulaires')}**`
      : `**${team.starters} ${plural(team.starters, 'titulaire', 'titulaires')}**`;
  const subsLine =
    team.substitutes > 0
      ? ` + ${team.substitutes} ${plural(team.substitutes, 'remplaçante', 'remplaçantes')}`
      : '';
  lines.push(
    `Votre équipe est inscrite ✅ — état du roster à ce jour : ${rosterLine}${subsLine}.`,
    ''
  );

  if (kind === 'incomplete') {
    lines.push(
      `⚠️ Il manque **${team.missingStarters} ${plural(team.missingStarters, 'joueuse', 'joueuses')}** ` +
        `pour que l'équipe puisse être placée dans le bracket.`,
      `Deux leviers depuis l'espace équipe : activez le **recrutement ouvert** pour recevoir ` +
        `des candidatures, et invitez directement les joueuses de la liste ` +
        `**« Recherche une équipe »**.`
    );
  } else {
    lines.push(`🎉 Roster complet — rien à ajouter côté effectif.`);
  }

  if (team.neverLoggedIn > 0) {
    lines.push(
      `🔸 **${team.neverLoggedIn} ${plural(team.neverLoggedIn, 'joueuse du roster ne s’est jamais connectée', 'joueuses du roster ne se sont jamais connectées')}** ` +
        `au site : sans compte actif, pas de check-in le jour J. Activation en 2 minutes sur <${SITE_URL}/login>.`
    );
  }
  if (team.missingBattleTags > 0) {
    lines.push(
      `🔸 **${team.missingBattleTags} ${plural(team.missingBattleTags, 'membre n’a pas', 'membres n’ont pas')} de BattleTag renseigné** — ` +
        `c'est lui qui sert à vous identifier en jeu.`
    );
  }

  lines.push('');
  if (ctx.deadline) {
    lines.push(
      `🗓️ **Deadline : ${formatFrDate(ctx.deadline, true)}** — après ça les rosters sont verrouillés.`
    );
  }
  if (ctx.startDate) {
    lines.push(`Le tournoi démarre le **${formatFrDate(ctx.startDate)}**.`);
  }
  lines.push(
    '',
    `➡️ Espace équipe : <${SITE_URL}/player/manage-team>`,
    `Une question, un souci ? Répondez ici, le staff suit ce salon.`
  );

  return {
    team,
    kind,
    content: lines.join('\n').slice(0, TEAM_MESSAGE_MAX),
    deliverable: Boolean(team.discordChannelId),
  };
}

/* -------------------------------------------------------------------------- */
/* 4. Composition + envoi                                                      */
/* -------------------------------------------------------------------------- */

export type ComposeOptions = {
  /** 'roster-reminder' = gabarit auto ; 'custom' = `template` fourni. */
  preset: 'roster-reminder' | 'custom';
  template?: string;
  mention?: boolean;
  /** Restreint aux équipes ciblées ; omis ⇒ toutes les équipes du tournoi. */
  teamIds?: string[];
  /**
   * 'incomplete' ne garde que les rosters incomplets — le filtre utile pour la
   * relance automatique (ne pas spammer les équipes en règle).
   */
  only?: 'all' | 'incomplete' | 'needs_attention';
};

export function composeTeamMessages(
  ctx: TeamRosterContext,
  opts: ComposeOptions
): RenderedTeamMessage[] {
  const wanted = opts.teamIds?.length ? new Set(opts.teamIds) : null;

  return ctx.teams
    .filter((team) => (wanted ? wanted.has(team.teamId) : true))
    .filter((team) => {
      if (!opts.only || opts.only === 'all') return true;
      const kind = classifyRoster(team, ctx);
      if (opts.only === 'incomplete') return kind === 'incomplete';
      return kind !== 'complete';
    })
    .map((team) => {
      if (opts.preset === 'roster-reminder') {
        return buildRosterReminder(team, ctx, { mention: opts.mention });
      }
      const values = buildTemplateValues(team, ctx);
      const mentionPrefix =
        opts.mention && team.discordRoleId ? `<@&${team.discordRoleId}>\n\n` : '';
      return {
        team,
        kind: 'custom' as const,
        content: (mentionPrefix + renderTemplate(opts.template || '', values))
          .trim()
          .slice(0, TEAM_MESSAGE_MAX),
        deliverable: Boolean(team.discordChannelId),
      };
    });
}

export type SendResult = {
  sent: number;
  skipped: number;
  teams: Array<{
    teamId: string;
    teamName: string;
    status: 'sent' | 'skipped_no_channel' | 'error';
    error?: string;
  }>;
};

/**
 * Émet un event `team.message` par message livrable. L'event part dans
 * l'outbox (at-least-once) : le bot le consomme via push HMAC ou polling, et
 * poste dans `channelId`. Un échec d'émission n'interrompt PAS la boucle — les
 * autres équipes doivent partir quand même, et l'échec est remonté par équipe.
 */
export async function sendTeamMessages(
  messages: RenderedTeamMessage[],
  meta: {
    tenantId?: string;
    tournamentId: string;
    source: 'admin' | 'cron' | 'bot';
    actor?: string | null;
  }
): Promise<SendResult> {
  const result: SendResult = { sent: 0, skipped: 0, teams: [] };

  for (const msg of messages) {
    if (!msg.deliverable || !msg.team.discordChannelId) {
      result.skipped += 1;
      result.teams.push({
        teamId: msg.team.teamId,
        teamName: msg.team.teamName,
        status: 'skipped_no_channel',
      });
      continue;
    }
    try {
      const emitted = await emitBotEvent(
        'team.message',
        {
          teamId: msg.team.teamId,
          teamName: msg.team.teamName,
          channelId: msg.team.discordChannelId,
          roleId: msg.team.discordRoleId,
          content: msg.content,
          // Le contenu porte déjà la mention si demandée ; ce flag dit au bot
          // d'AUTORISER le ping du rôle (sinon allowedMentions le neutralise).
          mentionRole: msg.content.includes(`<@&${msg.team.discordRoleId}>`),
          kind: msg.kind,
          source: meta.source,
          tournamentId: meta.tournamentId,
        },
        meta.tenantId || DEFAULT_TENANT_ID
      );
      // `delivered: false` n'est PAS un échec : l'event est persisté dans
      // l'outbox et le bot le rattrapera au prochain poll. Seul un refus AVANT
      // persistance (tenant manquant) est une vraie erreur.
      if (!emitted.delivered && emitted.error === 'missing_tenant_id') {
        throw new Error(emitted.error);
      }
      result.sent += 1;
      result.teams.push({
        teamId: msg.team.teamId,
        teamName: msg.team.teamName,
        status: 'sent',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        '[teamMessages] emit team.message échec team=%s: %s',
        msg.team.teamId,
        message
      );
      result.teams.push({
        teamId: msg.team.teamId,
        teamName: msg.team.teamName,
        status: 'error',
        error: message,
      });
    }
  }

  return result;
}
