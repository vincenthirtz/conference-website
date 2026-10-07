// components/admin/MatchForfeitProposalPanel.tsx
//
// Proposition de forfait EN ATTENTE sur un match : le cron de check-in ne
// l'applique plus seul (2026-10-07), il la propose. Ce panneau est l'endroit
// où le staff tranche sans passer par le DM Discord — et le seul tant que le
// bot ne propose pas les boutons.
//
// Même cœur que le bot (utils/matches/forfeitProposalResolve.ts) : une
// décision prise ici ferme aussi le DM (`match.forfeit_resolved`). Se tait
// quand il n'y a rien à trancher, y compris avant la migration.

import {
  useDecideForfeitProposal,
  useMatchForfeitProposal,
} from '@/features/admin/matches/hooks/useMatch';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminMatchForfeitProposal from '@/lib/i18n/locales/admin-fr/adminMatchForfeitProposal';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import { rubanCard, rubanErr } from '@/features/admin/_shared/ui/ruban';

type TeamRef = { id?: string | null; name?: string | null } | null | undefined;

export default function MatchForfeitProposalPanel({
  matchId,
  team1,
  team2,
}: {
  matchId: string;
  team1?: TeamRef;
  team2?: TeamRef;
}) {
  const t = useAdminT(nsAdminMatchForfeitProposal);
  const { data } = useMatchForfeitProposal(matchId);
  const decide = useDecideForfeitProposal(matchId);
  const { confirm, dialog } = useConfirmDialog();
  // État porté par la mutation elle-même : pas d'état local à synchroniser.
  const busy = decide.isPending ? (decide.variables ?? null) : null;
  const failure = decide.error as (Error & { status?: number }) | null;
  const error = failure
    ? failure.status === 409
      ? t.errorNotPending
      : failure.message || t.errorGeneric
    : null;

  const proposal = data?.proposal ?? null;
  if (!data?.available || !proposal || proposal.status !== 'pending') {
    return dialog;
  }

  const nameOf = (id: string | null) => {
    if (id && team1?.id === id) return team1?.name || t.unknownTeam;
    if (id && team2?.id === id) return team2?.name || t.unknownTeam;
    return t.unknownTeam;
  };
  const absent = nameOf(proposal.absentTeamId);
  const winner = nameOf(proposal.proposedWinnerTeamId);

  async function act(decision: 'confirm' | 'decline') {
    const ok = await confirm(
      decision === 'confirm'
        ? {
            title: format(t.confirmTitle, { absent }),
            subtitle: t.confirmMessage,
            variant: 'danger',
            confirmLabel: t.confirm,
          }
        : {
            title: t.declineTitle,
            subtitle: t.declineMessage,
            variant: 'warning',
            confirmLabel: t.decline,
          }
    );
    if (!ok) return;
    // L'erreur reste lisible via `decide.error` ; rien à rattraper ici.
    await decide.mutateAsync(decision).catch(() => undefined);
  }

  return (
    <div className={`p-4 ${rubanCard}`}>
      {dialog}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{t.heading}</h2>
        <Chip tone="warn">{absent}</Chip>
      </div>
      <p className="mb-1 text-sm text-[var(--t2,#c7bfca)]">
        {format(t.body, { absent })}
      </p>
      <p className="text-xs text-[var(--t3,#a39ba6)]">
        {format(t.proposedWinner, { winner })}
        {proposal.proposedAt
          ? ` · ${format(t.proposedAt, {
              date: new Date(proposal.proposedAt).toLocaleString('fr-FR', {
                timeZone: 'Europe/Paris',
              }),
            })}`
          : ''}
      </p>

      {error && (
        <p role="alert" className={`mt-3 px-3 py-2 text-xs ${rubanErr}`}>
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <AdminButton
          variant="danger"
          size="sm"
          onClick={() => act('confirm')}
          disabled={busy !== null}
        >
          {busy === 'confirm' ? t.confirming : t.confirm}
        </AdminButton>
        <AdminButton
          variant="secondary"
          size="sm"
          onClick={() => act('decline')}
          disabled={busy !== null}
        >
          {busy === 'decline' ? t.declining : t.decline}
        </AdminButton>
      </div>
      <p className="mt-2 text-[11px] text-[var(--t3,#a39ba6)]">
        {t.overrideHint}
      </p>
    </div>
  );
}
