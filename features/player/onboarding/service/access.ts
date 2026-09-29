// features/player/onboarding/service/access.ts — étape 6 : prévenir les
// membres insérés et ouvrir à la créatrice l'accès à son espace équipe.
//
// PONT MAGIC-LINK : la créatrice vient d'être insérée mais n'a PAS de session
// (parcours anonyme). On lui envoie un lien de connexion Supabase vers
// /auth/team-access, qui la dépose sur /player/manage-team. Best-effort : un
// échec (lien ou envoi) ne fait JAMAIS échouer la création. Même motif que
// forgot-password.ts : pas l'`action_link` (code PKCE non échangeable côté
// client) mais `hashed_token`, vérifié par la page (verifyOtp). Le jeton
// n'est jamais renvoyé au client — seul l'e-mail MASQUÉ l'est.

import { sendTeamAccessEmail, sendTeamJoinEmail } from '@/utils/email';
import type { CreatedMember } from '../schemas';
import type { OnboardingCtx } from './context';
import type { ResolvedAccounts } from './accounts';

// Même convention que utils/email.ts / forgot-password.ts.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.SITE_URL ||
  'https://owwomenscup.fr';

/**
 * Atterrissage de la capitaine : `welcome=1` ouvre la carte d'onboarding
 * Battle.net de /player/manage-team (inerte ailleurs).
 */
const CAPTAIN_LANDING = '/player/manage-team?welcome=1';
/** Le manager ne joue pas : pas de carte Battle.net. */
const MANAGER_LANDING = '/player/manage-team';

/** "alice@domain.com" → "a***@domain.com". */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1) || '*'}***@${domain}`;
}

/** user_id → e-mail saisi (roster + manager). */
export function emailsByUser(
  accounts: ResolvedAccounts,
  managerEmail: string | null
): Map<string, string> {
  const map = new Map<string, string>();
  for (const rec of accounts.records) {
    if (rec.email) map.set(rec.user_id, rec.email);
  }
  if (accounts.managerUserId && managerEmail) {
    map.set(accounts.managerUserId, managerEmail);
  }
  return map;
}

/** « Tu as rejoint l'équipe » aux insérés — hors créatrice (lien dédié). */
export function notifyInsertedMembers(
  ctx: OnboardingCtx,
  teamName: string,
  inserted: CreatedMember[],
  emails: Map<string, string>,
  creatorUserId: string | null
): void {
  for (const m of inserted) {
    if (creatorUserId !== null && m.user_id === creatorUserId) continue;
    const email = emails.get(m.user_id);
    if (!email) continue;
    sendTeamJoinEmail(email, teamName, m.role, ctx.tenantId).catch((err) => {
      ctx.logger.error('[create-with-member] team join email error:', err);
    });
  }
}

export async function sendCreatorAccess(
  ctx: OnboardingCtx,
  team: { id: string; name: string },
  accounts: ResolvedAccounts,
  emails: Map<string, string>
): Promise<{ sent: boolean; to?: string }> {
  const { creatorUserId, managerUserId } = accounts;
  if (!creatorUserId) return { sent: false };
  const creatorEmail = emails.get(creatorUserId) || null;
  if (!creatorEmail) return { sent: false };
  const landing = managerUserId ? MANAGER_LANDING : CAPTAIN_LANDING;

  try {
    const redirectTo = `${SITE_URL}/auth/team-access?next=${encodeURIComponent(
      landing
    )}`;
    const { data, error } = await ctx.db.auth.admin.generateLink({
      type: 'magiclink',
      email: creatorEmail,
      options: { redirectTo },
    });
    const tokenHash = data?.properties?.hashed_token;
    if (error || !tokenHash) {
      ctx.logger.error(
        '[create-with-member] creator magic-link generateLink failed',
        { teamId: team.id, error: error?.message ?? 'no token' }
      );
      return { sent: false };
    }
    const actionLink = `${SITE_URL}/auth/team-access?token_hash=${encodeURIComponent(
      tokenHash
    )}&type=magiclink&next=${encodeURIComponent(landing)}`;
    // Fire-and-forget : un échec d'envoi ne bloque pas la création.
    sendTeamAccessEmail({
      tenantId: ctx.tenantId,
      to: creatorEmail,
      teamName: team.name,
      actionLink,
    }).catch(() => {});
    return { sent: true, to: maskEmail(creatorEmail) };
  } catch (e) {
    ctx.logger.error('[create-with-member] creator magic-link bridge crash', {
      teamId: team.id,
      error: e instanceof Error ? e.message : String(e),
    });
    return { sent: false };
  }
}
