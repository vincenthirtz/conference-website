// Retours affichés après un ajout de membre depuis /admin/teams/my. Extrait de
// la page (lot A7, cf. adminFileSizeGuard).

import { format } from '@/lib/i18n/useAdminT';
import type nsAdminTeamsMy from '@/lib/i18n/locales/admin-fr/adminTeamsMy';

type Dict = typeof nsAdminTeamsMy.fr;
type Toast = [string, 'success' | 'warning'];

/**
 * - Côté staff, l'ajout crée une invitation (cf. utils/teams/staffInvitation.ts) :
 *   rien n'est encore au roster, et le lien privé n'est rendu qu'une fois.
 * - Côté capitaine, l'email de bienvenue est best-effort : on prévient si le
 *   membre a bien été ajouté mais que le mail n'est pas parti.
 */
export function addMemberFeedbackToasts(
  json: {
    invited?: boolean;
    emailSent?: boolean;
    inviteUrl?: string;
    emailWarning?: string;
  } | null,
  t: Dict
): Toast[] {
  const toasts: Toast[] = [];
  if (json?.invited) {
    toasts.push(
      json.emailSent
        ? [t.inviteSent, 'success']
        : [format(t.inviteNoEmail, { url: json.inviteUrl ?? '' }), 'warning']
    );
  }
  if (json?.emailWarning) {
    toasts.push([
      format(t.memberAddedWithWarning, { warning: json.emailWarning }),
      'warning',
    ]);
  }
  return toasts;
}
