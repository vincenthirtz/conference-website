// features/admin/tasks/hooks/useTaskBoardLive.ts — le board se met à jour
// tout seul quand quelqu'un d'autre le modifie (un autre membre du staff, ou
// le bot Discord via `/kanban`).
//
// Transport : le salon privé `tasks:board:<id>` du Worker temps réel
// (utils/realtime/rooms.ts, ticket staff délivré par l'API à qui a la
// permission `manage_tasks`). conference-api le prévient à chaque
// `task.board_changed` ; le message ne porte AUCUNE donnée, on relit le board
// avec nos propres droits. Sans le transport Cloudflare (repli Supabase, où
// aucun déclencheur ne couvre les tâches), rien n'est écouté.
//
// Pourquoi « attendre » : le détail du board est modifié EN PLACE par le
// glisser-déposer (optimiste). Une relecture qui tomberait pendant un glisser
// ou un déplacement en cours réafficherait l'ancien ordre : on la repousse
// tant que `isBusy()` (useTaskBoardDnd) est vrai. Les messages arrivent aussi
// pour nos propres gestes : la relecture redonne alors ce qu'on voit déjà.
//
// Filet : au retour sur l'onglet après une absence, on relit (une coupure
// réseau a pu faire manquer des messages).

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRealtimeChannel } from '@/hooks/useRealtimeChannel';
import { REALTIME_BACKEND } from '@/utils/realtime/cloudflareRealtime';

/** Plusieurs gestes d'affilée (une colonne déplacée) = une seule relecture. */
const DEBOUNCE_MS = 400;
/** Nouvel essai tant qu'un glisser ou un déplacement est en cours. */
const BUSY_RETRY_MS = 800;
/** Absence de l'onglet au-delà de laquelle on relit au retour. */
const STALE_AFTER_HIDDEN_MS = 30_000;

export function useTaskBoardLive({
  boardId,
  enabled,
  isBusy,
  onRefresh,
}: {
  boardId: string | null;
  /** Faux hors de la vue tableau. */
  enabled: boolean;
  isBusy: () => boolean;
  /** Relit le board (et ses compteurs). */
  onRefresh: () => Promise<void> | void;
}) {
  const [live, setLive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isBusyRef = useRef(isBusy);
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    isBusyRef.current = isBusy;
    onRefreshRef.current = onRefresh;
  });

  const schedule = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    const run = () => {
      if (isBusyRef.current()) {
        timer.current = setTimeout(run, BUSY_RETRY_MS);
        return;
      }
      timer.current = null;
      void onRefreshRef.current();
    };
    timer.current = setTimeout(run, DEBOUNCE_MS);
  }, []);

  const active = enabled && !!boardId && REALTIME_BACKEND === 'cloudflare';

  const onChange = useCallback(() => schedule(), [schedule]);
  const onStatus = useCallback(
    (status: string) => setLive(status === 'SUBSCRIBED'),
    []
  );

  useRealtimeChannel({
    enabled: active,
    channel: `tasks-board-${boardId ?? 'none'}`,
    table: 'tasks',
    filter: boardId ? `board_id=eq.${boardId}` : undefined,
    onChange,
    onStatus,
  });

  useEffect(() => {
    if (!enabled || !boardId || typeof document === 'undefined') {
      return undefined;
    }
    let hiddenAt: number | null = null;
    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
      } else if (
        hiddenAt != null &&
        Date.now() - hiddenAt > STALE_AFTER_HIDDEN_MS
      ) {
        hiddenAt = null;
        schedule();
      }
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [enabled, boardId, schedule]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return { live: active && live };
}
