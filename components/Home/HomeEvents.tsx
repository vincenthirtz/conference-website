import { useEffect, useState, type JSX, type ReactNode } from 'react';
import Link from 'next/link';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import TournamentCard, {
  type UpcomingTournament,
} from '@/components/Home/HomeUpcomingTournament';
import { homepageEvents, type HomepageEvent } from '@/config/homepageEvents';
import { TwitchIcon } from '@/components/Icons';
import type { SVGTypes } from '@/types/types';

const LOCATION_META: Record<
  HomepageEvent['location'],
  {
    label: string;
    Icon?: (props: Readonly<SVGTypes>) => JSX.Element;
    tone: string;
  }
> = {
  twitch: {
    label: 'Sur Twitch',
    Icon: TwitchIcon,
    tone: 'border-fuchsia-300/40 bg-fuchsia-500/15 text-fuchsia-100',
  },
  discord: {
    label: 'Sur Discord',
    tone: 'border-indigo-300/40 bg-indigo-500/15 text-indigo-100',
  },
  irl: {
    label: 'IRL',
    tone: 'border-emerald-300/40 bg-emerald-500/15 text-emerald-100',
  },
  online: {
    label: 'En ligne',
    tone: 'border-sky-300/40 bg-sky-500/15 text-sky-100',
  },
};

function formatDateLong(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  });
}

function EventCard({ event }: { event: HomepageEvent }) {
  const meta = LOCATION_META[event.location];
  const Icon = meta.Icon;
  return (
    <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-purple-500/10 via-white/[0.03] to-cyan-500/10 p-6 md:p-8 backdrop-blur-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.16em] text-blue-200/80">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${meta.tone}`}
            >
              {Icon && <Icon className="h-3 w-3" fill="currentColor" />}
              {meta.label}
            </span>
            {event.tag && (
              <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-blue-100">
                {event.tag}
              </span>
            )}
            <span className="capitalize">{formatDateLong(event.date)}</span>
            <span className="tabular-nums">{formatTime(event.date)}</span>
          </div>
          <h3 className="mt-2 text-2xl md:text-3xl font-bold text-white leading-tight">
            {event.title}
          </h3>
          {event.description && (
            <Paragraph
              className="mt-2 text-sm md:text-base"
              textColor="text-gray-300"
            >
              {event.description}
            </Paragraph>
          )}
        </div>
        {event.ctaUrl && (
          <div className="shrink-0">
            <Link
              href={event.ctaUrl}
              target={event.ctaUrl.startsWith('http') ? '_blank' : undefined}
              rel={event.ctaUrl.startsWith('http') ? 'noreferrer' : undefined}
              className="inline-flex items-center gap-1 rounded-full bg-white px-4 py-2 text-sm font-semibold text-neutral-900 shadow hover:-translate-y-0.5 hover:shadow-lg transition"
            >
              {event.ctaLabel || 'En savoir plus'}
              <span aria-hidden>↗</span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

type AgendaItem = {
  key: string;
  /** Unix ms used for chronological sort. */
  ms: number;
  node: ReactNode;
};

type HomeEventsProps = {
  tournament: UpcomingTournament | null;
};

export default function HomeEvents({
  tournament,
}: HomeEventsProps): JSX.Element | null {
  const buildItems = (filterPast: boolean): AgendaItem[] => {
    const now = Date.now();
    const items: AgendaItem[] = [];

    if (tournament?.startDate) {
      const start = new Date(tournament.startDate).getTime();
      const end = tournament.endDate
        ? new Date(tournament.endDate).getTime()
        : start;
      const includesNow =
        tournament.status === 'running' || (Number.isFinite(end) && end >= now);
      if (!filterPast || includesNow) {
        items.push({
          key: `tournament-${tournament.id}`,
          ms: Number.isFinite(start) ? start : Number.POSITIVE_INFINITY,
          node: <TournamentCard tournament={tournament} />,
        });
      }
    }

    for (const event of homepageEvents) {
      const start = new Date(event.date).getTime();
      const end = event.endDate ? new Date(event.endDate).getTime() : start;
      if (filterPast && (!Number.isFinite(end) || end < now)) continue;
      items.push({
        key: `event-${event.id}`,
        ms: Number.isFinite(start) ? start : Number.POSITIVE_INFINITY,
        node: <EventCard event={event} />,
      });
    }

    return items.sort((a, b) => a.ms - b.ms);
  };

  // SSR + first paint: include everything (no filtering on a server-side
  // `Date.now()` to avoid SSR/CSR drift). After mount, drop past items.
  const [items, setItems] = useState<AgendaItem[]>(() => buildItems(false));

  useEffect(() => {
    setItems(buildItems(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournament?.id]);

  if (!items.length) return null;

  return (
    <section className="container mt-20 flex flex-col gap-6 px-4 md:px-0">
      <div className="flex flex-col items-center text-center">
        <div className="text-xl text-white font-semibold border-b-2 border-blue-400 mb-1">
          Agenda
        </div>
        <Heading
          typeStyle="heading-md"
          className="text-gradient text-center lg:mt-3"
        >
          Prochains rendez-vous
        </Heading>
        <Paragraph
          typeStyle="body-lg"
          className="mt-3 max-w-2xl"
          textColor="text-gray-200"
        >
          Tournois, lives caritatifs et événements communautaires.
        </Paragraph>
      </div>

      <div className="flex flex-col gap-4">
        {items.map((item) => (
          <div key={item.key}>{item.node}</div>
        ))}
      </div>
    </section>
  );
}
