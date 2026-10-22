// features/player/library/ui/arena/ArenaDuelResult.tsx — la FIN d'un duel
// d'arène (lot 12 de docs/PLAN-tcg-2.md) : l'issue, sa raison, les points de
// vie, et l'état de la récompense — « paquet de la semaine gagné », « déjà
// gagné cette semaine », « en cours d'écriture », ou rien (seule une victoire
// rapporte). Jamais de pièces.

import { useEffect, useRef } from 'react';
import { format, useT } from '@/lib/i18n/useT';
import nsArena from '@/lib/i18n/locales/fr/playerLibraryArena';
import { Button, ButtonLink, Card } from '@/features/ruban';
import type { ArenaReward } from '../../arena/responses';
import type { ArenaBoardView } from '../../arena/rules';
import { weekText } from '../../arena/viewModel';
import { TEXT_MUTED } from './styles';

export default function ArenaDuelResult({
  board,
  reward,
  onAgain,
  onBack,
  onReload,
}: {
  board: ArenaBoardView;
  reward: ArenaReward | null;
  onAgain: () => void;
  onBack: () => void;
  onReload: () => void;
}) {
  const t = useT(nsArena);
  const titleRef = useRef<HTMLHeadingElement>(null);
  // La fin prend le focus (et la vue) : le lecteur d'écran l'annonce, l'œil
  // la trouve sans chercher.
  useEffect(() => {
    titleRef.current?.focus();
  }, []);
  if (board.status === 'active') return null;
  const status = board.status;
  const reason = board.endReason
    ? format(t.reason[board.endReason], { limit: board.turnLimit })
    : null;

  let rewardLine;
  if (reward?.status === 'granted') {
    rewardLine = (
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-semibold text-[var(--color-yellow,#f5c542)]">
          {t.result.rewardGranted}
        </p>
        <ButtonLink href="/player/tcg" variant="secondary" size="sm">
          {t.result.rewardOpen}
        </ButtonLink>
      </div>
    );
  } else if (reward?.status === 'week_already') {
    rewardLine = (
      <p className={TEXT_MUTED}>
        {format(t.result.rewardWeekAlready, {
          week: weekText(reward.week, t.weekLabel),
        })}
      </p>
    );
  } else if (reward?.status === 'pending') {
    rewardLine = (
      <div className="flex flex-wrap items-center gap-3">
        <p className={TEXT_MUTED}>{t.result.rewardPending}</p>
        <Button variant="secondary" size="sm" onClick={onReload}>
          {t.result.rewardReload}
        </Button>
      </div>
    );
  } else {
    rewardLine = <p className={TEXT_MUTED}>{t.result.rewardNone}</p>;
  }

  return (
    <Card
      as="section"
      live={status === 'won'}
      aria-labelledby="arena-result-title"
      className="flex flex-col gap-3"
      data-arena-result={status}
      data-arena-reward={reward?.status ?? 'none'}
    >
      <h2
        ref={titleRef}
        tabIndex={-1}
        id="arena-result-title"
        className="font-[family-name:var(--fd,Archivo,sans-serif)] text-2xl font-bold text-[var(--t1,#f4edf7)] focus:outline-none"
      >
        {t.result.title[status]}
      </h2>
      {reason && (
        <p className={TEXT_MUTED}>{format(t.result.reasonLine, { reason })}</p>
      )}
      <p className={TEXT_MUTED}>
        {format(t.result.lpLine, {
          player: board.player.lp,
          npc: board.npc.lp,
        })}
      </p>
      {rewardLine}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" onClick={onAgain}>
          {t.result.again}
        </Button>
        <Button variant="ghost" size="sm" onClick={onBack}>
          {t.result.backLobby}
        </Button>
      </div>
    </Card>
  );
}
