// features/player/library/ui/hall/AnnouncementBoard.tsx — le panneau
// d'annonces du hall (lot 7 de docs/PLAN-womens-library.md) : les dernières
// news publiées au tag `announcements` (Discord ou site), puis l'article.
//
//   - `AnnouncementList`    : titre, date, extrait, « Lire » — sous la scène
//                             et dans le panneau ;
//   - `AnnouncementArticle` : le corps (Markdown, rendu des actualités sans
//                             HTML brut, chargé à la demande), « la suite sur
//                             le site » quand l'API l'a coupé ;
//   - `BoardPanel`          : le panneau ouvert (zone de la vue ou bouton),
//                             liste ↔ article.
// Les annonces sont RELUES à chaque entrée dans le hall (`useHallAnnouncements`).

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useLang } from '@/lib/i18n/LanguageProvider';
import { format, useT } from '@/lib/i18n/useT';
import nsHall from '@/lib/i18n/locales/fr/playerLibraryHall';
import { Button } from '@/features/ruban';
import { formatSiteDate } from '@/utils/timezone';
import type { LibraryHallAnnouncement } from '../../hallResponses';
import { useHallAnnouncements } from '../../hall/useHall';
import { FOCUS_RING, LINK, TEXT_ERROR, TEXT_MUTED } from '../social/shared';

const AnnouncementMarkdown = dynamic(() => import('./AnnouncementMarkdown'), {
  ssr: false,
  loading: () => <ArticleLoading />,
});

function ArticleLoading() {
  const t = useT(nsHall);
  return (
    <p role="status" className={TEXT_MUTED}>
      {t.board.articleLoading}
    </p>
  );
}

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
};

function PublishedOn({ iso }: { iso: string | null }) {
  const t = useT(nsHall);
  const { lang } = useLang();
  const date = formatSiteDate(iso, lang, DATE_OPTIONS);
  return date ? (
    <p className="text-xs text-[var(--t3,#a39ba6)]">
      <time dateTime={iso ?? undefined}>
        {format(t.board.publishedOn, { date })}
      </time>
    </p>
  ) : null;
}

/** L'état de la lecture : chargement, erreur (réessayer), vide, ou la liste. */
export function AnnouncementList({
  onRead,
}: {
  onRead: (item: LibraryHallAnnouncement) => void;
}) {
  const t = useT(nsHall);
  const query = useHallAnnouncements();
  if (query.isPending)
    return (
      <p role="status" className={TEXT_MUTED}>
        {t.board.loading}
      </p>
    );
  if (query.isError || !query.data)
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3">
        <p className={TEXT_ERROR}>{t.board.error}</p>
        <Button size="sm" onClick={() => void query.refetch()}>
          {t.board.retry}
        </Button>
      </div>
    );
  const items = query.data.announcements;
  if (items.length === 0) return <p className={TEXT_MUTED}>{t.board.empty}</p>;
  return (
    <ul className="flex flex-col gap-3" data-announcement-list="">
      {items.map((item) => (
        <li
          key={item.id}
          data-announcement-id={item.id}
          className="flex flex-col gap-1 rounded-[var(--r-card,14px)] border border-[var(--line,rgba(194,196,201,.12))] p-3"
        >
          <h3 className="text-base font-semibold text-[var(--t1,#f4edf7)]">
            {item.title}
          </h3>
          <PublishedOn iso={item.publishedAt} />
          {item.excerpt && <p className={TEXT_MUTED}>{item.excerpt}</p>}
          <button
            type="button"
            aria-label={format(t.board.readAria, { title: item.title })}
            onClick={() => onRead(item)}
            className={`w-fit min-h-11 rounded-[var(--r-ctrl,4px)] text-left text-sm font-semibold text-[var(--or-300,#dea3f6)] underline underline-offset-4 hover:text-[var(--or-200,#eec4ff)] ${FOCUS_RING}`}
          >
            {t.board.read}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** L'article : titre (h2 du panneau), date, corps, lien vers le site. */
export function AnnouncementArticle({
  item,
  headingId,
  onBack,
}: {
  item: LibraryHallAnnouncement;
  headingId: string;
  onBack: () => void;
}) {
  const t = useT(nsHall);
  return (
    <article
      className="flex flex-col gap-3"
      data-announcement-article={item.id}
    >
      <Button size="sm" variant="secondary" className="w-fit" onClick={onBack}>
        {t.board.back}
      </Button>
      <h2
        id={headingId}
        tabIndex={-1}
        className="text-lg font-bold text-[var(--t1,#f4edf7)] outline-none"
      >
        {item.title}
      </h2>
      <PublishedOn iso={item.publishedAt} />
      <AnnouncementMarkdown content={item.content} />
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {item.contentTruncated && (
          <span className={TEXT_MUTED}>{t.board.truncated}</span>
        )}
        <Link
          prefetch={false}
          href={`/news/${encodeURIComponent(item.slug)}`}
          target="_blank"
          rel="noopener noreferrer"
          className={LINK}
        >
          {t.board.readOnSite}
        </Link>
      </p>
    </article>
  );
}

/** Le panneau ouvert : la liste, ou l'article choisi (`initial`). */
export function BoardPanel({
  headingId,
  initial = null,
}: {
  headingId: string;
  initial?: LibraryHallAnnouncement | null;
}) {
  const t = useT(nsHall);
  const [article, setArticle] = useState<LibraryHallAnnouncement | null>(
    initial
  );
  // Liste ↔ article : le bouton pressé disparaît, le focus va au nouveau
  // titre (pas à l'ouverture : le dialogue le donne à « Fermer »).
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) document.getElementById(headingId)?.focus();
    mounted.current = true;
  }, [article?.id, headingId]);
  if (article)
    return (
      <AnnouncementArticle
        item={article}
        headingId={headingId}
        onBack={() => setArticle(null)}
      />
    );
  return (
    <section className="flex flex-col gap-3" aria-labelledby={headingId}>
      <h2
        id={headingId}
        tabIndex={-1}
        className="text-lg font-bold text-[var(--t1,#f4edf7)] outline-none"
      >
        {t.board.title}
      </h2>
      <p className={TEXT_MUTED}>{t.board.intro}</p>
      <AnnouncementList onRead={setArticle} />
    </section>
  );
}
