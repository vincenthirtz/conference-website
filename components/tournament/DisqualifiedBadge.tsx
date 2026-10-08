// components/tournament/DisqualifiedBadge.tsx — badge « Disqualifiée » des
// classements publics (page Classement, mini-classement de la landing).
// Une équipe disqualifiée est classée en dernier : sans badge, sa place
// ressemble à une mauvaise saison. L'info-bulle dit ce que deviennent ses
// matchs.

import { useT } from '@/lib/i18n/useT';
import nsTournamentStandings from '@/lib/i18n/locales/fr/tournamentStandings';
import type { DisqualificationMode } from '@/utils/stages/disqualification';

export default function DisqualifiedBadge({
  mode,
}: {
  mode: DisqualificationMode | null | undefined;
}) {
  const t = useT(nsTournamentStandings);
  return (
    <span
      title={
        mode === 'annul' ? t.disqualifiedAnnulTitle : t.disqualifiedForfeitTitle
      }
      data-testid="public-disqualified-badge"
      className="flex-shrink-0 rounded border border-red-400/40 bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-200"
    >
      {t.disqualified}
    </span>
  );
}
