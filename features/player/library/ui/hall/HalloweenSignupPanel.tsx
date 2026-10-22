// features/player/library/ui/hall/HalloweenSignupPanel.tsx — l'inscription
// EN UN CLIC à l'Event Halloween, depuis le hall (lot 16 de
// docs/PLAN-womens-library.md) : ouverte par la citrouille, le fantôme ou
// l'entrée sous la scène, dans le dialogue de `HalloweenHall`.
//
// LA MÊME QUE L'ENCART DE L'ESPACE JOUEUSE (`useEventOneClickSignup`, route
// `/api/tournament/{id}/pool` existante) :
//   - AVANT le clic, ce qui sera envoyé : pseudo, BattleTag, équipe (ou « le
//     staff te placera ») — pas d'inscription surprise ;
//   - APRÈS, « Tu es inscrite 🎃 », et où en est son équipe ;
//   - inscriptions closes, ou échec : un message, et la page de l'événement ;
//   - s'il manque le pseudo, le BattleTag ou le choix de l'équipe (plusieurs
//     équipes, aucune active), ou si la lecture rate : la page d'inscription
//     (`/tournament/<slug>/inscription-solo`), sans deviner.
//
// CHARGÉ À L'OUVERTURE du dialogue (`next/dynamic` dans `HalloweenHall`) :
// ni ce module, ni le client du tableau de bord ne partent avant. Le titre du
// dialogue (« Bouh ! ») est posé avant lui.

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useLang } from '@/lib/i18n/LanguageProvider';
import { format, useT } from '@/lib/i18n/useT';
import nsHalloween from '@/lib/i18n/locales/fr/playerLibraryHalloween';
import { Button, ButtonLink } from '@/features/ruban';
import { useEventOneClickSignup } from '@/features/player/dashboard/hooks/useEventOneClickSignup';
import { formatSiteDate } from '@/utils/timezone';
import {
  type HalloweenEvent,
  halloweenEventHref,
  halloweenSignupHref,
} from '../../halloween/event';
import { LINK, TEXT_ERROR, TEXT_MUTED } from '../social/shared';

const DD = 'font-semibold text-[var(--t1,#f4edf7)]';

export type HalloweenSignupPanelProps = { event: HalloweenEvent };

export default function HalloweenSignupPanel({
  event,
}: HalloweenSignupPanelProps) {
  const t = useT(nsHalloween);
  const { lang } = useLang();
  const signup = useEventOneClickSignup(event.tournamentId, true);
  const { view, draft, busy, errorKind } = signup;

  const date = formatSiteDate(event.date, lang, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const signupHref = halloweenSignupHref(event);
  const details = (
    <Link prefetch={false} href={halloweenEventHref(event)} className={LINK}>
      {t.details}
    </Link>
  );

  let body: ReactNode;
  if (!view || !draft) {
    body = signup.reading ? (
      <p role="status" className={TEXT_MUTED}>
        {t.loading}
      </p>
    ) : (
      <>
        <p className={TEXT_MUTED}>{t.loadError}</p>
        <Actions>
          <ButtonLink href={signupHref} variant="primary" size="sm">
            {t.complete}
          </ButtonLink>
          {details}
        </Actions>
      </>
    );
  } else if (view.entry) {
    const progress = view.teamProgress;
    body = (
      <>
        <p
          role="status"
          className="text-base font-semibold text-[var(--lf-200,#b3e7a3)]"
        >
          {t.registered}
        </p>
        {progress && !progress.teamRegistered && (
          <p className={TEXT_MUTED}>
            {format(t.waitTeam, {
              count: progress.signedUp,
              needed: progress.needed,
              team: progress.team.name,
            })}
          </p>
        )}
        <Actions>
          <ButtonLink href={signupHref} variant="secondary" size="sm">
            {t.manage}
          </ButtonLink>
          {details}
        </Actions>
      </>
    );
  } else if (draft.oneClick) {
    body = (
      <>
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--t2,#c7bfca)]">
            {t.recapTitle}
          </h3>
          <dl
            className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm"
            data-halloween-recap=""
          >
            <dt className={TEXT_MUTED}>{t.pseudo}</dt>
            <dd className={DD}>{draft.pseudo}</dd>
            <dt className={TEXT_MUTED}>{t.battleTag}</dt>
            <dd className={DD}>{draft.tag}</dd>
            <dt className={TEXT_MUTED}>{t.team}</dt>
            <dd className={DD}>{draft.team ? draft.team.name : t.noTeam}</dd>
          </dl>
        </div>
        {errorKind && (
          <p role="alert" className={TEXT_ERROR}>
            {errorKind === 'closed' ? t.closed : t.error}
          </p>
        )}
        <Actions>
          <Button
            variant="primary"
            size="sm"
            onClick={signup.registerOneClick}
            disabled={busy}
            aria-busy={busy || undefined}
          >
            {busy ? t.registering : t.oneClick}
          </Button>
          {errorKind === 'generic' && (
            <Link prefetch={false} href={signupHref} className={LINK}>
              {t.complete}
            </Link>
          )}
          {details}
        </Actions>
      </>
    );
  } else {
    body = (
      <>
        <p className={TEXT_MUTED}>
          {draft.teamAmbiguous && draft.tag && draft.pseudo.length >= 2
            ? t.chooseTeam
            : t.missingProfile}
        </p>
        <Actions>
          <ButtonLink href={signupHref} variant="primary" size="sm">
            {t.complete}
          </ButtonLink>
          {details}
        </Actions>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-halloween-panel="">
      <p className="font-[family-name:var(--fd)] text-base font-bold text-[#f0a238]">
        {format(t.title, { date })}
      </p>
      <p className={TEXT_MUTED}>{t.intro}</p>
      {body}
    </div>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}
