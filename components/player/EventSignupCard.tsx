// components/player/EventSignupCard.tsx
//
// L'ÉVÉNEMENT DU MOMENT, DANS L'ESPACE JOUEUSE — avec inscription en un clic.
//
// Même source que l'encart de l'accueil (`config/homeEventSpotlight.ts`) :
// l'encart apparaît tout seul tant que l'événement est à l'affiche
// (`visibleUntil`) et disparaît après, sans qu'on pense à le retirer.
//
// EN UN CLIC, PARCE QU'ON SAIT DÉJÀ TOUT. Une joueuse connectée a un pseudo,
// souvent un BattleTag, et une équipe (l'équipe active de son espace, ou son
// unique équipe) : c'est exactement ce que demande le formulaire
// d'inscription regroupée (`dashboardUrls.eventPool`). Le bouton envoie ces
// valeurs et affiche ce qui sera envoyé AVANT le clic — pas d'inscription
// surprise. S'il manque quelque chose (pas de BattleTag valide, plusieurs
// équipes sans équipe active), l'encart renvoie vers la page d'inscription
// au lieu de deviner.
//
// Seuls les événements `pooledTeams` sont gérés ici : c'est le seul parcours
// dont l'API accepte une inscription individuelle sans formulaire.

import Image from 'next/image';

import {
  homeEventSpotlight,
  isHomeEventVisible,
} from '@/config/homeEventSpotlight';
import { Button, ButtonLink, Card } from '@/features/ruban';
import { useLocale } from '@/lib/i18n/useLocale';
import { useT, format } from '@/lib/i18n/useT';
import nsSoloSignup from '@/lib/i18n/locales/fr/soloSignup';
import { useEventOneClickSignup } from '@/features/player/dashboard/hooks/useEventOneClickSignup';

export default function EventSignupCard() {
  const event = homeEventSpotlight;
  const visible =
    isHomeEventVisible(event, new Date().toISOString()) &&
    event.pooledTeams === true;

  const t = useT(nsSoloSignup);
  const locale = useLocale();

  // Lecture, ce que le clic enverrait et inscription : features/player/
  // dashboard (partagé avec le hall de la Library, lot 16).
  const { user, view, draft, registerOneClick, busy, errorKind } =
    useEventOneClickSignup(event?.tournamentId ?? '', visible);
  const error =
    errorKind === 'closed'
      ? t.closedBody
      : errorKind === 'generic'
        ? t.errGeneric
        : null;

  // Rien tant que l'état n'est pas lu : un bouton « en un clic » affiché puis
  // remplacé par « tu es inscrite » ferait cliquer pour rien.
  if (!visible || !event || !user || !view || !draft) return null;

  const signupHref = `/tournament/${event.tournamentSlug}/inscription-solo`;
  const eventHref = `/tournament/${event.tournamentSlug}`;
  const dateLabel = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(event.date));

  // Ce qu'on enverrait : mêmes sources que le formulaire de la page
  // (`eventSignupDraft`). Plusieurs équipes et aucune active : à elle de
  // choisir, sur la page.
  const { pseudo, tag, team, oneClick } = draft;

  const registered = !!view.entry;
  const progress = view.teamProgress;

  return (
    <Card padding="md" className="flex flex-wrap items-center gap-4">
      <Image
        src={event.logoSrc}
        alt={t.eventCardLogoAlt}
        width={72}
        height={72}
        className="h-[72px] w-[72px] shrink-0"
      />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#f0a238]">
          {t.eventCardEyebrow}
        </p>
        <h2 className="font-[family-name:var(--fd)] text-lg font-bold text-[var(--t1,#f4edf7)]">
          {format(t.eventCardTitle, { date: dateLabel })}
        </h2>

        {registered ? (
          <>
            <p className="text-sm text-[var(--lf-200,#b3e7a3)]">
              {t.eventCardRegistered}
            </p>
            {progress && !progress.teamRegistered && (
              <p className="text-xs text-[var(--t3,#a39ba6)]">
                {format(t.poolWaitTeamBody, {
                  count: progress.signedUp,
                  needed: progress.needed,
                  team: progress.team.name,
                })}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-[var(--t2,#c7bfca)]">
              {t.eventCardPitch}
            </p>
            <p className="text-xs text-[var(--t3,#a39ba6)]">
              {oneClick
                ? team
                  ? format(t.eventCardRecapTeam, {
                      pseudo,
                      tag,
                      team: team.name,
                    })
                  : format(t.eventCardRecapSolo, { pseudo, tag })
                : t.eventCardMissingInfo}
            </p>
          </>
        )}
        {error && (
          <p role="alert" className="text-xs text-[var(--err,#ff6b6b)]">
            {error}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {registered ? (
          <ButtonLink href={signupHref} variant="secondary" size="sm">
            {t.eventCardManage}
          </ButtonLink>
        ) : oneClick ? (
          <Button
            variant="primary"
            size="sm"
            onClick={registerOneClick}
            disabled={busy}
          >
            {t.eventCardOneClick}
          </Button>
        ) : (
          <ButtonLink href={signupHref} variant="primary" size="sm">
            {t.eventCardComplete}
          </ButtonLink>
        )}
        <ButtonLink href={eventHref} variant="ghost" size="sm">
          {t.eventCardDetails}
        </ButtonLink>
      </div>
    </Card>
  );
}
