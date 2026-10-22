// features/player/library/ui/arena/ArenaActionPanel.tsx — LES GESTES permis
// avec la carte choisie (lot 12 de docs/PLAN-tcg-2.md) : invoquer (et choisir
// ses sacrifices), attaquer une cible de la liste, changer de position.
//
// La liste vient de `legalActions` (moteur synchronisé) : elle PROPOSE, le
// serveur DÉCIDE. Les cibles sont des boutons nommés (« Attaquer Ilios
// (Défense, 2400) ») : on joue tout au clavier, sans viser une image.

import { useEffect, useId, useState } from 'react';
import { format, useT } from '@/lib/i18n/useT';
import nsArena from '@/lib/i18n/locales/fr/playerLibraryArena';
import { Button, Card } from '@/features/ruban';
import type { ArenaFaces } from '../../arena/responses';
import {
  tributesForLevel,
  type ArenaAction,
  type ArenaBoardView,
} from '../../arena/rules';
import {
  faceName,
  findCard,
  isTributeSetAllowed,
  optionsFor,
  type Selection,
} from '../../arena/viewModel';
import { FOCUS_RING, TEXT_MUTED } from './styles';

export default function ArenaActionPanel({
  board,
  faces,
  selection,
  disabled,
  onAct,
  onCancel,
}: {
  board: ArenaBoardView;
  faces: ArenaFaces;
  selection: Selection;
  disabled: boolean;
  onAct: (action: ArenaAction) => void;
  onCancel: () => void;
}) {
  const t = useT(nsArena);
  const ids = useId();
  const [tributes, setTributes] = useState<string[]>([]);
  // Une autre carte choisie : on repart sans sacrifice coché.
  useEffect(() => setTributes([]), [selection?.uid]);

  if (!selection) {
    return <p className={TEXT_MUTED}>{t.duel.selectHint}</p>;
  }
  const card = findCard(board, selection.uid);
  if (!card) return null;
  const name = (uid: string | null) => {
    if (!uid) return '';
    const c = findCard(board, uid);
    return c ? faceName(faces[c.key], c.key, t.anonymous) : t.anonymous;
  };
  const options = optionsFor(board, selection);
  const needed = selection.kind === 'hand' ? tributesForLevel(card.level) : 0;
  const ownMonsters = board.player.field.filter((m) => m !== null);

  let content;
  if (selection.kind === 'hand') {
    if (options.summon.length === 0) {
      content = (
        <p className={TEXT_MUTED}>
          {board.summoned ? t.duel.alreadySummoned : t.duel.noAction}
        </p>
      );
    } else {
      content = (
        <div className="flex flex-col gap-3">
          {needed > 0 && (
            <fieldset className="flex flex-col gap-2">
              <legend className={TEXT_MUTED}>
                {format(t.duel.tributesNeeded, { count: needed })}
              </legend>
              {ownMonsters.map((m) => (
                <label
                  key={m.card.uid}
                  className="flex items-center gap-2 text-sm text-[var(--t1,#f4edf7)]"
                >
                  <input
                    type="checkbox"
                    className={FOCUS_RING}
                    checked={tributes.includes(m.card.uid)}
                    onChange={(e) =>
                      setTributes((cur) =>
                        e.target.checked
                          ? [...cur, m.card.uid]
                          : cur.filter((u) => u !== m.card.uid)
                      )
                    }
                  />
                  {format(t.duel.tribute, { name: name(m.card.uid) })}
                </label>
              ))}
            </fieldset>
          )}
          <div className="flex flex-wrap gap-2">
            {options.summon.map((o) => (
              <Button
                key={o.position}
                variant="primary"
                size="sm"
                disabled={disabled || !isTributeSetAllowed(o, tributes)}
                onClick={() =>
                  onAct({
                    type: 'summon',
                    card: card.uid,
                    position: o.position,
                    tributes,
                  })
                }
              >
                {format(t.duel.summonAs, {
                  position: t.duel.positions[o.position].toLowerCase(),
                })}
              </Button>
            ))}
          </div>
        </div>
      );
    }
  } else {
    const monster = board.player.field.find(
      (m) => m?.card.uid === selection.uid
    );
    const other = monster?.position === 'attack' ? 'defense' : 'attack';
    content =
      options.targets.length === 0 && !options.canChangePosition ? (
        <p className={TEXT_MUTED}>
          {board.turn === 1 ? t.duel.firstTurn : t.duel.noAction}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {options.targets.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label={t.duel.attack}>
              {options.targets.map((target) => {
                const m = target
                  ? board.npc.field.find((x) => x?.card.uid === target)
                  : null;
                return (
                  <li key={target ?? 'direct'}>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={disabled}
                      onClick={() =>
                        onAct({ type: 'attack', attacker: card.uid, target })
                      }
                    >
                      {target && m
                        ? format(t.duel.attackTarget, {
                            name: name(target),
                            position:
                              t.duel.positions[m.position].toLowerCase(),
                            value:
                              m.position === 'attack'
                                ? m.card.attack
                                : m.card.defense,
                          })
                        : t.duel.directAttack}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          {options.canChangePosition && (
            <Button
              variant="secondary"
              size="sm"
              className="self-start"
              disabled={disabled}
              onClick={() =>
                onAct({ type: 'change_position', monster: card.uid })
              }
            >
              {format(t.duel.changePosition, {
                position: t.duel.positions[other].toLowerCase(),
              })}
            </Button>
          )}
        </div>
      );
  }

  return (
    <Card
      as="section"
      aria-labelledby={`${ids}-title`}
      className="flex flex-col gap-3"
      data-arena-actions=""
    >
      <h3 id={`${ids}-title`} className="font-bold text-[var(--t1,#f4edf7)]">
        {format(t.duel.actionsTitle, { name: name(card.uid) })}
      </h3>
      {content}
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        onClick={onCancel}
      >
        {t.duel.cancel}
      </Button>
    </Card>
  );
}
