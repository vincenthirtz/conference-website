// components/player/TeamHealthCard.tsx
//
// « Santé d'équipe » (N3) — ce qui bloque, pourquoi ça compte, et le lien qui
// répare.
//
// Trois choix qui font la différence entre un diagnostic et un tableau de bord
// décoratif :
//
//   1. Pas de score. Un « 78 % de santé » se contemple ; il ne se répare pas.
//      On n'affiche que des constats nommés, comptés, ordonnés par gravité.
//   2. Chaque ligne porte SON « pourquoi ». Sans lui, « 3 comptes Discord non
//      liés » est une statistique ; avec lui, c'est « ces 3 personnes ne
//      recevront aucune convocation ».
//   3. La carte disparaît quand tout va bien. Un bloc qui affiche en
//      permanence « rien à signaler » entraîne à ne plus le lire — et donc à
//      rater le jour où il signale quelque chose.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useT, format } from '@/lib/i18n/useT';
import type { HealthCode, HealthSeverity } from '../../utils/teams/teamHealth';
import type { TeamHealthResponse } from '../../pages/api/player/team-health';
import { logger } from '../../utils/logger';

/**
 * Où va-t-on pour réparer. Le diagnostic ne sert à rien s'il faut ensuite
 * chercher l'écran : chaque constat pointe une surface qui existe déjà.
 */
const FIX_HREF: Record<HealthCode, string> = {
  no_captain: '/player/manage-team',
  roster_shortfall: '/player/manage-team',
  missing_battle_tag: '/player/manage-team',
  unverified_battle_tag: '/player/manage-team',
  discord_unlinked: '/player/manage-team',
  never_logged_in: '/player/manage-team',
  no_rhythm: '/player#team-rhythm-heading',
  invisible_for_scrims: '/player/teams',
  unreviewed_encounters: '/player#team-memory-heading',
};

const SEVERITY_TONE: Record<HealthSeverity, string> = {
  blocking: 'border-red-400/40 bg-red-500/10 text-red-200',
  warning: 'border-amber-400/40 bg-amber-500/10 text-amber-200',
  info: 'border-white/15 bg-white/5 text-gray-300',
};

export default function TeamHealthCard() {
  const t = useT('teamHealth');
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });
  const [data, setData] = useState<TeamHealthResponse | null>(null);

  const load = useCallback(async () => {
    try {
      const payload = await adminFetchJson<TeamHealthResponse>(
        '/api/player/team-health',
        { skipAuthRedirect: true }
      );
      setData(payload);
    } catch (err) {
      logger.error('[TeamHealthCard] load error', err);
    }
  }, [adminFetchJson]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data?.teamId || data.issues.length === 0) return null;

  const label = (code: HealthCode): string =>
    ({
      no_captain: t.noCaptain,
      roster_shortfall: t.rosterShortfall,
      missing_battle_tag: t.missingBattleTag,
      unverified_battle_tag: t.unverifiedBattleTag,
      discord_unlinked: t.discordUnlinked,
      never_logged_in: t.neverLoggedIn,
      no_rhythm: t.noRhythm,
      invisible_for_scrims: t.invisibleForScrims,
      unreviewed_encounters: t.unreviewedEncounters,
    })[code];

  const why = (code: HealthCode): string =>
    ({
      no_captain: t.whyNoCaptain,
      roster_shortfall:
        data.requiredStartersSource === 'tournament'
          ? t.whyRosterShortfallTournament
          : t.whyRosterShortfallLineup,
      missing_battle_tag: t.whyMissingBattleTag,
      unverified_battle_tag: t.whyUnverifiedBattleTag,
      discord_unlinked: t.whyDiscordUnlinked,
      never_logged_in: t.whyNeverLoggedIn,
      no_rhythm: t.whyNoRhythm,
      invisible_for_scrims: t.whyInvisibleForScrims,
      unreviewed_encounters: t.whyUnreviewedEncounters,
    })[code];

  return (
    <section
      aria-labelledby="team-health-heading"
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="team-health-heading"
            className="text-lg font-semibold text-white"
          >
            {t.title}
          </h2>
          <p className="mt-1 text-sm text-gray-400">{t.subtitle}</p>
        </div>
        {data.blockingCount > 0 && (
          <span className="rounded-full border border-red-400/40 bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-200">
            {format(t.blockingCount, { count: data.blockingCount })}
          </span>
        )}
      </div>

      <ul className="mt-4 space-y-2">
        {data.issues.map((issue) => (
          <li
            key={issue.code}
            className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${SEVERITY_TONE[issue.severity]}`}
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {issue.count > 0
                  ? format(label(issue.code), {
                      count: issue.count,
                      required: data.requiredStarters,
                    })
                  : label(issue.code)}
              </p>
              <p className="mt-0.5 text-xs opacity-80">{why(issue.code)}</p>
            </div>
            <Link
              href={FIX_HREF[issue.code]}
              className="flex-shrink-0 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
            >
              {t.fixCta}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
