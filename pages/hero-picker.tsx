import { useCallback, useEffect, useMemo, useState } from 'react';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { useT, format } from '@/lib/i18n/useT';
import nsHeroPicker from '@/lib/i18n/locales/fr/heroPicker';

type Hero = {
  name: string;
  role: 'Tank' | 'Damage' | 'Support';
};

const HEROES: Hero[] = [
  // Tanks
  { name: 'D.Va', role: 'Tank' },
  { name: 'Doomfist', role: 'Tank' },
  { name: 'Junker Queen', role: 'Tank' },
  { name: 'Mauga', role: 'Tank' },
  { name: 'Orisa', role: 'Tank' },
  { name: 'Ramattra', role: 'Tank' },
  { name: 'Reinhardt', role: 'Tank' },
  { name: 'Roadhog', role: 'Tank' },
  { name: 'Hazard', role: 'Tank' },
  { name: 'Sigma', role: 'Tank' },
  { name: 'Winston', role: 'Tank' },
  { name: 'Wrecking Ball', role: 'Tank' },
  { name: 'Zarya', role: 'Tank' },

  // Damage
  { name: 'Ashe', role: 'Damage' },
  { name: 'Bastion', role: 'Damage' },
  { name: 'Cassidy', role: 'Damage' },
  { name: 'Echo', role: 'Damage' },
  { name: 'Genji', role: 'Damage' },
  { name: 'Hanzo', role: 'Damage' },
  { name: 'Junkrat', role: 'Damage' },
  { name: 'Mei', role: 'Damage' },
  { name: 'Venture', role: 'Damage' },
  { name: 'Vendetta', role: 'Damage' },
  { name: 'Pharah', role: 'Damage' },
  { name: 'Reaper', role: 'Damage' },
  { name: 'Sojourn', role: 'Damage' },
  { name: 'Soldier: 76', role: 'Damage' },
  { name: 'Sombra', role: 'Damage' },
  { name: 'Symmetra', role: 'Damage' },
  { name: 'Torbjorn', role: 'Damage' },
  { name: 'Tracer', role: 'Damage' },
  { name: 'Widowmaker', role: 'Damage' },

  // Supports
  { name: 'Ana', role: 'Support' },
  { name: 'Baptiste', role: 'Support' },
  { name: 'Brigitte', role: 'Support' },
  { name: 'Illari', role: 'Support' },
  { name: 'Kiriko', role: 'Support' },
  { name: 'Lifeweaver', role: 'Support' },
  { name: 'Lucio', role: 'Support' },
  { name: 'Mercy', role: 'Support' },
  { name: 'Moira', role: 'Support' },
  { name: 'Zenyatta', role: 'Support' },
];

export default function HeroPickerPage() {
  const t = useT(nsHeroPicker);
  const [roleFilter, setRoleFilter] = useState<'All' | Hero['role']>('All');
  const [favoriteHero, setFavoriteHero] = useState<Hero | null>(null);
  const [banHero, setBanHero] = useState<Hero | null>(null);
  const [phase, setPhase] = useState<'favorite' | 'cooldown' | 'ban' | 'done'>(
    'favorite'
  );
  const [cooldownEnds, setCooldownEnds] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState<number>(0);
  const [banEnds, setBanEnds] = useState<number | null>(null);
  const [banRemainingMs, setBanRemainingMs] = useState<number>(0);
  const [banned, setBanned] = useState<string[]>([]);
  const [teamAName, setTeamAName] = useState(t.teamADefault);
  const [teamBName, setTeamBName] = useState(t.teamBDefault);
  const [voteTeam, setVoteTeam] = useState<'A' | 'B'>('A');
  const [pendingFavorite, setPendingFavorite] = useState<Hero | null>(null);
  const [votes, setVotes] = useState<
    { team: 'A' | 'B'; favorite: string; ban: string }[]
  >([]);

  const filteredHeroes = useMemo(() => {
    const base =
      roleFilter === 'All'
        ? HEROES
        : HEROES.filter((h) => h.role === roleFilter);
    return base.filter(
      (h) => !banned.some((b) => b.toLowerCase() === h.name.toLowerCase())
    );
  }, [roleFilter, banned]);

  useEffect(() => {
    if (!cooldownEnds) return;
    const interval = setInterval(() => {
      const diff = cooldownEnds - Date.now();
      setRemainingMs(Math.max(0, diff));
      if (diff <= 0) {
        clearInterval(interval);
        setPhase('ban');
        setCooldownEnds(null);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [cooldownEnds]);

  const voteStats = useMemo(() => {
    const totals = { A: 0, B: 0 };
    const bans: Record<'A' | 'B', Record<string, number>> = { A: {}, B: {} };
    votes.forEach((v) => {
      totals[v.team] += 1;
      bans[v.team][v.ban] = (bans[v.team][v.ban] || 0) + 1;
    });
    const maxBan = (team: 'A' | 'B') => {
      const entries = Object.entries(bans[team] || {});
      if (!entries.length) return { hero: null, count: 0, percent: 0 };
      const [hero, count] = entries.sort((a, b) => b[1] - a[1])[0];
      const percent = totals[team]
        ? Math.round((count / totals[team]) * 100)
        : 0;
      return { hero, count, percent };
    };
    return { totals, bans, maxA: maxBan('A'), maxB: maxBan('B') };
  }, [votes]);

  const pickFavorite = useCallback(
    (hero: Hero) => {
      if (phase === 'favorite') {
        setFavoriteHero(hero);
        setPendingFavorite(hero);
        setPhase('cooldown');
        setCooldownEnds(() => Date.now() + 30_000);
        setBanHero(null);
        setBanned([]);
      } else if (phase === 'ban') {
        setBanHero(hero);
        setBanned([hero.name]);
      }
    },
    [phase]
  );

  const finalizeBanPhase = useCallback(() => {
    if (phase !== 'ban') return;
    setBanEnds(null);
    if (pendingFavorite && banHero) {
      setVotes((prev) => [
        ...prev,
        { team: voteTeam, favorite: pendingFavorite.name, ban: banHero.name },
      ]);
      setBanned([banHero.name]);
    }
    setPhase('done');
  }, [phase, pendingFavorite, banHero, voteTeam]);

  useEffect(() => {
    if (phase !== 'ban') {
      setBanEnds(null);
      setBanRemainingMs(0);
      return;
    }
    if (!banEnds) {
      const target = Date.now() + 30_000;
      setBanEnds(target);
      setBanRemainingMs(30_000);
    }
    const interval = setInterval(() => {
      const target = banEnds ?? Date.now();
      const diff = target - Date.now();
      setBanRemainingMs(Math.max(0, diff));
      if (diff <= 0) {
        clearInterval(interval);
        finalizeBanPhase();
      }
    }, 400);
    return () => clearInterval(interval);
  }, [phase, banEnds, finalizeBanPhase]);

  return (
    <div className="min-h-screen bg-neutral-950 text-white pb-16">
      <div className="container max-w-4xl mx-auto px-4 pt-24 space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Heading typeStyle="heading-md" className="text-gradient">
            {t.title}
          </Heading>
          {phase === 'cooldown' && (
            <span className="text-sm text-yellow-300 rounded-full border border-yellow-400/60 bg-yellow-500/10 px-3 py-1">
              {format(t.cooldownBadge, {
                seconds: Math.ceil(remainingMs / 1000),
              })}
            </span>
          )}
          {phase === 'ban' && (
            <span className="text-sm text-red-300 rounded-full border border-red-400/60 bg-red-500/10 px-3 py-1">
              {format(t.banBadge, {
                seconds: Math.ceil(banRemainingMs / 1000),
              })}
            </span>
          )}
        </div>
        <Paragraph textColor="text-gray-200" className="max-w-2xl">
          {t.intro}
        </Paragraph>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
          {phase === 'cooldown' && (
            <div className="rounded-xl border border-yellow-400/50 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200 flex items-center justify-between">
              <span>{t.cooldownBeforeBan}</span>
              <span className="font-semibold">
                {Math.ceil(remainingMs / 1000)}s
              </span>
            </div>
          )}
          {phase === 'done' && (
            <div className="rounded-xl border border-blue-400/40 bg-blue-500/10 px-4 py-4 text-sm text-blue-100 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-base font-semibold text-white">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                {t.waitingSquadTitle}
              </div>
              <p className="text-gray-200">{t.waitingSquadBody}</p>
              <div className="flex flex-wrap gap-4 text-xs text-gray-300">
                <span>
                  {t.favoriteColon}{' '}
                  {pendingFavorite
                    ? `${pendingFavorite.name} (${pendingFavorite.role})`
                    : '—'}
                </span>
                <span>
                  {t.banColon}{' '}
                  {banHero ? `${banHero.name} (${banHero.role})` : '—'}
                </span>
              </div>
            </div>
          )}

          {banned.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
              <span>{t.bannedLabel}</span>
              {banned.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() =>
                    setBanned((prev) => prev.filter((x) => x !== b))
                  }
                  className="text-xs bg-red-500/20 border border-red-400/40 text-red-100 rounded-full px-3 py-1 hover:bg-red-500/30"
                >
                  {b} ✕
                </button>
              ))}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            {filteredHeroes.map((hero) => (
              <div
                key={hero.name}
                onClick={() => pickFavorite(hero)}
                className={`rounded-xl border border-white/10 bg-black/50 p-3 text-sm flex flex-col gap-2 cursor-pointer transition ${
                  phase === 'ban'
                    ? 'hover:border-red-400/60'
                    : 'hover:border-emerald-400/60'
                } ${
                  favoriteHero?.name === hero.name && phase !== 'ban'
                    ? 'border-emerald-400/80 shadow-[0_0_20px_rgba(16,185,129,0.35)]'
                    : ''
                } ${
                  banHero?.name === hero.name && phase === 'ban'
                    ? 'border-red-400/70 shadow-[0_0_20px_rgba(248,113,113,0.35)]'
                    : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">{hero.name}</span>
                  <span className="text-lg transition-transform transform">
                    {phase === 'ban'
                      ? banHero?.name === hero.name
                        ? '🗑️'
                        : '➕'
                      : favoriteHero?.name === hero.name
                        ? '❤️'
                        : '🤍'}
                  </span>
                </div>
                <span className="text-xs text-gray-400">{hero.role}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
            <p className="text-sm text-gray-300">{t.currentPhaseLabel}</p>
            <p className="text-lg font-semibold">
              {phase === 'favorite' && t.phaseFavorite}
              {phase === 'cooldown' &&
                format(t.phaseCooldown, {
                  seconds: Math.ceil(remainingMs / 1000),
                })}
              {phase === 'ban' &&
                format(t.phaseBan, {
                  seconds: Math.ceil(banRemainingMs / 1000),
                })}
              {phase === 'done' && t.phaseDone}
            </p>
            <div className="flex flex-col gap-1 text-sm text-gray-300">
              <span>
                {t.favoriteColonCompact}{' '}
                {pendingFavorite
                  ? `${pendingFavorite.name} (${pendingFavorite.role})`
                  : '—'}
              </span>
              <span>
                {t.banColonCompact}{' '}
                {banHero ? `${banHero.name} (${banHero.role})` : '—'}
              </span>
            </div>
          </div>

          <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
            <Heading typeStyle="heading-sm" className="text-white">
              {t.voteSectionTitle}
            </Heading>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-gray-300">
                {t.teamANameLabel}
                <input
                  value={teamAName}
                  onChange={(e) => setTeamAName(e.target.value)}
                  className="mt-1 w-full rounded border border-white/15 bg-black/60 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-sm text-gray-300">
                {t.teamBNameLabel}
                <input
                  value={teamBName}
                  onChange={(e) => setTeamBName(e.target.value)}
                  className="mt-1 w-full rounded border border-white/15 bg-black/60 px-3 py-2 text-sm"
                />
              </label>
            </div>

            <form className="grid gap-3 sm:grid-cols-3 items-end">
              <div className="space-y-1">
                <p className="text-sm text-gray-300">{t.chooseTeam}</p>
                <div className="flex gap-3 text-sm">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="voteTeam"
                      checked={voteTeam === 'A'}
                      onChange={() => setVoteTeam('A')}
                    />
                    <span>{teamAName}</span>
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="radio"
                      name="voteTeam"
                      checked={voteTeam === 'B'}
                      onChange={() => setVoteTeam('B')}
                    />
                    <span>{teamBName}</span>
                  </label>
                </div>
              </div>

              <div className="space-y-1 sm:col-span-2">
                <p className="text-sm text-gray-300">
                  {phase === 'favorite' ? t.clickFavorite : t.clickBan}
                </p>
                {phase === 'cooldown' && (
                  <p className="text-xs text-yellow-300">
                    {format(t.cooldownInProgress, {
                      seconds: Math.ceil(remainingMs / 1000),
                    })}
                  </p>
                )}
              </div>

              <div className="sm:col-span-3 flex items-center gap-3">
                {phase === 'done' && (
                  <span className="text-sm text-emerald-300">
                    {t.voteComplete}
                  </span>
                )}
              </div>
            </form>

            <div className="grid gap-4 sm:grid-cols-2">
              {(['A', 'B'] as const).map((team) => {
                const name = team === 'A' ? teamAName : teamBName;
                const total = voteStats.totals[team];
                const maxBan = team === 'A' ? voteStats.maxA : voteStats.maxB;
                return (
                  <div
                    key={team}
                    className="rounded-xl border border-white/10 bg-black/60 p-4 space-y-2"
                  >
                    <p className="text-sm text-gray-200 font-semibold flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-blue-400" />
                      {format(t.votesLabel, { name, count: total })}
                    </p>
                    <div className="text-xs text-gray-400">
                      <p>{t.mostVotedBan}</p>
                      {maxBan.hero ? (
                        <p className="text-sm text-white">
                          {format(t.banVotesInfo, {
                            hero: maxBan.hero,
                            count: maxBan.count,
                            percent: maxBan.percent,
                          })}
                        </p>
                      ) : (
                        <p className="text-sm text-gray-500">{t.noVote}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const heroPickerSeo: SeoProps = {
  title: {
    fr: 'Hero Picker Overwatch — favori & ban',
    en: 'Overwatch hero picker — favourite & ban',
  },
  description: {
    fr: "Teste le hero picker Overwatch de l'OW Women's Cup : choisis ton héros favori, bannis un personnage et vote pour ton équipe. Outil ludique de la coupe féminine.",
    en: "Try the OW Women's Cup Overwatch hero picker: choose your favourite hero, ban a character and vote for your team. A playful tool from the women's cup.",
  },
};

HeroPickerPage.seo = heroPickerSeo;
