// features/player/library/ui/arena/ArenaApp.tsx — l'écran de l'ARÈNE, une fois
// la porte de la Library franchie (lot 12 de docs/PLAN-tcg-2.md) : le SALON
// (la gardienne, ses défis, le paquet de la semaine, mon historique), le DECK,
// le DUEL — trois vues d'un même écran, jouables au clavier.
//
// CHARGÉ À LA DEMANDE par la porte des lieux (`PlaceScreen`, `next/dynamic`) :
// moteur, cartes et textes de l'arène restent hors du premier chargement de
// `/player/library`. Il n'importe donc RIEN des modules de ce premier
// chargement propres à la Library (porte, lieux, styles partagés) : les
// partager redécoupe les morceaux de la page et coûte au gel de bundle.

import { useState } from 'react';
import { useT } from '@/lib/i18n/useT';
import nsArena from '@/lib/i18n/locales/fr/playerLibraryArena';
import type { ArenaDuelResponse } from '../../arena/responses';
import type { ArenaOpponentId } from '../../arena/rules';
import { useArenaLobby, useStartArenaDuel } from '../../arena/useArena';
import { errorCodeOf } from '../../arena/viewModel';
import ArenaDeckBuilder from './ArenaDeckBuilder';
import ArenaDuel from './ArenaDuel';
import ArenaLobby from './ArenaLobby';
import { FOCUS_RING } from './styles';

type View =
  | { kind: 'lobby' }
  | { kind: 'deck' }
  | {
      kind: 'duel';
      id: string;
      opponent: string;
      initial: ArenaDuelResponse | null;
    };

const TAB = `inline-flex min-h-10 items-center rounded-full border px-3 text-sm font-semibold ${FOCUS_RING}`;
const TAB_IDLE =
  'border-[var(--line2,rgba(194,196,201,.2))] text-[var(--t2,#c7bfca)] hover:text-[var(--t1,#f4edf7)]';
const TAB_ON =
  'border-[var(--or,#b467d1)] bg-[rgba(180,103,209,.15)] text-[var(--t1,#f4edf7)]';

export default function ArenaApp() {
  const t = useT(nsArena);
  const [view, setView] = useState<View>({ kind: 'lobby' });
  const lobby = useArenaLobby(view.kind === 'lobby');
  const start = useStartArenaDuel();

  const startDuel = (opponent: ArenaOpponentId) => {
    start.mutate(opponent, {
      onSuccess: (res) =>
        setView({ kind: 'duel', id: res.duel.id, opponent, initial: res }),
    });
  };

  if (view.kind === 'duel') {
    return (
      <ArenaDuel
        key={view.id}
        duelId={view.id}
        opponent={view.opponent}
        initial={view.initial}
        onExit={() => setView({ kind: 'lobby' })}
        onAgain={(opponent) => {
          setView({ kind: 'lobby' });
          startDuel(opponent);
        }}
      />
    );
  }

  return (
    <>
      <nav aria-label={t.tabs.label} className="mb-6">
        <ul className="flex flex-wrap gap-2">
          {(['lobby', 'deck'] as const).map((id) => (
            <li key={id}>
              <button
                type="button"
                aria-current={view.kind === id ? 'page' : undefined}
                onClick={() => setView({ kind: id })}
                className={`${TAB} ${view.kind === id ? TAB_ON : TAB_IDLE}`}
              >
                {t.tabs[id]}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {view.kind === 'deck' ? (
        <ArenaDeckBuilder onBack={() => setView({ kind: 'lobby' })} />
      ) : (
        <ArenaLobby
          query={lobby}
          starting={start.isPending}
          startError={
            start.error ? (errorCodeOf(start.error) ?? 'error') : null
          }
          onEditDeck={() => setView({ kind: 'deck' })}
          onStart={startDuel}
          onResume={(id, opponent) =>
            setView({ kind: 'duel', id, opponent, initial: null })
          }
        />
      )}
    </>
  );
}
