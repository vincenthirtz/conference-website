// features/player/team/ui/SentInvitationsPanel.tsx — invitations envoyées,
// en attente de réponse. Placée AVANT les demandes entrantes : elle répond à
// « où sont passées les joueuses que je viens de saisir ? ». Relancer
// repousse l'expiration ET refait un lien — pour toute invitation, e-mail ou
// non (Discord, banque de joueuses).

import { Card } from '@/features/ruban';
import { format } from '@/lib/i18n/useT';
import type { SentInvitationDto } from '../schemas';
import type { ManageTeamTexts } from '../hooks/useManageTeamScreen';

export default function SentInvitationsPanel({
  t,
  locale,
  invitations,
  failed,
  editable,
  actionLoading,
  roleLabel,
  onResend,
  onCancel,
}: {
  t: ManageTeamTexts;
  locale: string;
  invitations: SentInvitationDto[];
  failed: boolean;
  editable: boolean;
  actionLoading: string | null;
  roleLabel: (role: string | null | undefined) => string;
  onResend: (invitation: SentInvitationDto) => void;
  onCancel: (invitation: SentInvitationDto) => void;
}) {
  return (
    <Card as="section">
      <h2 className="text-lg font-semibold">
        {t.sentInvitations}
        {invitations.length > 0 && (
          <span className="ml-2 inline-flex items-center justify-center w-6 h-6 rounded-full bg-violet-500/20 text-violet-300 text-xs font-bold">
            {invitations.length}
          </span>
        )}
      </h2>
      <p className="mt-1 mb-4 text-sm text-gray-400">{t.sentInvitationsHelp}</p>

      {failed ? (
        <p className="text-sm text-red-300">{t.invitationsError}</p>
      ) : invitations.length === 0 ? (
        <p className="text-sm text-gray-400">{t.noSentInvitations}</p>
      ) : (
        <div className="space-y-3">
          {invitations.map((invitation) => {
            const label =
              invitation.email || invitation.battle_tag || t.defaultPlayerName;
            const role = invitation.set_captain
              ? t.invitedAsCaptain
              : roleLabel(invitation.role ?? undefined);
            const busy =
              actionLoading === `invite-resend-${invitation.id}` ||
              actionLoading === `invite-cancel-${invitation.id}`;
            return (
              <div
                key={invitation.id}
                className="p-4 rounded-xl bg-white/5 border border-white/5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm break-all">
                      {label}
                      {invitation.expired && (
                        <span className="ml-2 inline-block rounded-full bg-red-500/20 px-2 py-0.5 text-[11px] font-semibold text-red-300 align-middle">
                          {t.invitationExpired}
                        </span>
                      )}
                    </div>
                    {invitation.battle_tag && invitation.email && (
                      <div className="text-xs text-gray-400 font-mono mt-0.5">
                        {invitation.battle_tag}
                      </div>
                    )}
                    <div className="text-xs text-gray-400 mt-1">
                      {t.invitedAs}
                      <span className="text-gray-300">{role}</span>
                      {' · '}
                      {format(t.invitationSentOn, {
                        date: new Date(
                          invitation.created_at
                        ).toLocaleDateString(locale),
                      })}
                      {invitation.expires_at && !invitation.expired && (
                        <>
                          {' · '}
                          {format(t.invitationExpiresOn, {
                            date: new Date(
                              invitation.expires_at
                            ).toLocaleDateString(locale),
                          })}
                        </>
                      )}
                    </div>
                    {/* Trois situations, trois phrases : une seule laisse
                        quelque chose à transmettre à la main. */}
                    {!invitation.email && (
                      <div className="text-xs text-amber-300/80 mt-1">
                        {invitation.has_invite_link
                          ? t.invitationNoEmail
                          : invitation.source === 'discord_bot'
                            ? t.invitationViaDiscord
                            : t.invitationNoEmailNoLink}
                      </div>
                    )}
                  </div>
                  {editable && (
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => onResend(invitation)}
                        disabled={busy}
                        title={t.resendInvitationTitle}
                        className="px-3 py-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/20 text-violet-200 text-xs font-semibold transition disabled:opacity-50"
                      >
                        {t.resendInvitation}
                      </button>
                      <button
                        type="button"
                        onClick={() => onCancel(invitation)}
                        disabled={busy}
                        className="px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs font-semibold transition disabled:opacity-50"
                      >
                        {t.cancelInvitation}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
