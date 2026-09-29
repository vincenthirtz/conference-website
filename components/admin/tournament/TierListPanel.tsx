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
import {
  rubanCardPadded,
  rubanEyebrowSnug,
  rubanFormInput,
  rubanInset,
  rubanMuted,
} from '@/features/admin/_shared/ui/ruban';

// La lettre porte le rang ; la couleur ne fait que distinguer le haut du
// tableau (orchidée) du reste (neutre) — pas de palette par palier.
const TIER_STYLE: Record<TierLabel, string> = {
  S: 'border-[rgba(180,103,209,.55)] bg-[rgba(180,103,209,.2)] text-[var(--or-100,#f6e1ff)]',
  A: 'border-[rgba(180,103,209,.4)] bg-[rgba(180,103,209,.1)] text-[var(--or-200,#eec4ff)]',
  B: 'border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s3,#2f2732)] text-[var(--t1,#f4edf7)]',
  C: 'border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] text-[var(--t2,#c7bfca)]',
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

  const selectClass = `mt-1 ${rubanFormInput}`;

  return (
    <div className="mt-8 space-y-8">
      <section className={rubanCardPadded} aria-labelledby="tierlist-title">
        <h2 id="tierlist-title" className="text-lg font-semibold">
          {t.tierListTitle}
        </h2>
        <p className={`mt-1 text-sm ${rubanMuted}`}>{t.tierListSubtitle}</p>

        {tiers.tiers.length === 0 ? (
          <p className={`mt-4 text-sm ${rubanMuted}`}>{t.tierListEmpty}</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {tiers.tiers.map((tier) => (
              <li
                key={tier.label}
                className={`flex flex-wrap items-center gap-3 p-3 ${rubanInset}`}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--r-ctrl,4px)] border font-[family-name:var(--fd)] text-base font-extrabold ${TIER_STYLE[tier.label]}`}
                >
                  {tier.label}
                </span>
                <ul className="flex flex-wrap gap-2">
                  {tier.teams.map((team) => (
                    <li
                      key={team.teamId}
                      className="rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] px-3 py-1 text-sm text-[var(--t1,#f4edf7)]"
                      title={format(t.tierTeamTitle, {
                        wins: team.wins,
                        losses: team.losses,
                        maps: pct(team.mapRate),
                      })}
                    >
                      {team.name}
                      <span className={`ml-2 font-mono text-xs ${rubanMuted}`}>
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
          <p className={`mt-3 text-xs ${rubanMuted}`}>
            {format(t.tierUnranked, {
              minPlayed: tiers.minPlayed,
              teams: tiers.unranked.map((team) => team.name).join(', '),
            })}
          </p>
        )}
      </section>

      <section className={rubanCardPadded} aria-labelledby="comparator-title">
        <h2 id="comparator-title" className="text-lg font-semibold">
          {t.comparatorTitle}
        </h2>
        <p className={`mt-1 text-sm ${rubanMuted}`}>{t.comparatorSubtitle}</p>

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
              <label htmlFor={field.id} className={`block ${rubanEyebrowSnug}`}>
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
                <tr className="text-left">
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
              <tbody className="divide-y divide-[var(--line,rgba(194,196,201,.12))]">
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
                  <tr key={label} className="text-[var(--t2,#c7bfca)]">
                    <td className={`py-1.5 pr-3 ${rubanMuted}`}>{label}</td>
                    <td className="py-1.5 pr-3 text-right font-mono">{a}</td>
                    <td className="py-1.5 text-right font-mono">{b}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="mt-4 text-sm text-[var(--t2,#c7bfca)]">
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
          <p className={`mt-4 text-sm ${rubanMuted}`}>{t.comparatorPickTwo}</p>
        )}
      </section>
    </div>
  );
}
