// features/player/team/ui/RosterAlerts.tsx — ce qui manque au roster :
// capitaine non désignée, membres injoignables sur Discord (non liés, ou
// partis du serveur). Rendu seulement quand il y a quelque chose à dire.

import { format } from '@/lib/i18n/useT';
import {
  discordReadinessSummary,
  hasDiscordLinkInfo,
} from '@/utils/teams/rosterReadiness';
import type { ManagedTeamMemberDto } from '../schemas';
import type { ManageTeamTexts } from '../hooks/useManageTeamScreen';

const ALERT =
  'mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3';

export default function RosterAlerts({
  t,
  members,
  hasCaptain,
  locale,
}: {
  t: ManageTeamTexts;
  members: ManagedTeamMemberDto[];
  hasCaptain: boolean;
  locale: string;
}) {
  // Porte sur le roster ENTIER, encadrement compris ; `known` peut valoir 0 —
  // le serveur ne communique l'état qu'à qui gère l'équipe.
  const discordKnown = hasDiscordLinkInfo(members);
  const gaps = discordReadinessSummary(members);
  // Dernier constat du bot : « a quitté le Discord » ne vaut que jusqu'au
  // cycle suivant (30 min).
  const checkedAt = members.reduce<string | null>((latest, m) => {
    const at = m.discord_checked_at ?? null;
    if (!at) return latest;
    return !latest || at > latest ? at : latest;
  }, null);
  const checkedLabel = checkedAt
    ? new Date(checkedAt).toLocaleString(locale, {
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : null;

  return (
    <>
      {/* Équipe créée par un manager : on rappelle qu'on peut désigner la
          capitaine (bouton sur chaque membre). */}
      {!hasCaptain && (
        <div className={ALERT}>
          <p className="text-sm font-semibold text-amber-100">
            {t.noCaptainTitle}
          </p>
          <p className="mt-1 text-xs text-amber-100/80">
            {members.length > 1 ? t.noCaptainBody : t.noCaptainBodyEmpty}
          </p>
        </div>
      )}
      {/* Les NOMS sont sur chaque ligne (badge) ; ici, le compte. */}
      {discordKnown && (gaps.unlinked > 0 || gaps.left > 0) && (
        <div className={ALERT}>
          {gaps.unlinked > 0 && (
            <p className="text-sm font-semibold text-amber-100">
              {format(
                gaps.unlinked > 1
                  ? t.discordGapTitle_other
                  : t.discordGapTitle_one,
                { count: gaps.unlinked, total: gaps.known }
              )}
            </p>
          )}
          {/* Parties du serveur : compte lié, mais le bot ne les trouve plus
              — il faut les réinviter. */}
          {gaps.left > 0 && (
            <p className="text-sm font-semibold text-amber-100">
              {format(
                gaps.left > 1
                  ? t.discordLeftTitle_other
                  : t.discordLeftTitle_one,
                { count: gaps.left, total: gaps.known }
              )}
            </p>
          )}
          <p className="mt-1 text-xs text-amber-100/80">
            {gaps.unlinked > 0 && gaps.left > 0
              ? t.discordGapBodyBoth
              : gaps.left > 0
                ? t.discordLeftBody
                : t.discordGapBody}
          </p>
          {gaps.left > 0 && checkedLabel && (
            <p className="mt-1 text-xs text-amber-100/60">
              {format(t.discordCheckedAt, { date: checkedLabel })}
            </p>
          )}
        </div>
      )}
    </>
  );
}
