// Section page d'accueil : scrim caritatif du 17 mai (Journée mondiale
// contre l'homophobie, la transphobie et la biphobie — IDAHOBIT).
//
// Vidéo YouTube + résultats des matchs.

import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import { useT } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';

const VIDEO_ID = 'DGN4olmhb2Q';
const EVENT_DATE_ISO = '2026-05-17';

type ScrimResult = {
  label: string;
  team1: string;
  team2: string;
  score1: number;
  score2: number;
  bonus?: boolean;
  winner?: string;
};

const RESULTS: ScrimResult[] = [
  {
    label: 'Scrim 1',
    team1: 'Chocomates',
    team2: 'Eclypse',
    score1: 4,
    score2: 0,
  },
  {
    label: 'Scrim 2',
    team1: 'Hinode Sparkles',
    team2: 'Les NoName',
    score1: 3,
    score2: 2,
  },
  {
    label: 'Match bonus Paris',
    team1: 'Hinode Sparkles',
    team2: 'Les NoName',
    score1: 1,
    score2: 0,
    bonus: true,
    winner: 'Hinode Sparkles',
  },
];

function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale, {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function ResultRow({ result }: { result: ScrimResult }) {
  const t1Win = result.score1 > result.score2;
  const t2Win = result.score2 > result.score1;
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 ${
        result.bonus ? 'bg-gradient-to-r from-pink-500/10 via-fuchsia-500/10 to-violet-500/10' : ''
      }`}
    >
      <span className="shrink-0 rounded-full border border-white/15 bg-black/40 px-2.5 py-0.5 text-[11px] uppercase tracking-wider text-white/70">
        {result.label}
      </span>
      <div className="flex flex-1 items-center justify-center gap-3 text-center text-white">
        <span className={`flex-1 truncate ${t1Win ? 'font-semibold' : 'opacity-70'}`}>
          {result.team1}
        </span>
        <span className="rounded-md bg-black/50 px-2 py-1 font-mono text-sm">
          {result.bonus ? (result.winner === result.team1 ? '✓' : '–') : result.score1}
          {' – '}
          {result.bonus ? (result.winner === result.team2 ? '✓' : '–') : result.score2}
        </span>
        <span className={`flex-1 truncate ${t2Win ? 'font-semibold' : 'opacity-70'}`}>
          {result.team2}
        </span>
      </div>
    </div>
  );
}

export default function HomeIdahobitScrim() {
  const t = useT('homeIdahobit');
  const locale = useLocale();
  return (
    <section className="relative mt-12 mb-10 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 text-center">
          <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-pink-300/40 bg-gradient-to-r from-pink-500/20 via-fuchsia-500/20 to-violet-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-pink-100">
            🏳️‍🌈 IDAHOBIT · {formatDate(EVENT_DATE_ISO, locale)}
          </span>
          <Heading
            typeStyle="heading-md"
            level="h2"
            textColor=""
            className="text-brand-gradient"
          >
            {t.title}
          </Heading>
          <span className="brand-rule block mx-auto mt-3" aria-hidden />
          <Paragraph className="mt-2 mx-auto max-w-2xl text-white/70">
            {t.subtitle}
          </Paragraph>
        </div>

        <div
          className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl"
          style={{ aspectRatio: '16 / 9' }}
        >
          <iframe
            src={`https://www.youtube.com/embed/${VIDEO_ID}`}
            title={t.iframeTitle}
            className="absolute inset-0 h-full w-full"
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>

        <div className="mt-6 space-y-3">
          {RESULTS.map((r) => (
            <ResultRow key={r.label} result={r} />
          ))}
        </div>
      </div>
    </section>
  );
}
