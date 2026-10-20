// features/player/library/ui/teamHq/TeamHqFurniture.tsx — les meubles prêtés
// au QG, et le prêt de mes meubles (lot 9 de docs/PLAN-womens-library.md).
//
// QUI FAIT QUOI (la règle de l'API, que l'écran ne fait que refléter) :
//   - MES meubles prêtés : « Déplacer » (formulaire sans canevas) et
//     « Reprendre » ;
//   - les meubles des autres : « Rendre » à leur propriétaire, pour la
//     capitaine et les managers seulement (`me.canReturnAny`) — personne ne
//     déplace le meuble d'une autre ;
//   - « Prêter » : mes meubles posés nulle part ; l'API les pose à la première
//     place libre, on les déplace ensuite. Le staff (non membre) ne prête pas.
// Présentationnel : les gestes remontent au panneau, qui les envoie et dit
// leur issue.

import { useState } from 'react';
import { LIBRARY_TEAM_HQ_ITEMS_MAX } from '@/config/library/teamHq';
import { format, useT } from '@/lib/i18n/useT';
import nsPlayerLibrary from '@/lib/i18n/locales/fr/playerLibrary';
import nsTeamHq from '@/lib/i18n/locales/fr/playerLibraryTeamHq';
import { Button } from '@/features/ruban';
import { furnitureName } from '../../model';
import type { PlacementSpec } from '../../placement';
import { sortLentItems } from '../../teamHq/model';
import type { TeamHqPending } from '../../teamHq/useTeamHq';
import type {
  LibraryLentItem,
  LibraryTeamHqSummaryResponse,
} from '../../teamHqResponses';
import { TEXT_MUTED } from '../social/shared';
import { TEAM_HQ_CARD, TEAM_HQ_H3 } from './TeamHqMatch';
import TeamHqMoveForm from './TeamHqMoveForm';

const ROW =
  'flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line2,rgba(194,196,201,.2))] py-2 first:border-t-0';

export type TeamHqFurnitureProps = {
  summary: LibraryTeamHqSummaryResponse;
  specs: ReadonlyMap<string, PlacementSpec>;
  pending: TeamHqPending;
  onLend: (inventoryId: string) => void;
  onMove: (
    item: LibraryLentItem,
    place: { gx: number; gy: number; rotation: number }
  ) => void;
  onGiveBack: (item: LibraryLentItem) => void;
};

export default function TeamHqFurniture({
  summary,
  specs,
  pending,
  onLend,
  onMove,
  onGiveBack,
}: TeamHqFurnitureProps) {
  const t = useT(nsTeamHq);
  const tl = useT(nsPlayerLibrary);
  const [movingId, setMovingId] = useState<string | null>(null);
  const nameOf = (key: string) => furnitureName(tl.furniture, key);
  const items = sortLentItems(summary.items);
  // Le plafond de l'API (`team_hq_full`), dit avant le geste.
  const full = summary.items.length >= LIBRARY_TEAM_HQ_ITEMS_MAX;
  const busy = pending !== null;
  const isPending = (kind: 'lend' | 'giveBack', inventoryId: string) =>
    pending?.kind === kind && pending.inventoryId === inventoryId;

  const owner = (item: LibraryLentItem) =>
    item.mine
      ? t.furniture.lentByMe
      : item.ownerNickname
        ? format(t.furniture.lentBy, { nickname: item.ownerNickname })
        : t.furniture.lentByUnknown;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className={TEAM_HQ_CARD} aria-labelledby="team-hq-lent-title">
        <h3 id="team-hq-lent-title" className={TEAM_HQ_H3}>
          {t.furniture.title}{' '}
          <span className="text-sm font-normal text-[var(--t2,#c7bfca)]">
            ·{' '}
            {format(
              items.length === 1
                ? t.furniture.count_one
                : t.furniture.count_other,
              { count: items.length }
            )}
          </span>
        </h3>
        {items.length === 0 ? (
          <p className={TEXT_MUTED}>{t.furniture.empty}</p>
        ) : (
          <ul className="flex flex-col" data-team-hq-items="">
            {items.map((item) => {
              const name = nameOf(item.key);
              return (
                <li
                  key={item.inventoryId}
                  className={ROW}
                  data-inventory-id={item.inventoryId}
                  data-mine={item.mine ? 'true' : 'false'}
                >
                  <div className="flex flex-col">
                    <span className="font-semibold text-[var(--t1,#f4edf7)]">
                      {name}
                    </span>
                    <span className={TEXT_MUTED}>
                      {owner(item)} ·{' '}
                      {format(t.furniture.position, {
                        gx: item.gx,
                        gy: item.gy,
                      })}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {item.mine && (
                      <Button
                        size="sm"
                        aria-label={format(t.furniture.moveAria, { name })}
                        aria-expanded={movingId === item.inventoryId}
                        disabled={busy}
                        onClick={() =>
                          setMovingId((id) =>
                            id === item.inventoryId ? null : item.inventoryId
                          )
                        }
                      >
                        {t.furniture.move}
                      </Button>
                    )}
                    {item.mine ? (
                      <Button
                        size="sm"
                        aria-label={format(t.furniture.takeBackAria, { name })}
                        disabled={busy}
                        onClick={() => onGiveBack(item)}
                      >
                        {isPending('giveBack', item.inventoryId)
                          ? t.furniture.working
                          : t.furniture.takeBack}
                      </Button>
                    ) : summary.me.canReturnAny ? (
                      <Button
                        size="sm"
                        aria-label={format(t.furniture.giveBackAria, { name })}
                        disabled={busy}
                        onClick={() => onGiveBack(item)}
                      >
                        {isPending('giveBack', item.inventoryId)
                          ? t.furniture.working
                          : t.furniture.giveBack}
                      </Button>
                    ) : null}
                  </div>
                  {movingId === item.inventoryId && (
                    <div className="basis-full">
                      <TeamHqMoveForm
                        item={item}
                        name={name}
                        room={summary}
                        items={summary.items}
                        specs={specs}
                        busy={isPending('lend', item.inventoryId)}
                        onSubmit={(place) => {
                          setMovingId(null);
                          onMove(item, place);
                        }}
                        onCancel={() => setMovingId(null)}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={TEAM_HQ_CARD} aria-labelledby="team-hq-lend-title">
        <h3 id="team-hq-lend-title" className={TEAM_HQ_H3}>
          {t.furniture.lendTitle}
        </h3>
        {!summary.me.member ? (
          <p className={TEXT_MUTED}>{t.codes.team_hq_members_only}</p>
        ) : (
          <>
            <p className={TEXT_MUTED}>{t.furniture.lendIntro}</p>
            {full ? (
              <p className={TEXT_MUTED}>{t.codes.team_hq_full}</p>
            ) : summary.lendable.length === 0 ? (
              <p className={TEXT_MUTED}>{t.furniture.lendEmpty}</p>
            ) : (
              <>
                <p className={TEXT_MUTED}>{t.furniture.lendPlaced}</p>
                <ul className="flex flex-col" data-team-hq-lendable="">
                  {summary.lendable.map((piece) => {
                    const name = nameOf(piece.key);
                    return (
                      <li
                        key={piece.inventoryId}
                        className={ROW}
                        data-inventory-id={piece.inventoryId}
                      >
                        <span className="font-semibold text-[var(--t1,#f4edf7)]">
                          {name}
                        </span>
                        <Button
                          size="sm"
                          variant="secondary"
                          aria-label={format(t.furniture.lendAria, { name })}
                          disabled={busy}
                          onClick={() => onLend(piece.inventoryId)}
                        >
                          {isPending('lend', piece.inventoryId)
                            ? t.furniture.working
                            : t.furniture.lend}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
