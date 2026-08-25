// pages/palmares.tsx
// Page publique : palmarès individuel cross-tournois (« hall of fame »).
//
// WHY : le palmarès d'une joueuse existait déjà, mais uniquement DANS sa fiche
// — il fallait donc déjà savoir qui chercher. Cette page retourne le problème :
// une seule liste, tous tournois confondus, des joueuses les plus titrées du
// circuit. C'est le pendant durable du classement, qui ne reflète que la forme
// du moment.
//
// Pré-rendu ISR (revalidate:600 — un palmarès ne bouge qu'à la fin d'un
// tournoi) via `readHallOfFame`, avec un JSON-LD `ItemList`. Chaque ligne
// pointe vers /player/[userId].

import Link from 'next/link';
import PlayerAvatar from '@/components/player/PlayerAvatar';
import type { GetStaticProps, InferGetStaticPropsType } from 'next';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import {
  readHallOfFame,
  type HallOfFamePlayer,
} from '@/utils/profile/readHallOfFame';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { useT, format } from '@/lib/i18n/useT';
import nsPalmaresPage from '@/lib/i18n/locales/fr/palmaresPage';

type PalmaresDict = typeof nsPalmaresPage.fr;

const PAGE_SIZE = 50;
const JSONLD_TOP_N = 10;

function playerLabel(player: HallOfFamePlayer, fallback: string): string {
  return player.displayName || player.battleTag || fallback;
}

function positionClass(position: number): string {
  if (position === 1) return 'text-amber-300';
  if (position === 2) return 'text-neutral-200';
  if (position === 3) return 'text-orange-400';
  return 'text-neutral-500';
}

/** Médaille du rang final d'un tournoi — 4e et au-delà n'en ont pas. */
function rankMedal(rank: number): string | null {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return null;
}

function StatChip({
  value,
  one,
  other,
}: {
  value: number;
  one: string;
  other: string;
}) {
  if (value === 0) return null;
  return (
    <span className="inline-flex items-baseline gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-neutral-200">
      <span className="font-mono font-semibold text-white">{value}</span>
      {value > 1 ? other : one}
    </span>
  );
}

function PlayerRow({
  player,
  t,
}: {
  player: HallOfFamePlayer;
  t: PalmaresDict;
}) {
  const label = playerLabel(player, t.unknownPlayer);
  return (
    <li className="border-t border-neutral-800/60 px-4 py-4 first:border-t-0">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`w-8 shrink-0 font-mono text-sm ${positionClass(player.position)}`}
        >
          #{player.position}
        </span>
        <Link
          href={`/player/${encodeURIComponent(player.userId)}`}
          className="flex min-w-0 flex-1 items-center gap-3 hover:text-[var(--color-yellow)]"
        >
          <PlayerAvatar
            avatarUrl={player.avatarUrl}
            teamName={player.teamName}
            teamSlug={player.teamSlug}
            teamLogoUrl={player.teamLogoUrl}
            label={label}
            size={36}
          />
          <span className="truncate font-semibold text-white">{label}</span>
        </Link>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatChip
            value={player.titles}
            one={t.statTitles_one}
            other={t.statTitles_other}
          />
          <StatChip
            value={player.finals}
            one={t.statFinals_one}
            other={t.statFinals_other}
          />
          <StatChip
            value={player.podiums}
            one={t.statPodiums_one}
            other={t.statPodiums_other}
          />
          <StatChip
            value={player.mvps}
            one={t.statMvps_one}
            other={t.statMvps_other}
          />
        </div>
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 pl-11 text-[11px] text-neutral-400">
        {player.placements.map((placement) => {
          const medal = rankMedal(placement.rank);
          return (
            <li key={placement.tournamentId}>
              {placement.tournamentSlug || placement.tournamentId ? (
                <Link
                  href={`/tournament/${placement.tournamentSlug || placement.tournamentId}`}
                  className="hover:text-white hover:underline"
                >
                  {medal ? `${medal} ` : ''}
                  {placement.tournamentName ?? t.unknownTournament}
                  <span className="text-neutral-600">
                    {' '}
                    ·{' '}
                    {placement.rank === 1
                      ? t.rankFirst
                      : format(t.rankShort, { rank: placement.rank })}
                  </span>
                </Link>
              ) : (
                <span>{placement.tournamentName ?? t.unknownTournament}</span>
              )}
            </li>
          );
        })}
      </ul>
    </li>
  );
}

export default function PalmaresPage({
  players,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  const t = useT(nsPalmaresPage);

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <main className="container mx-auto max-w-4xl px-4 pb-16 pt-24">
        <header className="mb-8 flex flex-col items-center text-center">
          <p className="mb-2 text-xs uppercase tracking-widest text-[var(--color-yellow)]">
            {t.eyebrow}
          </p>
          <Heading
            level="h1"
            typeStyle="heading-md"
            className="text-brand-gradient"
          >
            {t.title}
          </Heading>
          <span className="brand-rule mt-3" aria-hidden />
          <Paragraph
            typeStyle="body-sm"
            textColor="text-neutral-400"
            className="mx-auto mt-3 max-w-2xl"
          >
            {t.subtitle}
          </Paragraph>
          <p className="mt-3 text-sm">
            <Link
              href="/leaderboard"
              className="text-[var(--color-violet-light)] hover:underline"
            >
              {t.leaderboardLink}
            </Link>
          </p>
        </header>

        {players.length === 0 ? (
          <section className="rounded-2xl border border-neutral-800 bg-neutral-900/40 py-16 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-yellow)]/10 text-2xl">
              🏆
            </div>
            <h2 className="mb-2 text-lg font-semibold">{t.emptyTitle}</h2>
            <p className="mx-auto max-w-md text-sm text-neutral-400">
              {t.emptyBody}
            </p>
          </section>
        ) : (
          <ol className="card-brand overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/40">
            {players.map((player) => (
              <PlayerRow key={player.userId} player={player} t={t} />
            ))}
          </ol>
        )}
      </main>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * SEO dynamique — `ItemList` du haut du palmarès, comme la page classement.
 * -------------------------------------------------------------------------*/

const palmaresSeoFallbackFr =
  "Palmarès des joueuses de l'OW Women's Cup : titres, finales et podiums cumulés sur tous les tournois du circuit.";
const palmaresSeoFallbackEn =
  "OW Women's Cup player hall of fame: titles, finals and podiums across every tournament of the circuit.";

const palmaresSeoFallback: SeoProps = {
  title: { fr: 'Palmarès des joueuses', en: 'Player hall of fame' },
  description: { fr: palmaresSeoFallbackFr, en: palmaresSeoFallbackEn },
};

function buildPalmaresSeo(players: HallOfFamePlayer[]): SeoProps {
  if (players.length === 0) return palmaresSeoFallback;

  const titled = players.filter((p) => p.titles > 0).length;
  return {
    title: { fr: 'Palmarès des joueuses', en: 'Player hall of fame' },
    description: {
      fr: `Palmarès des joueuses de l'OW Women's Cup : ${players.length} joueuses classées, dont ${titled} titrées. Titres, finales et podiums cumulés sur tous les tournois.`,
      en: `OW Women's Cup player hall of fame: ${players.length} ranked players, ${titled} of them title-holders. Titles, finals and podiums across every tournament.`,
    },
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Palmarès des joueuses',
      numberOfItems: players.length,
      itemListOrder: 'https://schema.org/ItemListOrderDescending',
      itemListElement: players.slice(0, JSONLD_TOP_N).map((p) => ({
        '@type': 'ListItem',
        position: p.position,
        name: p.displayName || p.battleTag || 'Joueuse',
      })),
    },
  };
}

PalmaresPage.seo = palmaresSeoFallback;

export const getStaticProps: GetStaticProps<{
  players: HallOfFamePlayer[];
  seo: SeoProps;
}> = async () => {
  const players = await readHallOfFame(DEFAULT_TENANT_ID, PAGE_SIZE);
  return {
    props: { players, seo: buildPalmaresSeo(players) },
    // Un palmarès ne bouge qu'à la clôture d'un tournoi : pas besoin d'une
    // revalidation aussi serrée que le classement.
    revalidate: 600,
  };
};
