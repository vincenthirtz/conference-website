// features/player/library/ui/arena/ArenaDuel.tsx — UN DUEL d'arène (lot 12 de
// docs/PLAN-tcg-2.md) : le plateau, les gestes de la carte choisie, le
// journal, la fin.
//
// LE SERVEUR DÉCIDE ; l'écran envoie un geste à la fois (`seq` du dernier état
// vu) et rejoue les étapes rendues — le tour de la gardienne s'affiche PAS À
// PAS, chaque phrase entre dans le journal, une région `role="log"` que le
// lecteur d'écran annonce. Animation réduite : pas de délai, tout s'affiche.
// Échap annule le choix d'une carte.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, useT } from '@/lib/i18n/useT';
import nsArena from '@/lib/i18n/locales/fr/playerLibraryArena';
import { Button } from '@/features/ruban';
import type { ArenaDuelResponse } from '../../arena/responses';
import {
  ARENA_STARTING_LP,
  isArenaOpponent,
  type ArenaAction,
  type ArenaOpponentId,
} from '../../arena/rules';
import { useArenaDuel } from '../../arena/useArena';
import {
  type EventWords,
  faceName,
  type Selection,
} from '../../arena/viewModel';
import { TEXT_ERROR, TEXT_MUTED } from './styles';
import ArenaActionPanel from './ArenaActionPanel';
import ArenaBoard from './ArenaBoard';
import { useArenaCardLabels } from './ArenaCardFace';
import ArenaDuelResult from './ArenaDuelResult';

export default function ArenaDuel({
  duelId,
  opponent,
  initial,
  onExit,
  onAgain,
}: {
  duelId: string;
  opponent: string;
  initial: ArenaDuelResponse | null;
  onExit: () => void;
  onAgain: (opponent: ArenaOpponentId) => void;
}) {
  const t = useT(nsArena);
  const labels = useArenaCardLabels();
  const words: EventWords = useMemo(
    () => ({
      ...t.events,
      positions: {
        attack: t.duel.positions.attack.toLowerCase(),
        defense: t.duel.positions.defense.toLowerCase(),
      },
      anonymous: t.anonymous,
    }),
    [t]
  );
  const duel = useArenaDuel(duelId, words, initial);
  const [selection, setSelection] = useState<Selection>(null);
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const logRef = useRef<HTMLOListElement>(null);
  const logLength = duel.log.length;

  // Le journal défile vers sa dernière ligne (la plus récente est en bas).
  useEffect(() => {
    const el = logRef.current;
    if (el && logLength > 0) el.scrollTop = el.scrollHeight;
  }, [logLength]);

  const board = duel.board;
  const final = duel.data?.duel.board ?? null;
  const myTurn =
    !!final && final.status === 'active' && final.active === 'player';
  const locked = duel.busy || !myTurn;
  const opponentName =
    (t.lobby.challenges as Record<string, { name: string }>)[opponent]?.name ??
    opponent;

  // Une sélection qui n'existe plus (carte jouée, monstre détruit, duel fini)
  // s'efface.
  useEffect(() => {
    if (!selection || !final) return;
    const still =
      selection.kind === 'hand'
        ? final.player.hand.some((c) => c.uid === selection.uid)
        : final.player.field.some((m) => m?.card.uid === selection.uid);
    if (!still || final.status !== 'active') setSelection(null);
  }, [final, selection]);

  // Échap annule le choix.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelection(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const act = useCallback(
    (action: ArenaAction) => {
      void duel.act(action);
    },
    [duel]
  );

  if (!board || !final) {
    if (duel.loadError) {
      return (
        <div role="alert" className="flex flex-wrap items-center gap-4">
          <p className={TEXT_ERROR}>{t.error}</p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void duel.reload()}
          >
            {t.retry}
          </Button>
          <Button variant="ghost" size="sm" onClick={onExit}>
            {t.result.backLobby}
          </Button>
        </div>
      );
    }
    return (
      <p role="status" className={TEXT_MUTED}>
        {t.loading}
      </p>
    );
  }

  const ended = final.status !== 'active' && !duel.replaying;
  const dropped = duel.data?.dropped ?? [];
  const notice = duel.notice;
  const noticeText =
    notice?.kind === 'stale'
      ? t.duel.stale
      : notice?.kind === 'refused'
        ? notice.code === 'no_attack_first_turn'
          ? t.duel.firstTurn
          : notice.code === 'already_summoned'
            ? t.duel.alreadySummoned
            : ((t.errors as Record<string, string>)[notice.code] ??
              t.duel.refused)
        : notice?.kind === 'error'
          ? t.duel.error
          : null;

  return (
    <div
      className="flex flex-col gap-5"
      data-arena-duel={duelId}
      data-arena-status={final.status}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--t1,#f4edf7)]">
            {format(t.duel.title, { name: opponentName })}
          </h2>
          <p className={TEXT_MUTED} data-arena-turn="">
            {format(t.duel.turn, { turn: board.turn, limit: board.turnLimit })}
            {' · '}
            {final.status !== 'active'
              ? t.outcome[final.status]
              : duel.replaying || board.active === 'npc'
                ? t.duel.guardianTurn
                : t.duel.yourTurn}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {duel.replaying && (
            <Button variant="ghost" size="sm" onClick={duel.skip}>
              {t.duel.skip}
            </Button>
          )}
          {final.status === 'active' &&
            (confirmAbandon ? (
              <div
                className="flex flex-wrap items-center gap-2"
                role="group"
                aria-label={t.duel.abandon}
              >
                <span className="text-sm text-[var(--t1,#f4edf7)]">
                  {t.duel.abandonConfirm}
                </span>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={duel.pending}
                  onClick={() => {
                    setConfirmAbandon(false);
                    void duel.abandon();
                  }}
                >
                  {t.duel.abandonYes}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmAbandon(false)}
                >
                  {t.duel.abandonNo}
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setConfirmAbandon(true)}
              >
                {t.duel.abandon}
              </Button>
            ))}
        </div>
      </div>

      {dropped.length > 0 && (
        <p role="note" className="text-sm text-[var(--warn,#f5b342)]">
          {format(t.duel.dropped, {
            count: dropped.length,
            names: dropped
              .map((k) => faceName(duel.faces[k], k, t.anonymous))
              .join(', '),
          })}
        </p>
      )}

      {ended && (
        <ArenaDuelResult
          board={final}
          reward={duel.data?.duel.reward ?? null}
          onAgain={() => isArenaOpponent(opponent) && onAgain(opponent)}
          onBack={onExit}
          onReload={() => void duel.reload()}
        />
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <ArenaBoard
          board={board}
          faces={duel.faces}
          labels={labels}
          startingLp={ARENA_STARTING_LP}
          handlers={{
            locked,
            selection,
            onPickHand: (uid) =>
              setSelection((s) =>
                s?.kind === 'hand' && s.uid === uid
                  ? null
                  : { kind: 'hand', uid }
              ),
            onPickMonster: (uid) =>
              setSelection((s) =>
                s?.kind === 'monster' && s.uid === uid
                  ? null
                  : { kind: 'monster', uid }
              ),
          }}
        />
        <div className="flex min-w-0 flex-col gap-4">
          {!ended && myTurn && !duel.replaying && (
            <>
              <ArenaActionPanel
                board={final}
                faces={duel.faces}
                selection={selection}
                disabled={duel.busy}
                onAct={act}
                onCancel={() => setSelection(null)}
              />
              <Button
                variant="primary"
                size="md"
                disabled={duel.busy}
                onClick={() => {
                  setSelection(null);
                  act({ type: 'end_turn' });
                }}
              >
                {t.duel.endTurn}
              </Button>
            </>
          )}
          {duel.replaying && (
            <p role="status" className={TEXT_MUTED}>
              {t.duel.playing}
            </p>
          )}
          {noticeText && (
            <p role="alert" className={TEXT_ERROR}>
              {noticeText}
            </p>
          )}
          <section
            aria-labelledby="arena-log-title"
            className="flex flex-col gap-2"
          >
            <h3
              id="arena-log-title"
              className="font-bold text-[var(--t1,#f4edf7)]"
            >
              {t.duel.log}
            </h3>
            <ol
              ref={logRef}
              role="log"
              aria-live="polite"
              aria-labelledby="arena-log-title"
              className="flex max-h-72 flex-col gap-1 overflow-y-auto text-sm text-[var(--t2,#c7bfca)]"
              data-arena-log=""
            >
              {duel.log.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
