// features/player/library/ui/teamHq/TeamHqDoor.tsx — la porte « QG de mon
// équipe » (lot 9 de docs/PLAN-womens-library.md) : les QG des équipes où je
// suis membre acceptée ; « Entrer au QG » l'ouvre (créé à la première visite)
// puis mène à la salle, `/player/library?room=<id>`.
//
// À poser là où l'on choisit un lieu (la navigation des lieux et le hall du
// lot 7) : elle ne suppose rien de l'écran qui l'accueille, sinon que la porte
// de la Library est franchie (`enabled`) et que le cache joueuse est là (sans
// lui, elle se tait au lieu de lever). Les refus (`room_forbidden`,
// `team_not_found`…) sont dits, jamais avalés. Le routeur n'est lu qu'au
// clic (`Router.push`) : la porte se rend aussi hors d'une page Next.

import Link from 'next/link';
import Router from 'next/router';
import { type ReactNode, useContext, useState } from 'react';
import { QueryClientContext } from '@tanstack/react-query';
import { format, useT } from '@/lib/i18n/useT';
import nsTeamHq from '@/lib/i18n/locales/fr/playerLibraryTeamHq';
import { Button } from '@/features/ruban';
import { teamHqRoomHref } from '../../teamHq/model';
import { useTeamHqList, useTeamHqOpen } from '../../teamHq/useTeamHq';
import { LINK, TEXT_ERROR, TEXT_MUTED } from '../social/shared';
import TeamHqLogo from './TeamHqLogo';

const JOIN_TEAM_HREF = '/player/join-team';

export type TeamHqDoorProps = {
  /** La porte de la Library est franchie (sinon rien n'est lu). */
  enabled?: boolean;
  /** Où mener une fois le QG ouvert ; défaut : `Router.push`. */
  onNavigate?: (href: string) => void;
  /** Titre de niveau 2 (défaut) ou 3, selon l'écran qui l'accueille. */
  headingLevel?: 2 | 3;
};

export default function TeamHqDoor(props: TeamHqDoorProps) {
  const queryClient = useContext(QueryClientContext);
  return queryClient ? <TeamHqDoorInner {...props} /> : null;
}

function TeamHqDoorInner({
  enabled = true,
  onNavigate,
  headingLevel = 2,
}: TeamHqDoorProps) {
  const t = useT(nsTeamHq);
  const list = useTeamHqList(enabled);
  const { open, openingTeamId } = useTeamHqOpen();
  const [error, setError] = useState<string | null>(null);
  const Heading = headingLevel === 3 ? 'h3' : 'h2';

  const enter = async (teamId: string) => {
    setError(null);
    const result = await open(teamId);
    if (!result) return;
    if (!result.ok) {
      setError(t.codes[result.code]);
      return;
    }
    const href = teamHqRoomHref(result.data.roomId);
    if (onNavigate) onNavigate(href);
    else void Router.push(href);
  };

  let body: ReactNode;
  if (!enabled || list.isPending) {
    body = (
      <p role="status" className={TEXT_MUTED}>
        {t.door.loading}
      </p>
    );
  } else if (list.isError || !list.data) {
    body = (
      <div role="alert" className="flex flex-wrap items-center gap-3">
        <p className={TEXT_ERROR}>{t.door.error}</p>
        <Button size="sm" onClick={() => void list.refetch()}>
          {t.door.retry}
        </Button>
      </div>
    );
  } else if (list.data.teams.length === 0) {
    body = (
      <p className={TEXT_MUTED}>
        {t.door.none}{' '}
        <Link prefetch={false} href={JOIN_TEAM_HREF} className={LINK}>
          {t.door.joinLink}
        </Link>
      </p>
    );
  } else {
    body = (
      <ul className="flex flex-col gap-2" data-team-hq-door-list="">
        {list.data.teams.map((team) => (
          <li
            key={team.teamId}
            className="flex flex-wrap items-center justify-between gap-3"
            data-team-id={team.teamId}
          >
            <span className="flex items-center gap-3">
              <TeamHqLogo src={team.logoUrl} alt="" size={32} />
              <span className="flex flex-col">
                <span className="font-semibold text-[var(--t1,#f4edf7)]">
                  {team.name}
                </span>
                {team.roomId === null && (
                  <span className="text-xs text-[var(--t3,#a39ba6)]">
                    {t.door.notCreated}
                  </span>
                )}
              </span>
            </span>
            <Button
              size="sm"
              variant="secondary"
              aria-label={format(t.door.enterAria, { team: team.name })}
              disabled={openingTeamId !== null}
              onClick={() => void enter(team.teamId)}
            >
              {openingTeamId === team.teamId ? t.door.entering : t.door.enter}
            </Button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section
      className="flex flex-col gap-3"
      aria-labelledby="team-hq-door-title"
      data-team-hq-door=""
    >
      <Heading
        id="team-hq-door-title"
        className="text-base font-bold text-[var(--t1,#f4edf7)]"
      >
        {t.door.title}
      </Heading>
      <p className={TEXT_MUTED}>{t.door.intro}</p>
      {body}
      {error && (
        <p role="alert" className={TEXT_ERROR}>
          {error}
        </p>
      )}
    </section>
  );
}
