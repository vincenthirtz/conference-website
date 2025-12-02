/* eslint-disable @next/next/no-img-element */
import Head from 'next/head';
import { useEffect, useMemo, useState } from 'react';
import teamsData from '@/config/teams.json';
import resultsData from '@/config/results.json';

// Types
type Team = {
  name: string;
  img?: string;
  color?: string;
};

type Match = {
  id: string;
  round: number;
  date: string; // ISO string
  timeLabel: string;
  home: Team;
  away: Team;
  bo: 3 | 5;
  result?: { home: number; away: number };
};

// Palette & color utils
const TEAM_PALETTE = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#14b8a6',
  '#f97316',
  '#22c55e',
];
function hashCode(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}
function colorForName(name: string) {
  return TEAM_PALETTE[hashCode(name) % TEAM_PALETTE.length];
}
function teamColor(team: Team) {
  return team.color && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(team.color)
    ? team.color
    : colorForName(team.name);
}

function pad(n: number) {
  return n.toString().padStart(2, '0');
}

function formatDateHuman(dateISO: string) {
  const d = new Date(dateISO);
  return d.toLocaleString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Un score est "comptable" s'il correspond à une victoire valide (BO3 => 2, BO5 => 3) et pas d'égalité
function isCountable(m: Match): boolean {
  if (!m.result) return false;
  const needed = m.bo === 3 ? 2 : 3;
  const { home, away } = m.result;
  if (home === away) return false;
  return home >= needed || away >= needed;
}

export default function Tournoi() {
  const teams: Team[] = useMemo<Team[]>(() => {
    const base = (teamsData as any[])
      .slice(0, 4)
      .map((t) => ({
        name: t.name as string,
        img: t.img as string,
        color: (t as any).color as string,
      }));
    while (base.length < 4)
      base.push({
        name: `Équipe ${base.length + 1}`,
        img: '',
        color: '',
      });
    return base;
  }, []);

  const [matches, setMatches] = useState<Match[]>([]);
  const [finalMatch, setFinalMatch] = useState<Match | null>(null);

  function buildRoundRobin(teams: Team[]): [Team, Team][][] {
    const list = [...teams];
    const n = list.length;
    const rounds: [Team, Team][][] = [];
    const rotating = list.slice(1);
    const fixed = list[0];
    const R = n - 1;
    for (let r = 0; r < R; r++) {
      const pairings: [Team, Team][] = [];
      const left = [fixed, ...rotating.slice(0, Math.floor((n - 1) / 2))];
      const right = rotating
        .slice(Math.floor((n - 1) / 2))
        .slice()
        .reverse();
      for (let i = 0; i < left.length; i++) {
        const a = left[i];
        const b = right[i];
        if (!a || !b) continue;
        pairings.push(r % 2 === 0 ? [a, b] : [b, a]);
      }
      rounds.push(pairings);
      rotating.unshift(rotating.pop() as Team);
    }
    return rounds;
  }

  // Construction du calendrier fixe + injection des résultats de poules
  useEffect(() => {
    if (teams.length !== 4) return;
    const rounds = buildRoundRobin(teams);

    let built: Match[] = [];
    rounds.forEach((pairings, r) => {
      pairings.forEach((p, i) => {
        const [home, away] = p;
        built.push({
          id: `R${r + 1}-M${i + 1}`,
          round: r + 1,
          date: new Date().toISOString(),
          timeLabel: '',
          home,
          away,
          bo: 3,
        });
      });
    });

    // Forçage des dates/heures
    const now = new Date();
    const year = now.getFullYear();
    const forced = [
      new Date(year, 10, 17, 21, 0),
      new Date(year, 10, 17, 22, 30),
      new Date(year, 10, 17, 23, 30),
      new Date(year, 10, 24, 21, 0),
      new Date(year, 10, 24, 22, 0),
      new Date(year, 10, 24, 23, 30),
    ];

    built = built.map((m, i) => {
      const d = forced[i] ?? forced[forced.length - 1];
      return {
        ...m,
        date: d.toISOString(),
        timeLabel: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
      };
    });

    // Inject results from results.json (objet ou tableau)
    try {
      const dict: any = resultsData;
      if (Array.isArray(dict)) {
        built = built.map((m) => {
          const row = (dict as any[]).find((x: any) => x.id === m.id);
          return row
            ? {
                ...m,
                result: {
                  home: Number(row.home) || 0,
                  away: Number(row.away) || 0,
                },
              }
            : m;
        });
      } else {
        built = built.map((m) => {
          const v = (dict as Record<string, { home: number; away: number }>)[
            m.id
          ];
          return v
            ? {
                ...m,
                result: {
                  home: Number(v.home) || 0,
                  away: Number(v.away) || 0,
                },
              }
            : m;
        });
      }
    } catch {}

    setMatches(built);
    setFinalMatch(null);
  }, [teams]);

  // Classement (ne compte que les matchs "comptables")
  const standings = useMemo(() => {
    const table = new Map<
      string,
      {
        team: Team;
        mp: number;
        mw: number;
        ml: number;
        mapsW: number;
        mapsL: number;
      }
    >();
    teams.forEach((t) =>
      table.set(t.name, { team: t, mp: 0, mw: 0, ml: 0, mapsW: 0, mapsL: 0 })
    );
    for (const m of matches) {
      if (!isCountable(m)) continue;
      const a = table.get(m.home.name)!;
      const b = table.get(m.away.name)!;
      a.mp++;
      b.mp++;
      a.mapsW += m.result!.home;
      a.mapsL += m.result!.away;
      b.mapsW += m.result!.away;
      b.mapsL += m.result!.home;
      if (m.result!.home > m.result!.away) {
        a.mw++;
        b.ml++;
      } else {
        b.mw++;
        a.ml++;
      }
    }
    const rows = Array.from(table.values()).map((r) => ({
      name: r.team.name,
      mp: r.mp,
      w: r.mw,
      l: r.ml,
      maps: `${r.mapsW}-${r.mapsL}`,
      diff: r.mapsW - r.mapsL,
    }));
    const mapsWon = (s: string) => Number(s.split('-')[0] ?? 0);
    rows.sort(
      (x, y) =>
        y.w - x.w || y.diff - x.diff || mapsWon(y.maps) - mapsWon(x.maps)
    );
    return rows;
  }, [matches, teams]);

  // Finale (affichée uniquement si les 6 matchs de poules sont joués ET comptables)
  useEffect(() => {
    const rrDone = matches.length === 6 && matches.every(isCountable);
    if (!rrDone) {
      setFinalMatch(null);
      return;
    }

    try {
      const dict: any = resultsData;
      let finalResult: { home: number; away: number } | null = null;

      if (Array.isArray(dict)) {
        const row = (dict as any[]).find((x: any) => x.id === 'FINAL');
        if (row)
          finalResult = {
            home: Number(row.home) || 0,
            away: Number(row.away) || 0,
          };
      } else if (dict['FINAL']) {
        const v = dict['FINAL'];
        finalResult = {
          home: Number(v.home) || 0,
          away: Number(v.away) || 0,
        };
      }

      if (!standings || standings.length < 2) return;
      const [t1, t2] = standings;

      // Date de la finale : mercredi 10 décembre à 21h (année basée sur les poules)
      const lastRRDate = matches.reduce(
        (max, m) => Math.max(max, new Date(m.date).getTime()),
        0
      );
      const rrYear = new Date(lastRRDate).getFullYear();
      const finalDate = new Date(rrYear, 11, 10, 21, 0, 0, 0);

      const homeTeam = teams.find((t) => t.name === t1.name) || { name: t1.name };
      const awayTeam = teams.find((t) => t.name === t2.name) || { name: t2.name };

      setFinalMatch({
        id: 'FINAL',
        round: standings.length + 1,
        date: finalDate.toISOString(),
        timeLabel: '21:00',
        home: homeTeam,
        away: awayTeam,
        bo: 5,
        result: finalResult || undefined,
      });
    } catch (err) {
      console.error('Erreur génération finale:', err);
    }
  }, [matches, standings, teams]);

  const champion = useMemo(() => {
    if (!finalMatch?.result) return null;
    if (!isCountable(finalMatch)) return null;
    return finalMatch.result.home > finalMatch.result.away
      ? finalMatch.home.name
      : finalMatch.away.name;
  }, [finalMatch]);

  // UI chips pour lisibilité du classement
  function MapsChip({ maps }: { maps: string }) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-white/10 border border-white/15 font-mono text-xs md:text-sm tabular-nums">
        {maps}
      </span>
    );
  }

  function DiffChip({ diff }: { diff: number }) {
    const positive = diff > 0;
    const neutral = diff === 0;
    const base =
      'inline-flex items-center px-2 py-0.5 rounded-full font-mono text-xs md:text-sm tabular-nums border';
    const cls = neutral
      ? `${base} bg-white/10 border-white/15 text-gray-200`
      : positive
        ? `${base} bg-emerald-500/15 border-emerald-500/30 text-emerald-300`
        : `${base} bg-rose-500/15 border-rose-500/30 text-rose-300`;
    const sign = neutral ? '±' : positive ? '+' : '−';
    return (
      <span className={cls}>
        {sign}
        {Math.abs(diff)}
      </span>
    );
  }

  function TeamBadge({ team }: { team: Team }) {
    const color = teamColor(team);
    const initials = team.name
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
    return (
      <div className="flex items-center gap-2 min-w-0">
        {team.img ? (
          <img
            src={team.img}
            className="w-7 h-7 rounded border-2"
            style={{ borderColor: color }}
            alt={team.name}
          />
        ) : (
          <div
            className="w-7 h-7 rounded flex items-center justify-center text-xs font-bold text-black border-2"
            style={{ backgroundColor: color, borderColor: color }}
            aria-hidden
          >
            {initials}
          </div>
        )}
        <span className="truncate" style={{ color }}>
          {team.name}
        </span>
      </div>
    );
  }

  function MatchCard({ m }: { m: Match }) {
    const r = m.result ?? { home: 0, away: 0 };
    return (
      <div className="p-4 rounded-2xl bg-white/5 border border-white/10 shadow-sm backdrop-blur">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-wider text-gray-200">
            {m.id} · BO{m.bo}
          </div>
          <div className="text-sm font-medium text-white">
            {formatDateHuman(m.date)}
          </div>
        </div>
        <div className="flex items-center justify-between gap-4">
          <TeamBadge team={m.home} />
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-white/10 border border-white/15 font-mono text-sm tabular-nums">
            {isCountable(m) ? `${r.home}–${r.away}` : '—'}
          </span>
          <TeamBadge team={m.away} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <Head>
        <title>Tournoi – Round Robin (BO3) + Finale (BO5)</title>
      </Head>

      <div className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -left-32 -top-32 w-[420px] h-[420px] rounded-full bg-purple-600/30 blur-3xl" />
          <div className="absolute right-10 top-10 w-[360px] h-[360px] rounded-full bg-pink-500/20 blur-3xl" />
        </div>

        <div className="max-w-6xl mx-auto px-6 pt-32 pb-14 relative">
          <p className="text-xs uppercase tracking-[0.24em] text-purple-200/80">
            Tournoi
          </p>
          <h1 className="text-4xl md:text-5xl font-bold mt-3 leading-tight">
            Round Robin &amp; Finale
          </h1>
          <p className="text-neutral-300 text-lg mt-4 max-w-2xl">
            4 équipes, 6 matchs de poules en BO3, puis une grande finale en BO5 pour couronner la championne.
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 pb-20">
        <section className="mt-6">
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white mb-4">
            Classement (Round Robin)
          </h2>
          <div className="p-5 rounded-2xl bg-white/5 border border-white/10">
            <div className="overflow-x-auto">
              <table className="min-w-full text-base md:text-[17px]">
                <thead className="text-left text-gray-200 uppercase tracking-wider text-[11px] md:text-xs">
                  <tr className="text-gray-300">
                    <th className="py-2">#</th>
                    <th className="py-2">Équipe</th>
                    <th className="py-2">
                      <abbr title="Matchs joués">MJ</abbr>
                    </th>
                    <th className="py-2">
                      <abbr title="Victoires">V</abbr>
                    </th>
                    <th className="py-2">
                      <abbr title="Défaites">D</abbr>
                    </th>
                    <th className="py-2">
                      <abbr title="Maps gagnées-perdues">Maps</abbr>
                    </th>
                    <th className="py-2">
                      <abbr title="Différence de maps">Diff</abbr>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {standings.map((r, idx) => (
                    <tr key={r.name} className="hover:bg-white/5 transition">
                      <td className="py-2 text-gray-300 tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="py-2">
                        <TeamBadge
                          team={
                            teams.find((t) => t.name === r.name) ?? {
                              name: r.name,
                            }
                          }
                        />
                      </td>
                      <td className="py-2 tabular-nums text-gray-200">{r.mp}</td>
                      <td className="py-2 font-semibold tabular-nums text-gray-100">
                        {r.w}
                      </td>
                      <td className="py-2 tabular-nums text-gray-300">{r.l}</td>
                      <td className="py-2">
                        <MapsChip maps={r.maps} />
                      </td>
                      <td className="py-2">
                        <DiffChip diff={r.diff} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-3">
              Tiebreakers: Victoires &gt; Différence de maps &gt; Maps gagnées.
            </p>
          </div>
        </section>

        {/* Matchs */}
        <section className="mt-12">
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white mb-4">
            Calendrier – Phase de poules (BO3)
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            {matches.map((m) => (
              <MatchCard key={m.id} m={m} />
            ))}
          </div>
        </section>

        {/* Finale */}
        <section className="mt-12">
          <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white mb-2">
            Finale (BO5)
          </h2>
          {!finalMatch ? (
            <p className="text-gray-300">En attente des 6 résultats de poules…</p>
          ) : (
            <div className="space-y-3">
              <div className="text-gray-300">
                {formatDateHuman(finalMatch.date)}
              </div>
              <div className="p-4 rounded-2xl bg-yellow-500/10 border border-yellow-500/20">
                <div className="text-sm uppercase tracking-wider text-yellow-300 mb-2">
                  BO5 – Premier à 3
                </div>
                <div className="flex items-center justify-between gap-4">
                  <TeamBadge team={finalMatch.home} />
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-white/10 border border-white/15 font-mono text-sm tabular-nums">
                    {isCountable(finalMatch)
                      ? `${finalMatch.result!.home}–${finalMatch.result!.away}`
                      : '—'}
                  </span>
                  <TeamBadge team={finalMatch.away} />
                </div>
              </div>
              {champion && (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                  <div className="text-emerald-300 font-semibold">
                    🏆 Champion: {champion}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
