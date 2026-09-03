// utils/scrimRequestNotify.ts
//
// Orchestration best-effort des notifications adressées AU CAPITAINE quand une
// demande / création de scrim le concerne : un email, et un message privé
// Discord.
//
// TROIS CANAUX, TROIS RÔLES DIFFÉRENTS. `notifyScrimRequest` (utils/discord.ts)
// poste dans le salon scrims : c'est une annonce, adressée à personne. L'email
// atteint la capitaine, mais une boîte mail se relève rarement le soir. Le DM
// Discord la joint là où elle est déjà — c'est le canal où se joue la vie de
// l'équipe. Les trois coexistent : aucun ne remplace l'autre.
//
// Tout est fail-safe : aucune fonction ne throw. Un échec (capitaine absent,
// email manquant, Brevo down, …) est avalé + loggé, de sorte qu'un appel
// fire-and-forget (`void notify…(…).catch(() => {})`) ne bloque jamais la
// réponse HTTP du handler appelant. Calque le pattern de `utils/checkin.ts`.

import { supabaseAdmin } from './supabase';
import { sendScrimRequestEmail } from './email';
import { emitBotEvent } from './botEvents';
import { getDiscordLinksForUsers } from './discordLinks';
import { logger } from './logger';

const SITE_URL =
  process.env.SITE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.URL ||
  'https://owwomenscup.fr';

/** CTA cible côté site : l'espace capitaine (demandes + scrims). */
const CAPTAIN_CTA_URL = `${SITE_URL.replace(/\/$/, '')}/espace-capitaine`;

/* -----------------------------------------------------------
 * Résolution capitaine → email
 * ---------------------------------------------------------*/

/**
 * Résout le capitaine (`teams.captain_id`) d'une équipe et son email via
 * `auth.admin.getUserById`. Calque `getCaptainEmail` de checkin.ts mais renvoie
 * aussi le nom de l'équipe (utile pour `recipientTeamName`). Renvoie `null` si
 * pas de capitaine ou pas d'email sur le compte.
 */
export async function getTeamCaptainRecipient(
  tenantId: string,
  teamId: string
): Promise<{ email: string; teamName: string } | null> {
  if (!supabaseAdmin) return null;

  try {
    const { data: team } = await supabaseAdmin
      .from('teams')
      .select('name, captain_id')
      .eq('tenant_id', tenantId)
      .eq('id', teamId)
      .maybeSingle();

    if (!team?.captain_id) return null;

    const { data } = await supabaseAdmin.auth.admin.getUserById(
      team.captain_id as string
    );
    const email = data?.user?.email ?? null;
    if (!email) return null;

    return { email, teamName: (team.name as string) || 'ton équipe' };
  } catch (e) {
    logger.error('[scrimNotify] getTeamCaptainRecipient error:', e);
    return null;
  }
}

/**
 * Qui, dans une équipe, doit être prévenu d'un scrim.
 *
 * PAS SEULEMENT LA CAPITAINE. Le manager et la coach organisent autant, voire
 * davantage : une demande qui n'atteint que la capitaine attend qu'elle soit
 * disponible, alors que l'encadrement est souvent le premier à pouvoir
 * répondre. Les trois rôles sont donc destinataires.
 *
 * Le capitaine est lu sur `teams.captain_id` — il peut être NULL, cas légitime
 * d'une équipe créée par un manager — et l'encadrement sur `team_members`.
 */
const NOTIFIED_TEAM_ROLES = ['manager', 'coach'] as const;

export type ScrimRecipient = {
  discordUserId: string;
  /** Sert au log et à distinguer les destinataires d'une même équipe. */
  role: 'captain' | 'manager' | 'coach';
};

/**
 * Résout les destinataires Discord d'une équipe : capitaine + encadrement,
 * dédoublonnés par compte (une même personne peut être capitaine ET manager).
 *
 * Une personne sans compte Discord lié est simplement absente du résultat —
 * cas courant et normal, qui doit rester silencieux : l'email, lui, part de son
 * côté vers la capitaine.
 */
export async function getTeamScrimRecipients(
  tenantId: string,
  teamId: string
): Promise<{ recipients: ScrimRecipient[]; teamName: string } | null> {
  if (!supabaseAdmin) return null;

  try {
    const [teamRes, staffRes] = await Promise.all([
      supabaseAdmin
        .from('teams')
        .select('name, captain_id')
        .eq('tenant_id', tenantId)
        .eq('id', teamId)
        .maybeSingle(),
      supabaseAdmin
        .from('team_members')
        .select('user_id, role')
        .eq('tenant_id', tenantId)
        .eq('team_id', teamId)
        .in('role', NOTIFIED_TEAM_ROLES as unknown as string[]),
    ]);

    const team = teamRes.data;
    if (!team) return null;

    // Rôle par compte, le capitanat primant : c'est le titre qu'on affichera.
    const roleByUser = new Map<string, ScrimRecipient['role']>();
    for (const row of (staffRes.data ?? []) as Array<{
      user_id: string | null;
      role: string | null;
    }>) {
      const userId = row.user_id;
      if (!userId) continue;
      const role = row.role === 'coach' ? 'coach' : 'manager';
      if (!roleByUser.has(userId)) roleByUser.set(userId, role);
    }
    const captainId = (team.captain_id as string | null) ?? null;
    if (captainId) roleByUser.set(captainId, 'captain');

    const userIds = [...roleByUser.keys()];
    if (userIds.length === 0) {
      return { recipients: [], teamName: (team.name as string) || 'ton équipe' };
    }

    const links = await getDiscordLinksForUsers(userIds);
    const recipients: ScrimRecipient[] = [];
    const seen = new Set<string>();
    for (const [userId, role] of roleByUser) {
      const discordUserId = links.get(userId)?.discordUserId;
      // Deux comptes du site peuvent pointer le même Discord : on n'envoie
      // qu'un message.
      if (!discordUserId || seen.has(discordUserId)) continue;
      seen.add(discordUserId);
      recipients.push({ discordUserId, role });
    }

    return { recipients, teamName: (team.name as string) || 'ton équipe' };
  } catch (e) {
    logger.error('[scrimNotify] getTeamScrimRecipients error:', e);
    return null;
  }
}

/** Nom d'une équipe (indépendant du capitaine). Null si introuvable. */
async function getTeamName(
  tenantId: string,
  teamId: string
): Promise<string | null> {
  if (!supabaseAdmin) return null;
  try {
    const { data } = await supabaseAdmin
      .from('teams')
      .select('name')
      .eq('tenant_id', tenantId)
      .eq('id', teamId)
      .maybeSingle();
    return (data?.name as string | undefined) ?? null;
  } catch (e) {
    logger.error('[scrimNotify] getTeamName error:', e);
    return null;
  }
}

/* -----------------------------------------------------------
 * Formatage de date FR (Europe/Paris)
 * ---------------------------------------------------------*/

function formatSingleDateFr(raw: string): string | null {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return d.toLocaleString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Paris',
    });
  } catch {
    return null;
  }
}

/**
 * Formate un créneau (ou une liste de créneaux) en label FR lisible, en
 * timezone Europe/Paris. Pour un tableau, formate le PREMIER créneau et suffixe
 * ` (+N autre(s) créneau(x))` s'il y en a plusieurs. Renvoie `null` si vide ou
 * si aucun créneau valide.
 */
export function formatScrimDateFr(
  input?: string | string[] | null
): string | null {
  if (input == null) return null;

  if (Array.isArray(input)) {
    const slots = input.filter(
      (s): s is string => typeof s === 'string' && s.trim().length > 0
    );
    if (slots.length === 0) return null;
    const first = formatSingleDateFr(slots[0]);
    if (!first) return null;
    const extra = slots.length - 1;
    return extra > 0
      ? `${first} (+${extra} autre${extra > 1 ? 's' : ''} créneau${
          extra > 1 ? 'x' : ''
        })`
      : first;
  }

  if (typeof input !== 'string' || input.trim().length === 0) return null;
  return formatSingleDateFr(input);
}

/* -----------------------------------------------------------
 * Orchestrateurs (best-effort, ne throw jamais)
 * ---------------------------------------------------------*/

/**
 * Émet un message privé Discord à l'encadrement d'une équipe : capitaine,
 * manager et coach.
 *
 * Ne throw jamais. Une personne sans compte Discord lié n'émet rien — ce n'est
 * pas une erreur, juste un canal indisponible pour elle.
 */
async function emitScrimDm(opts: {
  tenantId: string;
  teamId: string;
  opponentName: string;
  dateLabel?: string | null;
  message?: string | null;
  requesterName?: string | null;
  isExternal?: boolean;
  kind: 'request' | 'created';
}): Promise<void> {
  try {
    const resolved = await getTeamScrimRecipients(opts.tenantId, opts.teamId);
    if (!resolved || resolved.recipients.length === 0) return;

    // Un event par destinataire : un DM refusé (DM fermés) n'empêche pas les
    // autres de partir, et le retry ne rejoue que celui qui a échoué.
    await Promise.all(
      resolved.recipients.map((recipient) =>
        emitBotEvent(
          'scrim.request',
          {
            kind: opts.kind,
            captainDiscordUserId: recipient.discordUserId,
            recipientRole: recipient.role,
            recipientTeamName: resolved.teamName,
            opponentName: opts.opponentName,
            dateLabel: opts.dateLabel ?? null,
            message: opts.message ?? null,
            requesterName: opts.requesterName ?? null,
            isExternal: opts.isExternal ?? false,
            ctaUrl: CAPTAIN_CTA_URL,
          },
          opts.tenantId
        )
      )
    );
  } catch (e) {
    logger.error('[scrimNotify] emitScrimDm error:', e);
  }
}

/**
 * Demande de scrim dirigée (site) → messages privés Discord à l'encadrement de
 * l'équipe CIBLE. Pendant de `notifyScrimRequestEmail`, appelé aux mêmes
 * endroits — à ceci près que l'email ne va qu'à la capitaine, faute d'adresse
 * connue pour les autres rôles.
 */
export async function notifyScrimRequestDm(opts: {
  tenantId: string;
  targetTeamId: string;
  opponentName: string;
  dateLabel?: string | null;
  message?: string | null;
  requesterName?: string | null;
  isExternal?: boolean;
}): Promise<void> {
  await emitScrimDm({
    tenantId: opts.tenantId,
    teamId: opts.targetTeamId,
    opponentName: opts.opponentName,
    dateLabel: opts.dateLabel,
    message: opts.message,
    requesterName: opts.requesterName,
    isExternal: opts.isExternal,
    kind: 'request',
  });
}

/**
 * Scrim créé par un admin via le bot → messages privés à l'encadrement des
 * DEUX équipes. Pendant de `notifyAdminScrimEmails`.
 */
export async function notifyAdminScrimDms(opts: {
  tenantId: string;
  team1Id: string;
  team2Id: string;
  dateLabel?: string | null;
}): Promise<void> {
  const sendFor = async (teamId: string, otherTeamId: string) => {
    // Le nom de l'adversaire ne dépend pas de SON capitaine : une équipe sans
    // compte Discord lié reste nommable dans le DM de l'autre.
    const otherName = await getTeamName(opts.tenantId, otherTeamId);
    await emitScrimDm({
      tenantId: opts.tenantId,
      teamId,
      opponentName: otherName || 'une autre équipe',
      dateLabel: opts.dateLabel,
      kind: 'created',
    });
  };

  await Promise.all([
    sendFor(opts.team1Id, opts.team2Id),
    sendFor(opts.team2Id, opts.team1Id),
  ]);
}

/**
 * Demande de scrim dirigée (site) → email au capitaine de l'équipe CIBLE
 * uniquement. `recipientTeamName` provient du nom résolu de `targetTeamId`.
 */
export async function notifyScrimRequestEmail(opts: {
  tenantId: string;
  targetTeamId: string;
  opponentName: string;
  dateLabel?: string | null;
  message?: string | null;
  requesterName?: string | null;
  isExternal?: boolean;
}): Promise<void> {
  try {
    const recipient = await getTeamCaptainRecipient(
      opts.tenantId,
      opts.targetTeamId
    );
    if (!recipient) return;

    await sendScrimRequestEmail({
      to: recipient.email,
      recipientTeamName: recipient.teamName,
      opponentName: opts.opponentName,
      dateLabel: opts.dateLabel ?? null,
      message: opts.message ?? null,
      requesterName: opts.requesterName ?? null,
      isExternal: opts.isExternal ?? false,
      ctaUrl: CAPTAIN_CTA_URL,
      kind: 'request',
    });
  } catch (e) {
    logger.error('[scrimNotify] notifyScrimRequestEmail error:', e);
  }
}

/**
 * Scrim créé par un admin via le bot → email aux capitaines des DEUX équipes.
 * Chaque envoi est indépendant : si un capitaine manque (pas de capitaine ou
 * pas d'email), l'autre part quand même. `opponentName` = nom de l'AUTRE équipe.
 */
export async function notifyAdminScrimEmails(opts: {
  tenantId: string;
  team1Id: string;
  team2Id: string;
  dateLabel?: string | null;
}): Promise<void> {
  const dateLabel = opts.dateLabel ?? null;

  const sendFor = async (teamId: string, otherTeamId: string) => {
    try {
      // Le nom de l'adversaire est résolu indépendamment de son capitaine :
      // même si l'autre équipe n'a ni capitaine ni email, on connaît son nom.
      const [recipient, otherName] = await Promise.all([
        getTeamCaptainRecipient(opts.tenantId, teamId),
        getTeamName(opts.tenantId, otherTeamId),
      ]);
      if (!recipient) return;

      await sendScrimRequestEmail({
        to: recipient.email,
        recipientTeamName: recipient.teamName,
        opponentName: otherName ?? "l'équipe adverse",
        dateLabel,
        ctaUrl: CAPTAIN_CTA_URL,
        kind: 'scheduled',
      });
    } catch (e) {
      logger.error('[scrimNotify] notifyAdminScrimEmails send error:', e);
    }
  };

  // Les deux envois sont indépendants (Promise.allSettled ne rejette jamais).
  await Promise.allSettled([
    sendFor(opts.team1Id, opts.team2Id),
    sendFor(opts.team2Id, opts.team1Id),
  ]);
}
