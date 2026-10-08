// features/admin/stages/ui/DisqualifiedBadge.tsx — puce « Disqualifiée »
// des écrans de phase (équipes, classements). Le mode et le motif passent en
// info-bulle : la ligne reste lisible, l'explication est à un survol.

import Chip from '@/features/admin/_shared/ui/Chip';
import { format, useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminStageTeams from '@/lib/i18n/locales/admin-fr/adminStageTeams';
import type { DisqualificationMode } from '../client';

type Dict = typeof nsAdminStageTeams.fr;

/** Libellé court du mode (« Matchs restants perdus par forfait »…). */
export function disqualificationModeLabel(
  mode: DisqualificationMode | null | undefined,
  t: Dict
): string {
  return mode === 'annul' ? t.dqModeAnnulShort : t.dqModeForfeitShort;
}

export default function DisqualifiedBadge({
  mode,
  reason,
}: {
  mode?: DisqualificationMode | null;
  reason?: string | null;
}) {
  const t = useAdminT(nsAdminStageTeams);
  const modeLabel = disqualificationModeLabel(mode, t);
  const title = reason
    ? format(t.dqBadgeTitleReason, { mode: modeLabel, reason })
    : format(t.dqBadgeTitle, { mode: modeLabel });
  return (
    <Chip tone="err" title={title} data-testid="disqualified-badge">
      {t.dqBadge}
    </Chip>
  );
}

/**
 * Bloc « Disqualifiée » d'une ligne d'équipe : puce + mode et motif en clair.
 * Ne rend rien si l'équipe n'est pas disqualifiée (`at` nul).
 */
export function DisqualificationNote({
  at,
  mode,
  reason,
}: {
  at?: string | null;
  mode?: DisqualificationMode | null;
  reason?: string | null;
}) {
  const t = useAdminT(nsAdminStageTeams);
  if (!at) return null;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-2">
      <DisqualifiedBadge mode={mode} reason={reason} />
      <span className="text-xs text-[var(--t3,#a39ba6)]">
        {disqualificationModeLabel(mode, t)}
        {reason ? ` · ${reason}` : ''}
      </span>
    </span>
  );
}
