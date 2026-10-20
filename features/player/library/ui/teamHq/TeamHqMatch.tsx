// features/player/library/ui/teamHq/TeamHqMatch.tsx — le prochain match de
// l'équipe et la porte vers son salon Discord, dans le panneau du QG (lot 9 de
// docs/PLAN-womens-library.md).
//
// LES DONNÉES DU TABLEAU DE BORD : l'API lit le prochain match comme
// `/player` (match jouable à partir de H-1), sans le jeton de check-in — on
// pointe depuis le tableau de bord, le panneau y renvoie. Le salon Discord
// s'ouvre dans un nouvel onglet (lien `discord.com/channels/…`).

import Link from 'next/link';
import { useLang } from '@/lib/i18n/LanguageProvider';
import { format, useT } from '@/lib/i18n/useT';
import nsTeamHq from '@/lib/i18n/locales/fr/playerLibraryTeamHq';
import { formatSiteDate } from '@/utils/timezone';
import type { LibraryTeamHqNextMatch } from '../../teamHqResponses';
import { LINK, TEXT_MUTED } from '../social/shared';

export const TEAM_HQ_CARD =
  'flex flex-col gap-2 rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4';
export const TEAM_HQ_H3 = 'text-base font-bold text-[var(--t1,#f4edf7)]';

const DASHBOARD_HREF = '/player';

const WHEN_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
};

export type TeamHqMatchProps = {
  teamName: string;
  nextMatch: LibraryTeamHqNextMatch | null;
  discordUrl: string | null;
};

export default function TeamHqMatch({
  teamName,
  nextMatch,
  discordUrl,
}: TeamHqMatchProps) {
  const t = useT(nsTeamHq);
  const { lang } = useLang();
  const when = (iso: string) => formatSiteDate(iso, lang, WHEN_OPTIONS, iso);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className={TEAM_HQ_CARD} aria-labelledby="team-hq-match-title">
        <h3 id="team-hq-match-title" className={TEAM_HQ_H3}>
          {t.match.title}
        </h3>
        {nextMatch ? (
          <>
            <p className="font-semibold text-[var(--t1,#f4edf7)]">
              {format(t.match.versus, {
                team: teamName,
                opponent: nextMatch.opponent?.name ?? t.match.opponentTbd,
              })}
            </p>
            <p className={TEXT_MUTED}>
              {nextMatch.scheduledAt
                ? when(nextMatch.scheduledAt)
                : t.match.whenTbd}
            </p>
            {(nextMatch.tournament || nextMatch.roundName) && (
              <p className={TEXT_MUTED}>
                {[nextMatch.tournament?.name, nextMatch.roundName]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
            {nextMatch.bestOf !== null && (
              <p className={TEXT_MUTED}>
                {format(t.match.bestOf, { n: nextMatch.bestOf })}
              </p>
            )}
            {nextMatch.checkin?.alreadyCheckedIn ? (
              <p className={TEXT_MUTED}>{t.match.checkinDone}</p>
            ) : nextMatch.checkin?.isOpen ? (
              <p className="text-sm text-[var(--t1,#f4edf7)]">
                {t.match.checkinOpen}
              </p>
            ) : nextMatch.checkin?.opensAt && !nextMatch.checkin.isPassed ? (
              <p className={TEXT_MUTED}>
                {format(t.match.checkinSoon, {
                  date: when(nextMatch.checkin.opensAt),
                })}
              </p>
            ) : null}
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              <Link prefetch={false} href={DASHBOARD_HREF} className={LINK}>
                {t.match.dashboardLink}
              </Link>
              {nextMatch.streamUrl && (
                <a
                  href={nextMatch.streamUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={LINK}
                >
                  {t.match.streamLink}
                </a>
              )}
            </p>
          </>
        ) : (
          <p className={TEXT_MUTED}>{t.match.none}</p>
        )}
      </section>

      <section className={TEAM_HQ_CARD} aria-labelledby="team-hq-discord-title">
        <h3 id="team-hq-discord-title" className={TEAM_HQ_H3}>
          {t.discord.title}
        </h3>
        {discordUrl ? (
          <a
            href={discordUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t.discord.openAria}
            className={`${LINK} w-fit`}
            data-team-hq-discord=""
          >
            {t.discord.open}
          </a>
        ) : (
          <p className={TEXT_MUTED}>{t.discord.none}</p>
        )}
      </section>
    </div>
  );
}
