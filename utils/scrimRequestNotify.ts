// utils/scrimRequestNotify.ts
//
// Orchestration best-effort de la notification EMAIL des capitaines quand une
// demande / création de scrim les concerne. S'AJOUTE à la notif Discord
// existante (`notifyScrimRequest`), ne la remplace pas.
//
// Tout est fail-safe : aucune fonction ne throw. Un échec (capitaine absent,
// email manquant, Brevo down, …) est avalé + loggé, de sorte qu'un appel
// fire-and-forget (`void notify…(…).catch(() => {})`) ne bloque jamais la
// réponse HTTP du handler appelant. Calque le pattern de `utils/checkin.ts`.

import { supabaseAdmin } from './supabase';
import { sendScrimRequestEmail } from './email';
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
