// utils/tcg/grantTournamentParticipation.ts
//
// Récompense de PARTICIPATION d'une équipe sortie en DNF : chaque joueuse de
// l'équipe pour ce tournoi reçoit `TOURNAMENT_PARTICIPATION_COINS` (1000), puis
// UN message annonce le gain dans le salon Discord de l'équipe (event bot
// `team.message`, `kind: 'tcg_participation'`).
//
// « DNF » = `stage_teams.disqualified_at` posé sur une phase du tournoi
// (badge « DNF » des classements). C'est la seule définition du modèle.
//
// QUAND. À la disqualification (`features/admin/stages/service/disqualify.ts`),
// une fois les matchs restants traités : c'est le geste qui CLÔT la
// participation de l'équipe. On n'attend PAS la clôture du tournoi — l'équipe
// ne jouera plus, et un tournoi peut durer des semaines après son abandon.
// La route admin `POST /api/admin/stages/[stageId]/participation-reward`
// rejoue la même règle pour une équipe DÉJÀ en DNF (rattrapage, ou migration
// passée après coup).
//
// QUI. Les joueuses qui ont figuré sur une feuille de match de l'équipe dans
// CE tournoi (`match_participants`, titulaires ET remplaçantes : la
// récompense paie la participation, pas une performance — à la différence du
// palmarès, aligné sur le badge). C'est le roster FIGÉ du tournoi : il paie
// une joueuse partie depuis et ignore une recrue arrivée après l'abandon. Si
// l'équipe n'a aucune feuille de match (abandon avant son premier match), on
// se rabat sur les membres actuels hors encadrement (coach / manager) : c'est
// alors le seul roster connu, et l'abandon vient de geler l'équipe.
// L'ENCADREMENT (coach, manager) est payé en plus, dans les deux cas — mêmes
// récompenses que les joueuses depuis le 2026-10-24 (cf. `teamStaff.ts`) —
// pourvu qu'il y ait au moins une joueuse à payer.
//
// IDEMPOTENCE.
//   - Pièces : `source_ref` = le tournoi + UNIQUE du registre. Un rejeu ne
//     recrédite personne (`grantCoinsThenPacks` ne rend que les lignes
//     insérées).
//   - Message : envoyé SEULEMENT si cet appel a crédité au moins une joueuse
//     (garde durable, portée par le registre), et sous une `idempotencyKey`
//     `tcg.participation:<tournoi>:<équipe>` (garde contre deux déclenchements
//     simultanés). Un rejeu ne reposte donc rien.
//   ⚠️ Revers assumé : si le message se perd (ni outbox ni push), un rejeu ne
//   le renverra pas — le compte rendu le dit (`message: 'error'`) et le staff
//   peut poster à la main (/admin/team-messages, gabarit libre).
//
// NE LÈVE JAMAIS : la disqualification ne doit pas échouer sur une récompense.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { emitBotEvent } from '@/utils/botEvents';
import { absoluteSiteUrl } from '@/utils/siteUrl';
import { isNonPlayingTeamRole } from '@/utils/teams/roleKind';
import { getEarnSource, TOURNAMENT_PARTICIPATION_COINS } from './earnSources';
import { grantCoinsThenPacks } from './grantCoinsThenPacks';
import { readTeamStaff } from './teamStaff';

const WALLET_SOURCE_KIND = 'tournament_participation';
export const PARTICIPATION_MESSAGE_KIND = 'tcg_participation';

const PAGE_SIZE = 1000;
const MAX_PAGES = 20;

export type ParticipationMessageStatus =
  /** Event `team.message` persisté / poussé. */
  | 'sent'
  /** Rien de nouveau crédité : déjà annoncé (ou rien à annoncer). */
  | 'skipped'
  /** Déjà émis sous la même clé (déclenchement concurrent). */
  | 'duplicate'
  /** L'équipe n'a pas de salon Discord provisionné. */
  | 'no_channel'
  | 'error';

export type ParticipationRewardReport = {
  status:
    | 'granted'
    /** Aucune joueuse avec un compte, ou toutes déjà créditées. */
    | 'nothing'
    /** L'équipe n'est disqualifiée d'aucune phase du tournoi. */
    | 'not_dnf'
    /** `schemaReady: false` au registre. */
    | 'not_ready'
    | 'error';
  /** Montant par joueuse. */
  coins: number;
  /** Joueuses éligibles (dédoublonnées). */
  eligible: number;
  /** Créditées PAR CET APPEL. 0 sur un rejeu. */
  granted: number;
  /** D'où vient la liste des joueuses. */
  rosterSource: 'match_participants' | 'team_members' | null;
  message: ParticipationMessageStatus;
};

const report = (
  status: ParticipationRewardReport['status'],
  over: Partial<Omit<ParticipationRewardReport, 'status'>> = {}
): ParticipationRewardReport => ({
  status,
  coins: TOURNAMENT_PARTICIPATION_COINS,
  eligible: 0,
  granted: 0,
  rosterSource: null,
  message: 'skipped',
  ...over,
});

type TeamRow = {
  id: string;
  name: string | null;
  discord_channel_id: string | null;
  discord_role_id: string | null;
  preferred_locale: string | null;
};

/** L'équipe est-elle disqualifiée d'au moins une phase de ce tournoi ? */
async function isDnfInTournament(
  tenantId: string,
  tournamentId: string,
  teamId: string
): Promise<boolean | null> {
  const { data: stages, error: stagesErr } = await supabaseAdmin
    .from('tournament_stages')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId);
  if (stagesErr) {
    logger.error(
      '[tcg/participation] phases illisibles: %s',
      stagesErr.message
    );
    return null;
  }
  const stageIds = ((stages ?? []) as Array<{ id: string }>).map((s) => s.id);
  if (stageIds.length === 0) return false;
  const { data, error } = await supabaseAdmin
    .from('stage_teams')
    .select('stage_id, disqualified_at')
    .eq('tenant_id', tenantId)
    .eq('team_id', teamId)
    .in('stage_id', stageIds);
  if (error) {
    logger.error(
      '[tcg/participation] inscriptions illisibles: %s',
      error.message
    );
    return null;
  }
  return ((data ?? []) as Array<{ disqualified_at: string | null }>).some(
    (row) => Boolean(row.disqualified_at)
  );
}

/** Joueuses des feuilles de match de l'équipe sur ce tournoi. `null` = échec. */
async function readParticipants(
  tenantId: string,
  tournamentId: string,
  teamId: string
): Promise<string[] | null> {
  const users = new Set<string>();
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const { data, error } = await supabaseAdmin
      .from('match_participants')
      .select('id, user_id')
      .eq('tenant_id', tenantId)
      .eq('tournament_id', tournamentId)
      .eq('team_id', teamId)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      logger.error(
        '[tcg/participation] participations illisibles: %s',
        error.message
      );
      return null;
    }
    const rows = (data ?? []) as Array<{ user_id: string | null }>;
    for (const row of rows) if (row.user_id) users.add(row.user_id);
    if (rows.length < PAGE_SIZE) return [...users];
  }
  logger.error('[tcg/participation] lecture tronquée — abandon');
  return null;
}

/** Repli : membres actuels hors encadrement. `null` = échec. */
async function readCurrentPlayers(
  tenantId: string,
  teamId: string
): Promise<string[] | null> {
  const { data, error } = await supabaseAdmin
    .from('team_members')
    .select('user_id, role')
    .eq('tenant_id', tenantId)
    .eq('team_id', teamId);
  if (error) {
    logger.error('[tcg/participation] roster illisible: %s', error.message);
    return null;
  }
  const users = new Set<string>();
  for (const row of (data ?? []) as Array<{
    user_id: string | null;
    role: string | null;
  }>) {
    if (row.user_id && !isNonPlayingTeamRole(row.role)) users.add(row.user_id);
  }
  return [...users];
}

async function readTeam(
  tenantId: string,
  teamId: string
): Promise<TeamRow | null> {
  const { data, error } = await supabaseAdmin
    .from('teams')
    .select('id, name, discord_channel_id, discord_role_id, preferred_locale')
    .eq('tenant_id', tenantId)
    .eq('id', teamId)
    .maybeSingle();
  if (error) {
    logger.error('[tcg/participation] équipe illisible: %s', error.message);
    return null;
  }
  return (data as TeamRow | null) ?? null;
}

async function readTournamentName(
  tenantId: string,
  tournamentId: string
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('tournaments')
    .select('name')
    .eq('tenant_id', tenantId)
    .eq('id', tournamentId)
    .maybeSingle();
  if (error) return null;
  const name = (data as { name?: unknown } | null)?.name;
  return typeof name === 'string' && name.trim() ? name.trim() : null;
}

/**
 * Texte du message d'équipe. Suit `teams.preferred_locale` (fr par défaut),
 * comme les messages de check-in.
 */
export function buildParticipationMessage(input: {
  locale: 'fr' | 'en';
  teamName: string;
  tournamentName: string | null;
  coins: number;
  players: number;
  url: string;
}): string {
  const coins = input.coins.toLocaleString(
    input.locale === 'en' ? 'en-US' : 'fr-FR'
  );
  if (input.locale === 'en') {
    const tournament = input.tournamentName
      ? `**${input.tournamentName}**`
      : 'the tournament';
    return [
      `🎁 **${input.teamName}**, thank you for taking part in ${tournament}!`,
      `Each team member (${input.players}) receives **${coins} coins** for the card game as a participation reward.`,
      `They are already in your wallet: ${input.url}`,
    ].join('\n');
  }
  const tournament = input.tournamentName
    ? `à **${input.tournamentName}**`
    : 'au tournoi';
  return [
    `🎁 **${input.teamName}**, merci d'avoir participé ${tournament} !`,
    `Chaque membre de l'équipe (${input.players}) reçoit **${coins} pièces** pour le jeu de cartes, en récompense de sa participation.`,
    `Elles sont déjà dans votre portefeuille : ${input.url}`,
  ].join('\n');
}

export async function grantTournamentParticipation(input: {
  tenantId: string;
  tournamentId: string;
  teamId: string;
  /** Qui a déclenché (journal du bot). */
  source?: 'admin' | 'cron' | 'bot';
}): Promise<ParticipationRewardReport> {
  const { tenantId, tournamentId, teamId } = input;
  if (!supabaseAdmin || !tenantId || !tournamentId || !teamId) {
    return report('error');
  }
  if (!getEarnSource(WALLET_SOURCE_KIND)?.schemaReady) {
    return report('not_ready');
  }

  try {
    const dnf = await isDnfInTournament(tenantId, tournamentId, teamId);
    if (dnf === null) return report('error');
    if (!dnf) return report('not_dnf');

    let rosterSource: ParticipationRewardReport['rosterSource'] =
      'match_participants';
    let users = await readParticipants(tenantId, tournamentId, teamId);
    if (users === null) return report('error');
    if (users.length === 0) {
      rosterSource = 'team_members';
      users = await readCurrentPlayers(tenantId, teamId);
      if (users === null) return report('error');
    }
    if (users.length === 0) return report('nothing', { rosterSource });

    const staff = await readTeamStaff(tenantId, [teamId]);
    if (staff === null) return report('error', { rosterSource });
    users = [...new Set([...users, ...(staff.get(teamId) ?? [])])];

    const result = await grantCoinsThenPacks({
      tenantId,
      walletSourceKind: WALLET_SOURCE_KIND,
      packSourceKind: null,
      grants: users.map((userId) => ({
        userId,
        sourceRef: tournamentId,
        coins: TOURNAMENT_PARTICIPATION_COINS,
        packs: 0,
      })),
    });
    if (!result.ok) {
      logger.error(
        '[tcg/participation] crédit refusé (équipe %s): %s',
        teamId,
        result.message
      );
      return report('error', { eligible: users.length, rosterSource });
    }

    const granted = result.credited.length;
    const base = { eligible: users.length, granted, rosterSource };
    if (granted === 0) return report('nothing', base);

    const message = await announce({
      tenantId,
      tournamentId,
      teamId,
      players: users.length,
      source: input.source ?? 'admin',
    });
    return report('granted', { ...base, message });
  } catch (err) {
    logger.error(
      '[tcg/participation] récompense impossible (équipe %s): %s',
      teamId,
      err instanceof Error ? err.message : String(err)
    );
    return report('error');
  }
}

async function announce(input: {
  tenantId: string;
  tournamentId: string;
  teamId: string;
  players: number;
  source: 'admin' | 'cron' | 'bot';
}): Promise<ParticipationMessageStatus> {
  const [team, tournamentName] = await Promise.all([
    readTeam(input.tenantId, input.teamId),
    readTournamentName(input.tenantId, input.tournamentId),
  ]);
  if (!team) return 'error';
  if (!team.discord_channel_id) return 'no_channel';

  const teamName = team.name?.trim() || 'Équipe';
  const content = buildParticipationMessage({
    locale: team.preferred_locale === 'en' ? 'en' : 'fr',
    teamName,
    tournamentName,
    coins: TOURNAMENT_PARTICIPATION_COINS,
    players: input.players,
    // Absolue : le lien part sur Discord.
    url: absoluteSiteUrl('/player/tcg'),
  });

  const emitted = await emitBotEvent(
    'team.message',
    {
      teamId: team.id,
      teamName,
      channelId: team.discord_channel_id,
      roleId: team.discord_role_id,
      content,
      mentionRole: false,
      kind: PARTICIPATION_MESSAGE_KIND,
      source: input.source,
      tournamentId: input.tournamentId,
    },
    input.tenantId,
    {
      idempotencyKey: `tcg.participation:${input.tournamentId}:${input.teamId}`,
    }
  );
  if (emitted.duplicate) return 'duplicate';
  if (
    emitted.error === 'missing_tenant_id' ||
    emitted.error?.startsWith('event_lost')
  ) {
    logger.error(
      '[tcg/participation] message perdu (équipe %s): %s',
      input.teamId,
      emitted.error
    );
    return 'error';
  }
  return 'sent';
}
