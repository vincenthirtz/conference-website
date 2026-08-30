// GET /api/bot/v1/reconcile/team-channels
//
// Retourne la liste des équipes ACTIVES du tenant avec leurs IDs Discord
// (rôle, salon texte, salon vocal), l'ID Discord de leur capitaine, et pour
// chaque équipe la liste de ses membres résolus vers leur ID Discord.
//
// Un cron quotidien côté bot itère sur cette liste pour réconcilier l'état
// Discord (rôles d'équipe assignés aux bonnes joueuses, permissions de salon,
// membres qui ont quitté, etc.). Les membres SANS lien Discord (aucune row
// `user_discord_links`) sont omis : le bot ne peut pas agir sur eux.
//
// Auth : x-api-key (per-tenant). Pas d'actor Discord requis.
//
// Pagination : query ?limit=N (default 200, max 500) + ?offset=M. Les membres
// et liens Discord ne sont chargés que pour la PAGE d'équipes courante.

import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { logger } from '@/utils/logger';

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

type TeamRow = {
  id: string;
  name: string | null;
  slug: string | null;
  discord_role_id: string | null;
  discord_channel_id: string | null;
  discord_voice_channel_id: string | null;
  captain_id: string | null;
};

type MemberRow = {
  user_id: string | null;
  team_id: string | null;
  role: string | null;
  is_substitute: boolean | null;
};

/**
 * Ids de salons Discord connus du site — TOUTES les équipes du tenant, quel que
 * soit leur état et leur inscription.
 *
 * Répond à « ce salon est-il légitime ? », et à rien d'autre. `teams` (plus bas)
 * répond à « à qui provisionner ? » et reste étroitement scopé. C'est d'avoir
 * confondu les deux qu'est né un incident : le cron a détruit les salons
 * d'Eclypse, équipe active dont l'inscription était encore en attente.
 *
 * Aucun filtre `is_active` : une équipe dissoute garde ses salons (le bot ne
 * supprime jamais, il demande une décision staff), ils restent donc connus. Et
 * une vieille équipe hors tournoi n'est pas « orpheline » : elle n'est
 * simplement plus entretenue.
 */
async function loadKnownChannelIds(tenantId: string): Promise<string[] | null> {
  const { data, error } = await supabaseAdmin
    .from('teams')
    .select('discord_channel_id, discord_voice_channel_id')
    .eq('tenant_id', tenantId);

  if (error) {
    logger.error(
      '[reconcile/team-channels] known channels lookup error',
      error
    );
    // `null` = « je ne sais pas ». Le bot doit alors s'abstenir plutôt que de
    // traiter l'inconnu comme un vide.
    return null;
  }

  const ids = new Set<string>();
  for (const row of (data ?? []) as Array<{
    discord_channel_id: string | null;
    discord_voice_channel_id: string | null;
  }>) {
    if (row.discord_channel_id) ids.add(row.discord_channel_id);
    if (row.discord_voice_channel_id) ids.add(row.discord_voice_channel_id);
  }
  return [...ids];
}

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const tenantId = req.botContext.tenantId;

  // Un tournoi EN COURS (status='running') → le bot NE doit PAS réconcilier les
  // salons (création/suppression/permissions pourraient perturber les matchs en
  // cours). On expose le flag ; le cron saute entièrement le run si true.
  const { count: runningCount, error: runningErr } = await supabaseAdmin
    .from('tournaments')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'running');
  if (runningErr) {
    logger.error(
      '[reconcile/team-channels] tournaments lookup error',
      runningErr
    );
    return res
      .status(500)
      .json({ error: 'Erreur lors de la vérification des tournois.' });
  }
  const tournamentInProgress = (runningCount ?? 0) > 0;

  // SCOPING : seules les équipes INSCRITES au tournoi féminin de l'ANNÉE EN
  // COURS sont provisionnées côté Discord. On résout le tournoi de l'année
  // (running prioritaire, sinon le plus récent de l'année parmi
  // running/published/completed), puis ses équipes inscrites via
  // tournament_teams. Aucun tournoi de l'année → aucune équipe renvoyée.
  const currentYear = new Date().getFullYear();
  const { data: tourneyRows, error: tourneyErr } = await supabaseAdmin
    .from('tournaments')
    .select('id, status, start_date, end_date')
    .eq('tenant_id', tenantId)
    .in('status', ['running', 'published', 'completed']);
  if (tourneyErr) {
    logger.error(
      '[reconcile/team-channels] tournaments year lookup error',
      tourneyErr
    );
    return res
      .status(500)
      .json({ error: 'Erreur lors de la vérification des tournois.' });
  }
  const yearTourneys = (
    (tourneyRows ?? []) as Array<{
      id: string;
      status: string;
      start_date: string | null;
      end_date: string | null;
    }>
  ).filter((t) => {
    const sy = t.start_date ? new Date(t.start_date).getFullYear() : null;
    const ey = t.end_date ? new Date(t.end_date).getFullYear() : null;
    return sy === currentYear || ey === currentYear;
  });
  const pickedTournament =
    yearTourneys.find((t) => t.status === 'running') ??
    yearTourneys
      .slice()
      .sort((a, b) =>
        String(a.start_date ?? '').localeCompare(String(b.start_date ?? ''))
      )
      .pop() ??
    null;

  let registeredTeamIds: string[] = [];
  if (pickedTournament) {
    const { data: ttRows, error: ttErr } = await supabaseAdmin
      .from('tournament_teams')
      .select('team_id')
      .eq('tenant_id', tenantId)
      .eq('tournament_id', pickedTournament.id);
    if (ttErr) {
      logger.error(
        '[reconcile/team-channels] tournament_teams lookup error',
        ttErr
      );
      return res
        .status(500)
        .json({ error: 'Erreur lors du chargement des équipes inscrites.' });
    }
    registeredTeamIds = Array.from(
      new Set(
        (ttRows ?? [])
          .map((r) => (r as { team_id?: string | null }).team_id)
          .filter((id): id is string => Boolean(id))
      )
    );
  }

  // Une équipe dont l'inscription est DÉPOSÉE mais pas encore validée est déjà
  // une équipe du tournoi : elle recrute, elle a ses salons, elle attend juste
  // une décision staff. L'exclure du champ du cron, c'est la laisser sans
  // entretien ET sans réparation — c'est exactement ce qui a fait qu'Eclypse a
  // perdu ses salons sans que rien ne les recrée.
  //
  // On reste donc strictement sur le tournoi de l'année : une vieille équipe
  // hors tournoi (ni inscrite, ni candidate) n'entre pas ici et ne se verra
  // jamais provisionner de salons.
  let pendingTeamIds: string[] = [];
  if (pickedTournament) {
    const { data: pendingRows, error: pendingErr } = await supabaseAdmin
      .from('demandes')
      .select('team_id')
      .eq('tenant_id', tenantId)
      .eq('tournament_id', pickedTournament.id)
      .eq('type', 'team_registration')
      .eq('status', 'pending');
    if (pendingErr) {
      logger.error(
        '[reconcile/team-channels] pending registrations lookup error',
        pendingErr
      );
      return res.status(500).json({
        error: 'Erreur lors du chargement des inscriptions en attente.',
      });
    }
    pendingTeamIds = (pendingRows ?? [])
      .map((r) => (r as { team_id?: string | null }).team_id)
      .filter((id): id is string => Boolean(id));
  }

  const knownChannelIds = await loadKnownChannelIds(tenantId);
  const scopedTeamIds = Array.from(
    new Set([...registeredTeamIds, ...pendingTeamIds])
  );

  const limitRaw = Number(req.query.limit);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.floor(limitRaw), 1), MAX_LIMIT)
    : DEFAULT_LIMIT;
  const offsetRaw = Number(req.query.offset);
  const offset = Number.isFinite(offsetRaw)
    ? Math.max(Math.floor(offsetRaw), 0)
    : 0;

  // Aucune équipe inscrite au tournoi de l'année → réponse vide (le bot ne
  // provisionne rien et, ensemble connu vide, le nettoyage est neutralisé par
  // sa garde de sécurité côté cron).
  if (scopedTeamIds.length === 0) {
    // Rien à entretenir ne veut pas dire « aucun salon légitime » : on renvoie
    // quand même l'ensemble connu, sans quoi le signalement prendrait des
    // salons parfaitement valides pour des orphelins.
    return res.status(200).json({
      tournamentInProgress,
      teams: [],
      knownChannelIds,
      limit,
      offset,
      count: 0,
    });
  }

  // 1. Équipes ACTIVES du tenant à entretenir : inscrites au tournoi de l'année
  // OU déjà provisionnées (cf. `scopedTeamIds`), paginées et ordonnées.
  const { data: teamsRaw, error: teamErr } = await supabaseAdmin
    .from('teams')
    .select(
      'id, name, slug, discord_role_id, discord_channel_id, discord_voice_channel_id, captain_id'
    )
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .in('id', scopedTeamIds)
    .order('id', { ascending: true })
    .range(offset, offset + limit - 1);
  if (teamErr) {
    logger.error('[reconcile/team-channels] teams lookup error', teamErr);
    return res
      .status(500)
      .json({ error: 'Erreur lors du chargement des équipes.' });
  }
  const teams = (teamsRaw ?? []) as TeamRow[];
  const teamIds = teams.map((t) => t.id);

  // 2. Membres de la page d'équipes courante.
  let members: MemberRow[] = [];
  if (teamIds.length > 0) {
    const { data: membersRaw, error: memberErr } = await supabaseAdmin
      .from('team_members')
      .select('user_id, team_id, role, is_substitute')
      .eq('tenant_id', tenantId)
      .in('team_id', teamIds);
    if (memberErr) {
      logger.error('[reconcile/team-channels] members lookup error', memberErr);
      return res
        .status(500)
        .json({ error: 'Erreur lors du chargement des membres.' });
    }
    members = (membersRaw ?? []) as MemberRow[];
  }

  // 3. Résolution des IDs Discord. On collecte tous les auth user ids (membres
  //    + capitaines) puis un seul lookup sur `user_discord_links`. Cette table
  //    est GLOBALE (pas de colonne tenant_id) : on NE filtre PAS par tenant.
  const authUserIds = new Set<string>();
  for (const m of members) {
    if (m.user_id) authUserIds.add(m.user_id);
  }
  for (const t of teams) {
    if (t.captain_id) authUserIds.add(t.captain_id);
  }

  const discordByUserId = new Map<string, string>();
  if (authUserIds.size > 0) {
    const { data: linksRaw, error: linkErr } = await supabaseAdmin
      .from('user_discord_links')
      .select('auth_user_id, discord_user_id')
      .in('auth_user_id', [...authUserIds]);
    if (linkErr) {
      logger.error('[reconcile/team-channels] links lookup error', linkErr);
      return res
        .status(500)
        .json({ error: 'Erreur lors du chargement des liens Discord.' });
    }
    for (const row of (linksRaw ?? []) as Array<{
      auth_user_id: string | null;
      discord_user_id: string | null;
    }>) {
      if (row.auth_user_id && row.discord_user_id) {
        discordByUserId.set(row.auth_user_id, row.discord_user_id);
      }
    }
  }

  // 4. Construction de la réponse.
  const membersByTeam = new Map<string, MemberRow[]>();
  for (const m of members) {
    if (!m.team_id) continue;
    const list = membersByTeam.get(m.team_id) ?? [];
    list.push(m);
    membersByTeam.set(m.team_id, list);
  }

  const payloadTeams = teams.map((team) => {
    const captainDiscordUserId = team.captain_id
      ? (discordByUserId.get(team.captain_id) ?? null)
      : null;

    const seen = new Set<string>();
    const teamMembers: Array<{
      discordUserId: string;
      isCaptain: boolean;
      isSubstitute: boolean;
    }> = [];
    for (const m of membersByTeam.get(team.id) ?? []) {
      if (!m.user_id) continue;
      const discordUserId = discordByUserId.get(m.user_id);
      // Membre sans lien Discord → omis (le bot ne peut pas agir dessus).
      if (!discordUserId) continue;
      // Dédup par discordUserId (une joueuse ne peut apparaître qu'une fois).
      if (seen.has(discordUserId)) continue;
      seen.add(discordUserId);
      teamMembers.push({
        discordUserId,
        isCaptain: m.user_id === team.captain_id,
        isSubstitute: m.is_substitute === true,
      });
    }

    return {
      teamId: team.id,
      name: team.name,
      slug: team.slug,
      discordRoleId: team.discord_role_id ?? null,
      discordChannelId: team.discord_channel_id ?? null,
      discordVoiceChannelId: team.discord_voice_channel_id ?? null,
      captainDiscordUserId,
      members: teamMembers,
    };
  });

  return res.status(200).json({
    tournamentInProgress,
    teams: payloadTeams,
    // Exhaustif et NON paginé : c'est un ensemble de référence pour le
    // nettoyage, pas une page de travail. `null` si la lecture a échoué —
    // le bot s'abstient alors de supprimer quoi que ce soit.
    knownChannelIds,
    limit,
    offset,
    count: payloadTeams.length,
  });
}

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 30, key: 'bot-reconcile-team-channels' },
  idempotent: false,
});
