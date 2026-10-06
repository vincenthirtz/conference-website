// features/player/team/ui/JoinRequestsPanel.tsx — demandes ENTRANTES à
// rejoindre l'équipe. Une demande déposée sans BattleTag reçoit un champ de
// rattrapage (sinon la fiche de roster naîtrait vide) : il est NON contrôlé,
// lu au moment d'accepter. Même principe pour le motif de refus, facultatif,
// lu au moment de refuser et montré à la candidate.
//
// Lot P8 : le nom mène au profil public de la candidate (rang, héros,
// historique) et son pseudo Discord s'affiche s'il est connu — décider sans
// rien savoir d'elle n'était pas une décision. Accepter / Refuser sont des
// cibles de 44 px, et le refus se CONFIRME (il est définitif et notifié) ; la
// confirmation rappelle si un motif sera montré ou non.

import { useRef } from 'react';
import Link from 'next/link';
import { Card } from '@/features/ruban';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { format, useT } from '@/lib/i18n/useT';
import nsTeamOpening from '@/lib/i18n/locales/fr/teamOpening';
import { DEMANDE_REJECT_REASON_MAX, type TeamJoinRequestDto } from '../schemas';
import type { ManageTeamTexts } from '../hooks/useManageTeamScreen';

function JoinRequestRow({
  t,
  locale,
  request: req,
  editable,
  busy,
  roleLabel,
  onDecide,
  confirmReject,
}: {
  t: ManageTeamTexts;
  locale: string;
  request: TeamJoinRequestDto;
  editable: boolean;
  busy: boolean;
  roleLabel: (role: string | null | undefined) => string;
  onDecide: (
    action: 'approve' | 'reject',
    battleTag?: string,
    reason?: string
  ) => void;
  confirmReject: (name: string, hasReason: boolean) => Promise<boolean>;
}) {
  const tO = useT(nsTeamOpening);
  const battleTagRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const name =
    req.user?.display_name ||
    req.payload?.user_display_name ||
    req.user?.email?.split('@')[0] ||
    t.defaultPlayerName;
  const btag = req.user?.battle_tag || req.payload?.user_battle_tag;
  const discord = req.user?.discord?.trim() || null;
  const profileId = req.user?.id || req.user_id || null;

  const reject = async () => {
    // Lu AVANT la confirmation : le motif saisi est celui qui partira.
    const reason = reasonRef.current?.value.trim() || undefined;
    if (!(await confirmReject(name, !!reason))) return;
    onDecide('reject', undefined, reason);
  };

  return (
    <div className="p-4 rounded-xl bg-white/5 border border-white/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-sm">
            {profileId ? (
              <Link
                href={`/player/${encodeURIComponent(profileId)}`}
                className="text-purple-200 hover:text-purple-100 underline underline-offset-2"
                title={format(tO.viewProfile, { name })}
                aria-label={format(tO.viewProfile, { name })}
              >
                {name}
              </Link>
            ) : (
              name
            )}
            {btag && (
              <span className="text-gray-400 font-mono ml-2 text-xs">
                {btag}
              </span>
            )}
          </div>
          {discord && (
            <div className="text-xs text-gray-400 mt-1">
              {format(tO.discordHandle, { handle: discord })}
            </div>
          )}
          <div className="text-xs text-gray-400 mt-1">
            {t.wantsToJoinAs}
            <span className="text-gray-300">
              {roleLabel(req.payload?.desired_role)}
            </span>
            {' · '}
            {new Date(req.created_at).toLocaleDateString(locale)}
          </div>
          {req.comment && (
            <div className="mt-2 text-xs text-gray-400 italic bg-white/5 rounded-lg px-3 py-2">
              &ldquo;{req.comment}&rdquo;
            </div>
          )}
        </div>
        {editable && (
          <div className="flex gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() =>
                onDecide('approve', battleTagRef.current?.value || undefined)
              }
              disabled={busy}
              className="min-h-[44px] min-w-[44px] px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold transition disabled:opacity-50"
            >
              {t.accept}
            </button>
            <button
              type="button"
              onClick={() => void reject()}
              disabled={busy}
              className="min-h-[44px] min-w-[44px] px-4 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-sm font-semibold transition disabled:opacity-50"
            >
              {t.reject}
            </button>
          </div>
        )}
      </div>
      {editable && (
        <div className="mt-3">
          <label
            htmlFor={`join-reason-${req.id}`}
            className="block text-[11px] uppercase tracking-[0.12em] text-gray-400 mb-1"
          >
            {t.rejectReasonLabel}
          </label>
          <textarea
            ref={reasonRef}
            id={`join-reason-${req.id}`}
            defaultValue=""
            rows={2}
            maxLength={DEMANDE_REJECT_REASON_MAX}
            aria-describedby={`join-reason-hint-${req.id}`}
            className="w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-xs text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-red-400/60"
          />
          <p
            id={`join-reason-hint-${req.id}`}
            className="mt-1 text-[11px] text-gray-400"
          >
            {t.rejectReasonHint}
          </p>
        </div>
      )}
      {editable && !btag && (
        <div className="w-full sm:w-64">
          <label
            htmlFor={`join-btag-${req.id}`}
            className="block text-[11px] uppercase tracking-[0.12em] text-amber-300/90 mb-1"
          >
            {t.joinMissingBattleTagLabel}
          </label>
          <input
            ref={battleTagRef}
            id={`join-btag-${req.id}`}
            type="text"
            defaultValue=""
            placeholder="Pseudo#1234"
            maxLength={64}
            aria-describedby={`join-btag-hint-${req.id}`}
            className="w-full rounded-lg border border-amber-400/30 bg-black/60 px-3 py-2 text-xs text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-400/70"
          />
          <p
            id={`join-btag-hint-${req.id}`}
            className="mt-1 text-[11px] text-gray-400"
          >
            {t.joinMissingBattleTagHint}
          </p>
        </div>
      )}
    </div>
  );
}

export default function JoinRequestsPanel({
  t,
  locale,
  requests,
  editable,
  actionLoading,
  roleLabel,
  onDecide,
}: {
  t: ManageTeamTexts;
  locale: string;
  requests: TeamJoinRequestDto[];
  editable: boolean;
  actionLoading: string | null;
  roleLabel: (role: string | null | undefined) => string;
  onDecide: (
    demandeId: string,
    action: 'approve' | 'reject',
    battleTag?: string,
    reason?: string
  ) => void;
}) {
  const tO = useT(nsTeamOpening);
  const { confirm, dialog } = useConfirmDialog();
  const confirmReject = (name: string, hasReason: boolean) =>
    confirm({
      title: format(tO.rejectConfirmTitle, { name }),
      subtitle: hasReason
        ? tO.rejectConfirmWithReason
        : tO.rejectConfirmNoReason,
      variant: 'danger',
      confirmLabel: t.reject,
      cancelLabel: tO.rejectConfirmNo,
    });

  return (
    <Card as="section">
      {dialog}
      <h2 className="text-lg font-semibold">
        {t.pendingRequests}
        {requests.length > 0 && (
          <span className="ml-2 inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold">
            {requests.length}
          </span>
        )}
      </h2>
      <p className="mt-1 mb-4 text-sm text-gray-400">{t.pendingRequestsHelp}</p>

      {requests.length === 0 ? (
        <p className="text-sm text-gray-400">{t.noPendingRequests}</p>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <JoinRequestRow
              key={req.id}
              t={t}
              locale={locale}
              request={req}
              editable={editable}
              busy={actionLoading === `join-${req.id}`}
              roleLabel={roleLabel}
              onDecide={(action, battleTag, reason) =>
                onDecide(req.id, action, battleTag, reason)
              }
              confirmReject={confirmReject}
            />
          ))}
        </div>
      )}
    </Card>
  );
}
