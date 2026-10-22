// features/player/library/ui/arena/ArenaBoard.tsx — le PLATEAU d'un duel
// d'arène (lot 12 de docs/PLAN-tcg-2.md) : la gardienne en haut (points de
// vie, deck, main — son NOMBRE seul —, trois zones, cimetière), moi en bas
// (trois zones, ma main).
//
// AUCUNE INFORMATION PAR LA COULEUR SEULE : chaque zone dit son numéro et
// « vide » ou la position écrite (« Attaque » / « Défense ») ; chaque carte
// jouable est un BOUTON dont le nom accessible dit la carte et ses chiffres.
// Les cartes de la gardienne ne sont pas des boutons : on les cible depuis
// le panneau des gestes (une liste, au clavier).
//
// Le plateau MONTRÉ peut être une étape rejouée (le tour de la gardienne) :
// pendant un rejeu, rien n'est cliquable.

import { format, useT } from '@/lib/i18n/useT';
import nsArena from '@/lib/i18n/locales/fr/playerLibraryArena';
import type { ArenaFaces } from '../../arena/responses';
import type {
  ArenaBoardView,
  ArenaCard,
  ArenaField,
  ArenaMonster,
} from '../../arena/rules';
import { faceName, type Selection } from '../../arena/viewModel';
import { FOCUS_RING, TEXT_MUTED } from './styles';
import ArenaCardFace, { type ArenaCardLabels } from './ArenaCardFace';

const CARD_W = 'w-[5.5rem] sm:w-28';
const SLOT = `${CARD_W} flex min-h-[9.5rem] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--line2,rgba(194,196,201,.2))] p-1 text-center text-[11px] text-[var(--t2,#c7bfca)] sm:min-h-[11.5rem]`;
const PICKABLE = `rounded-lg ${FOCUS_RING} disabled:cursor-default`;
const PICKED =
  'outline outline-2 outline-offset-2 outline-[var(--color-yellow,#f5c542)]';

function LifeBar({
  lp,
  max,
  label,
}: {
  lp: number;
  max: number;
  label: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round((lp / max) * 100)));
  return (
    <div className="flex min-w-[8rem] flex-col gap-1">
      <span className="font-[family-name:var(--fd,Archivo,sans-serif)] text-lg font-bold text-[var(--t1,#f4edf7)]">
        {label}
      </span>
      <span
        aria-hidden="true"
        className="block h-1.5 w-full overflow-hidden rounded-full bg-[rgba(255,255,255,.08)]"
      >
        <span
          className="block h-full rounded-full bg-[var(--or,#b467d1)] motion-safe:transition-[width] motion-safe:duration-500"
          style={{ width: `${pct}%` }}
        />
      </span>
    </div>
  );
}

export type BoardHandlers = {
  /** Rien n'est cliquable (rejeu, geste en vol, pas mon tour). */
  locked: boolean;
  selection: Selection;
  onPickHand: (uid: string) => void;
  onPickMonster: (uid: string) => void;
};

export default function ArenaBoard({
  board,
  faces,
  labels,
  startingLp,
  handlers,
}: {
  board: ArenaBoardView;
  faces: ArenaFaces;
  labels: ArenaCardLabels;
  startingLp: number;
  handlers: BoardHandlers;
}) {
  const t = useT(nsArena);
  const name = (c: ArenaCard) => faceName(faces[c.key], c.key, t.anonymous);
  const cardAria = (c: ArenaCard) =>
    format(t.duel.cardAria, {
      name: name(c),
      level: c.level,
      attack: c.attack,
      defense: c.defense,
    });
  const monsterAria = (m: ArenaMonster) =>
    format(t.duel.monsterAria, {
      name: name(m.card),
      position: t.duel.positions[m.position],
      level: m.card.level,
      attack: m.card.attack,
      defense: m.card.defense,
    });

  const zones = (field: ArenaField, mine: boolean) => (
    <ol className="flex flex-wrap justify-center gap-2 sm:gap-4">
      {field.map((m, zone) => {
        const n = zone + 1;
        if (!m) {
          return (
            <li key={zone} className={SLOT} data-arena-zone={n}>
              {format(t.duel.zoneEmpty, { n })}
            </li>
          );
        }
        const picked =
          handlers.selection?.kind === 'monster' &&
          handlers.selection.uid === m.card.uid;
        const face = (
          <>
            <span
              className={`block w-full motion-safe:transition-transform motion-safe:duration-300 ${
                m.position === 'defense' ? 'opacity-90 saturate-[.7]' : ''
              }`}
            >
              <ArenaCardFace
                card={m.card}
                face={faces[m.card.key]}
                labels={labels}
              />
            </span>
            <span
              className={`mt-1 inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] ${
                m.position === 'attack'
                  ? 'border-[rgba(255,120,150,.5)] text-[rgb(255,170,190)]'
                  : 'border-[rgba(120,170,255,.5)] text-[rgb(170,200,255)]'
              }`}
            >
              <span aria-hidden="true">
                {m.position === 'attack' ? '⚔ ' : '🛡 '}
              </span>
              {t.duel.positions[m.position]}
            </span>
          </>
        );
        return (
          <li
            key={zone}
            className={`${CARD_W} flex flex-col items-center`}
            data-arena-zone={n}
            data-arena-position={m.position}
          >
            <span className="sr-only">{format(t.duel.zone, { n })}</span>
            {mine ? (
              <button
                type="button"
                className={`${PICKABLE} flex w-full flex-col items-center ${picked ? PICKED : ''}`}
                aria-pressed={picked}
                aria-label={monsterAria(m)}
                disabled={handlers.locked}
                onClick={() => handlers.onPickMonster(m.card.uid)}
              >
                {face}
              </button>
            ) : (
              <div
                className="flex w-full flex-col items-center"
                role="img"
                aria-label={monsterAria(m)}
              >
                {face}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );

  const sideInfo = (
    who: string,
    lp: number,
    extra: string[],
    graveyard: number
  ) => (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
      <p className="sr-only">{format(t.duel.lpAria, { who, lp })}</p>
      <div aria-hidden="true">
        <p className="text-xs uppercase tracking-[0.12em] text-[var(--t2,#c7bfca)]">
          {who}
        </p>
        <LifeBar lp={lp} max={startingLp} label={format(t.duel.lp, { lp })} />
      </div>
      <p className={TEXT_MUTED}>
        {[...extra, format(t.duel.graveyard, { count: graveyard })].join(' · ')}
      </p>
    </div>
  );

  return (
    <div
      className="flex min-w-0 flex-col gap-5"
      data-arena-board=""
      data-turn={board.turn}
    >
      <section
        aria-label={t.duel.guardianField}
        className="flex flex-col gap-3 rounded-[var(--r-card,14px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[rgba(120,170,255,.04)] p-3"
        data-arena-side="npc"
      >
        {sideInfo(
          t.duel.guardian,
          board.npc.lp,
          [
            format(t.duel.deckCount, { count: board.npc.deckCount }),
            format(t.duel.handCount, { count: board.npc.handCount }),
          ],
          board.npc.graveyard.length
        )}
        <div className="flex gap-1" aria-hidden="true">
          {Array.from({ length: Math.min(board.npc.handCount, 12) }, (_, i) => (
            <span
              key={i}
              className="block h-8 w-6 rounded border border-[var(--line2,rgba(194,196,201,.2))] bg-[linear-gradient(135deg,#3a1d4a,#140a1a)]"
            />
          ))}
        </div>
        {zones(board.npc.field, false)}
      </section>

      <section
        aria-label={t.duel.field}
        className="flex flex-col gap-3 rounded-[var(--r-card,14px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[rgba(255,120,150,.04)] p-3"
        data-arena-side="player"
      >
        {zones(board.player.field, true)}
        {sideInfo(
          t.duel.you,
          board.player.lp,
          [format(t.duel.deckCount, { count: board.player.deckCount })],
          board.player.graveyard.length
        )}
      </section>

      <section aria-label={t.duel.hand} data-arena-hand="">
        <h3 className="mb-2 font-bold text-[var(--t1,#f4edf7)]">
          {t.duel.hand}
        </h3>
        {board.player.hand.length === 0 ? (
          <p className={TEXT_MUTED}>{t.duel.handEmpty}</p>
        ) : (
          <ul className="relative flex gap-2 overflow-x-auto pb-2">
            {board.player.hand.map((c) => {
              const picked =
                handlers.selection?.kind === 'hand' &&
                handlers.selection.uid === c.uid;
              return (
                <li key={c.uid} className={`${CARD_W} shrink-0`}>
                  <button
                    type="button"
                    className={`${PICKABLE} block w-full ${picked ? PICKED : ''}`}
                    aria-pressed={picked}
                    aria-label={cardAria(c)}
                    disabled={handlers.locked}
                    onClick={() => handlers.onPickHand(c.uid)}
                  >
                    <ArenaCardFace
                      card={c}
                      face={faces[c.key]}
                      labels={labels}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
