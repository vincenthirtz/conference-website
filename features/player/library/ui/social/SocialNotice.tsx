// features/player/library/ui/social/SocialNotice.tsx — ce qui remplace la
// salle quand elle se ferme ou refuse l'entrée (lot 5 de
// docs/PLAN-womens-library.md). Le modèle vient de `socialNoticeOf` :
//
//   - `kicked`      : expulsée de l'appartement, jusqu'à quand ;
//   - `kickedEnter` : l'entrée est refusée tant que l'expulsion court ;
//   - `banned`      : bannie de la Library (jusqu'à quand, ou sans date),
//                     lien vers /support ;
//   - `closed`      : « cette salle n'est plus accessible » — NEUTRE. C'est ce
//                     que voit une personne bloquée : rien ne doit le laisser
//                     deviner ;
//   - `forbidden`   : entrée refusée, NEUTRE aussi (privée, équipe, blocage :
//                     le motif n'est pas dit) ;
//   - `notFound`, `connection`, `error`.
//
// Les dates passent par `formatSiteDate` (langue de l'interface, fuseau du
// site). À l'affichage, le focus va au titre : au clavier comme au lecteur
// d'écran, on sait tout de suite pourquoi la salle a disparu. `action` : un
// geste offert par le parent (retour au hall, réessayer).

import Link from 'next/link';
import { type ReactNode, useEffect, useId, useRef } from 'react';
import { useLang } from '@/lib/i18n/LanguageProvider';
import { format, useT } from '@/lib/i18n/useT';
import nsSocial from '@/lib/i18n/locales/fr/playerLibrarySocial';
import { Card } from '@/features/ruban';
import type { SocialNoticeModel } from '../../socialModel';
import { formatUntil, LINK, TEXT_MUTED } from './shared';

export type SocialNoticeProps = {
  notice: SocialNoticeModel;
  action?: ReactNode;
  /** Le focus va au titre à l'affichage (défaut : oui). */
  autoFocus?: boolean;
};

type Content = {
  title: string;
  body: string;
  help?: string;
  link?: { href: string; label: string };
};

export default function SocialNotice({
  notice,
  action,
  autoFocus = true,
}: SocialNoticeProps) {
  const t = useT(nsSocial);
  const n = t.notice;
  const { lang } = useLang();
  const ids = useId();
  const titleRef = useRef<HTMLHeadingElement>(null);

  // Une notice nouvelle reprend le focus.
  useEffect(() => {
    if (autoFocus) titleRef.current?.focus();
  }, [notice.kind, autoFocus]);

  const until = (iso: string) => formatUntil(iso, lang);
  const content: Content = (() => {
    switch (notice.kind) {
      case 'kicked':
        return {
          title: n.kickedTitle,
          body: format(n.kickedBody, { until: until(notice.until) }),
        };
      case 'kickedEnter':
        return {
          title: n.kickedEnterTitle,
          body: notice.until
            ? format(n.kickedEnterUntil, { until: until(notice.until) })
            : n.kickedEnterLater,
        };
      case 'banned':
        return {
          title: n.bannedTitle,
          body: notice.until
            ? format(n.bannedUntil, { until: until(notice.until) })
            : n.bannedBody,
          help: n.bannedHelp,
          link: { href: '/support', label: n.supportLink },
        };
      case 'closed':
        return { title: n.closedTitle, body: n.elsewhere };
      case 'forbidden':
        return { title: n.forbiddenTitle, body: n.elsewhere };
      case 'notFound':
        return { title: n.notFoundTitle, body: n.notFoundBody };
      case 'connection':
        return { title: n.connectionTitle, body: n.connectionBody };
      default:
        return { title: n.errorTitle, body: n.errorBody };
    }
  })();

  return (
    <Card
      as="section"
      aria-labelledby={`${ids}-title`}
      data-library-notice={notice.kind}
      className="max-w-xl"
    >
      <h2
        ref={titleRef}
        id={`${ids}-title`}
        tabIndex={-1}
        className="text-xl font-bold text-[var(--t1,#f4edf7)] focus:outline-none"
      >
        {content.title}
      </h2>
      <p className={`mt-2 ${TEXT_MUTED}`}>{content.body}</p>
      {content.help && <p className={`mt-1 ${TEXT_MUTED}`}>{content.help}</p>}
      {(content.link || action) && (
        <div className="mt-4 flex flex-wrap items-center gap-4">
          {content.link && (
            <Link prefetch={false} href={content.link.href} className={LINK}>
              {content.link.label}
            </Link>
          )}
          {action}
        </div>
      )}
    </Card>
  );
}
