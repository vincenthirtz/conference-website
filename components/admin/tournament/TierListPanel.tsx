// components/admin/tournament/TierListPanel.tsx
//
// Tier list et comparateur de deux équipes, dans l'onglet « Analyse » du
// tournoi. Les deux se nourrissent des mêmes lignes que le reste de l'écran
// (`/api/admin/tournament/[id]/analytics`) : aucune requête de plus.
//
// À QUOI ÇA SERT : équilibrer des poules, poser des têtes de série, choisir une
// affiche à diffuser. C'est un outil d'ORGANISATION — il reste dans l'écran du
// staff, et rien de tout cela n'apparaît sur la page publique du tournoi.
//
// LE COMPARATEUR DIT CE QUI EST, PAS QUI EST « MEILLEURE ». Deux colonnes de
// chiffres et le face-à-face réel quand il existe ; quand les deux équipes ne
// se sont jamais rencontrées, l'écran le DIT plutôt que d'afficher un 0-0 qui
// se lirait comme un match nul.

import { useMemo, useState } from 'react';
import type { JSX } from 'react';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTournamentAnalytics from '@/lib/i18n/locales/admin-fr/adminTournamentAnalytics';
import {
  duelBetween,
  type TeamDuel,
  type TierLabel,
  type TierList,
} from '@/utils/analytics/teamTiers';
import type { TournamentAnalyticsTeam } from '@/utils/analytics/tournamentAnalytics';

const TIER_STYLE: Record<TierLabel, string> = {
  S: 'bg-amber-500/20 text-amber-100 border-amber-400/40',
  A: 'bg-violet-500/20 text-violet-100 border-violet-400/40',
  B: 'bg-sky-500/20 text-sky-100 border-sky-400/40',
  C: 'bg-neutral-600/30 text-neutral-200 border-neutral-500/40',
};

const pct = (fraction: number): string =>
  `${Math.round((fraction ?? 0) * 100)}%`;

export default function TierListPanel({
  tiers,
  duels,
  teams,
}: {
  tiers: TierList;
  duels: TeamDuel[];
  teams: TournamentAnalyticsTeam[];
}): JSX.Element | null {
  const t = useAdminT(nsAdminTournamentAnalytics);
  const sorted = useMemo(
    () => [...teams].sort((a, b) => a.name.localeCompare(b.name)),
    [teams]
  );
  const [leftId, setLeftId] = useState(sorted[0]?.teamId ?? '');
  const [rightId, setRightId] = useState(sorted[1]?.teamId ?? '');

  if (teams.length === 0) return null;

  const left = sorted.find((team) => team.teamId === leftId) ?? null;
  const right = sorted.find((team) => team.teamId === rightId) ?? null;
  const duel =
    left && right && left.teamId !== right.teamId
      ? duelBetween(duels, left.teamId, right.teamId)
      : null;

  const selectClass =
    'mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white';

  return (
    <div className="mt-8 space-y-8">
      <section
        className="rounded-2xl border border-neutral-700/50 bg-neutral-800/40 p-5"
        aria-labelledby="tierlist-title"
      >
        <h2 id="tierlist-title" className="text-lg font-semibold">
          {t.tierListTitle}
        </h2>
        <p className="mt-1 text-sm text-neutral-400">{t.tierListSubtitle}</p>

        {tiers.tiers.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-400">{t.tierListEmpty}</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {tiers.tiers.map((tier) => (
              <li
                key={tier.label}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-700/60 bg-neutral-900/50 p-3"
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-sm font-bold ${TIER_STYLE[tier.label]}`}
                >
                  {tier.label}
                </span>
                <ul className="flex flex-wrap gap-2">
                  {tier.teams.map((team) => (
                    <li
                      key={team.teamId}
                      className="rounded-full border border-neutral-700 bg-neutral-800 px-3 py-1 text-sm text-neutral-100"
                      title={format(t.tierTeamTitle, {
                        wins: team.wins,
                        losses: team.losses,
                        maps: pct(team.mapRate),
                      })}
                    >
                      {team.name}
                      <span className="ml-2 text-xs text-neutral-400 tabular-nums">
                        {team.wins}–{team.losses}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}

        {tiers.unranked.length > 0 && (
          <p className="mt-3 text-xs text-neutral-400">
            {format(t.tierUnranked, {
              minPlayed: tiers.minPlayed,
              teams: tiers.unranked.map((team) => team.name).join(', '),
            })}
          </p>
        )}
      </section>

      <section
        className="rounded-2xl border border-neutral-700/50 bg-neutral-800/40 p-5"
        aria-labelledby="comparator-title"
      >
        <h2 id="comparator-title" className="text-lg font-semibold">
          {t.comparatorTitle}
        </h2>
        <p className="mt-1 text-sm text-neutral-400">{t.comparatorSubtitle}</p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {[
            {
              id: 'comparator-left',
              label: t.comparatorLeft,
              value: leftId,
              set: setLeftId,
            },
            {
              id: 'comparator-right',
              label: t.comparatorRight,
              value: rightId,
              set: setRightId,
            },
          ].map((field) => (
            <div key={field.id}>
              <label
                htmlFor={field.id}
                className="block text-xs text-neutral-400"
              >
                {field.label}
              </label>
              <select
                id={field.id}
                value={field.value}
                onChange={(e) => field.set(e.target.value)}
                className={selectClass}
              >
                {sorted.map((team) => (
                  <option key={team.teamId} value={team.teamId}>
                    {team.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        {left && right && left.teamId !== right.teamId ? (
          <>
            <table className="mt-5 w-full text-sm">
              <caption className="sr-only">{t.comparatorTitle}</caption>
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-neutral-500">
                  <th scope="col" className="py-1 pr-3 font-medium">
                    {t.comparatorMetric}
                  </th>
                  <th scope="col" className="py-1 pr-3 text-right font-medium">
                    {left.name}
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    {right.name}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-700/60">
                {[
                  [
                    t.comparatorPlayed,
                    String(left.played),
                    String(right.played),
                  ],
                  [
                    t.comparatorRecord,
                    `${left.wins}–${left.losses}`,
                    `${right.wins}–${right.losses}`,
                  ],
                  [t.comparatorWinRate, pct(left.winRate), pct(right.winRate)],
                  [
                    t.comparatorMaps,
                    `${left.mapWins}–${left.mapLosses}`,
                    `${right.mapWins}–${right.mapLosses}`,
                  ],
                ].map(([label, a, b]) => (
                  <tr key={label} className="text-neutral-200">
                    <td className="py-1.5 pr-3 text-neutral-400">{label}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{a}</td>
                    <td className="py-1.5 text-right tabular-nums">{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="mt-4 text-sm text-neutral-200">
              {duel
                ? format(t.comparatorDuel, {
                    matches: duel.matches,
                    left: left.name,
                    leftWins: duel.aWins,
                    right: right.name,
                    rightWins: duel.bWins,
                    leftMaps: duel.aMapWins,
                    rightMaps: duel.bMapWins,
                  })
                : t.comparatorNoDuel}
            </p>
          </>
        ) : (
          <p className="mt-4 text-sm text-neutral-400">{t.comparatorPickTwo}</p>
        )}
      </section>
    </div>
  );
}
