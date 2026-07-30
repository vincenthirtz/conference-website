// components/admin/caster/MvpPollPanel.tsx
//
// Poll MVP live du cockpit caster web (lot 4) — port de
// womenscup-caster/src/main/mvpPoll.js. Le desktop tient le poll en mémoire
// dans le process principal et le pousse en SSE vers l'overlay ; ici l'état vit
// dans ce composant (machine pure utils/caster/mvpPollState) et le tally est
// PUBLIÉ dans `caster_scenes.data` de la scène `mvp` — que l'overlay hébergé
// (components/overlay/caster/CasterMvpOverlay) lit déjà comme snapshot.
//
// ⚠️ Ce panneau est monté au niveau de la page (CasterChatSection), PAS dans
// l'éditeur de scène : il doit rester monté quand le caster change de scène
// sélectionnée, sinon les votes en cours seraient perdus.
//
// Les votes arrivent du chat Twitch par abonnement SYNCHRONE
// (subscribeMessages) : aucun rendu intermédiaire ne peut en perdre un. La
// publication est DEBOUNCÉE (~1,5 s) pour ne pas marteler Supabase pendant un
// flux de votes ; les changements d'état (ouvrir/fermer/reset) publient tout de
// suite pour que l'overlay bascule sans latence.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { logCasterAction } from '@/utils/caster/auditClient';
import { normalizeCandidates, parseVoteCommand } from '@/utils/caster/mvpTally';
import {
  MIN_CANDIDATES,
  buildPollSnapshot,
  castVote,
  createPollState,
  resetVotes,
  startPoll,
  stopPoll,
  syncCandidates,
  type MvpPollState,
} from '@/utils/caster/mvpPollState';
import type { CasterScene } from '@/types/caster';

import type { ChatMessageListener } from './useTwitchChat';

/** Fenêtre de regroupement des publications pendant un flux de votes. */
export const PUBLISH_DEBOUNCE_MS = 1500;

const smallBtnClass =
  'px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium disabled:opacity-50';

type Props = {
  /** Scène de type `mvp` (null si la table n'en contient pas). */
  scene: CasterScene | null;
  onSave: (sceneId: string, data: Record<string, unknown>) => Promise<void>;
  subscribeMessages: (cb: ChatMessageListener) => () => void;
  /** Le chat est-il connecté ? (sinon aucun vote n'arrivera) */
  chatConnected: boolean;
};

export default function MvpPollPanel({
  scene,
  onSave,
  subscribeMessages,
  chatConnected,
}: Props) {
  const t = useAdminT('adminCasterScenes');
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();

  const [poll, setPoll] = useState<MvpPollState>(createPollState);
  const [publishing, setPublishing] = useState(false);

  // Candidates + titre viennent de la scène (éditées dans MvpSceneEditor).
  const rawData = useMemo(
    () => (scene?.data || {}) as Record<string, unknown>,
    [scene]
  );
  const candidates = useMemo(
    () => normalizeCandidates(rawData.candidates),
    [rawData]
  );
  const title = String(rawData.title || 'Vote MVP');

  // Signature stable de la liste : évite de re-synchroniser (et de republier) à
  // chaque écho Realtime qui recrée un tableau identique.
  const candidatesKey = candidates.map((c) => `${c.id}:${c.label}`).join('|');

  // --- Refs de travail (les handlers ne doivent pas capturer un état périmé) --
  const stateRef = useRef(poll);
  const candidatesRef = useRef(candidates);
  candidatesRef.current = candidates;
  const rawRef = useRef(rawData);
  rawRef.current = rawData;
  const titleRef = useRef(title);
  titleRef.current = title;
  const sceneIdRef = useRef<string | null>(scene?.id ?? null);
  sceneIdRef.current = scene?.id ?? null;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const tRef = useRef(t);
  tRef.current = t;

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // --- Publication vers la scène (= vers l'overlay) --------------------------

  const publishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const publishNow = useCallback(async () => {
    const sceneId = sceneIdRef.current;
    if (!sceneId) return;
    const snapshot = buildPollSnapshot(
      stateRef.current,
      candidatesRef.current,
      titleRef.current
    );
    if (alive.current) setPublishing(true);
    try {
      // Spread de la data brute d'abord : les champs inconnus de ce panneau
      // (brand, labels de thème…) sont préservés, comme dans les éditeurs.
      await onSaveRef.current(sceneId, { ...rawRef.current, ...snapshot });
    } catch (err) {
      if (alive.current) {
        addToast(
          format(tRef.current.mvpPollPublishError, {
            message: (err as Error)?.message || '',
          }),
          'error'
        );
      }
    } finally {
      if (alive.current) setPublishing(false);
    }
  }, [addToast]);

  const schedulePublish = useCallback(
    (immediate = false) => {
      if (publishTimer.current) {
        clearTimeout(publishTimer.current);
        publishTimer.current = null;
      }
      if (immediate) {
        void publishNow();
        return;
      }
      publishTimer.current = setTimeout(() => {
        publishTimer.current = null;
        void publishNow();
      }, PUBLISH_DEBOUNCE_MS);
    },
    [publishNow]
  );

  // Flush du debounce au démontage : un dernier vote ne doit pas rester en l'air.
  useEffect(() => {
    return () => {
      if (publishTimer.current) {
        clearTimeout(publishTimer.current);
        publishTimer.current = null;
        void publishNow();
      }
    };
  }, [publishNow]);

  /** Applique un nouvel état (ref + render) et programme la publication. */
  const applyState = useCallback(
    (next: MvpPollState, immediate = false) => {
      if (next === stateRef.current) return;
      stateRef.current = next;
      setPoll(next);
      schedulePublish(immediate);
    },
    [schedulePublish]
  );

  // --- Votes du chat --------------------------------------------------------

  useEffect(() => {
    const off = subscribeMessages((msg) => {
      const arg = parseVoteCommand(msg.message);
      if (arg == null) return;
      // Clé de vote = le login IRC (stable, minuscule) plutôt que le
      // display-name du desktop : même dédoublonnage, insensible à la casse.
      const user = msg.nick || msg.displayName;
      const res = castVote(stateRef.current, candidatesRef.current, user, arg);
      if (!res.accepted || res.state === stateRef.current) return;
      stateRef.current = res.state;
      setPoll(res.state);
      schedulePublish();
    });
    return off;
  }, [subscribeMessages, schedulePublish]);

  // La liste de candidates a changé (édition dans MvpSceneEditor) : on purge
  // les votes orphelins, sans republier si rien n'a bougé.
  useEffect(() => {
    const next = syncCandidates(stateRef.current, candidatesRef.current);
    if (next === stateRef.current) return;
    stateRef.current = next;
    setPoll(next);
    schedulePublish();
  }, [candidatesKey, schedulePublish]);

  // --- Actions --------------------------------------------------------------

  function onStart() {
    const next = startPoll(stateRef.current, candidatesRef.current);
    if (!next) {
      addToast(
        format(t.mvpPollNeedCandidates, { min: MIN_CANDIDATES }),
        'error'
      );
      return;
    }
    applyState(next, true);
    addToast(t.mvpPollStarted, 'success');
    // Journal (lot 5) : ouvrir/fermer le vote change ce que voit le public.
    logCasterAction({
      action: 'caster_poll_toggle',
      entityId: scene?.id ?? null,
      details: {
        open: true,
        candidates: candidatesRef.current.map((c) => c.label),
      },
    });
  }

  function onStop() {
    applyState(stopPoll(stateRef.current), true);
    addToast(t.mvpPollStopped, 'info');
    logCasterAction({
      action: 'caster_poll_toggle',
      entityId: scene?.id ?? null,
      details: { open: false, total: stateRef.current.votes.size },
    });
  }

  async function onReset() {
    const ok = await confirm({
      title: t.mvpPollResetConfirmTitle,
      subtitle: t.mvpPollResetConfirmBody,
      variant: 'warning',
      confirmLabel: t.mvpPollResetConfirmLabel,
    });
    if (!ok) return;
    applyState(resetVotes(stateRef.current), true);
    addToast(t.mvpPollResetDone, 'info');
  }

  // --- Rendu ----------------------------------------------------------------

  const snapshot = buildPollSnapshot(poll, candidates, title);
  const sorted = [...snapshot.candidates].sort((a, b) => b.count - a.count);

  const statusLabel = poll.isOpen
    ? t.mvpPollStatusOpen
    : poll.endedAt
      ? t.mvpPollStatusClosed
      : t.mvpPollStatusWaiting;

  return (
    <section
      className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4"
      data-testid="caster-mvp-poll-panel"
    >
      {dialog}

      <div className="flex flex-wrap items-center gap-2 mb-1.5">
        <h2 className="text-lg font-bold">{t.mvpPollTitle}</h2>
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
            poll.isOpen
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
              : 'bg-neutral-800 border-neutral-700 text-neutral-400'
          }`}
          data-testid="caster-mvp-poll-status"
        >
          {statusLabel}
        </span>
        <span className="text-xs text-neutral-300 tabular-nums">
          {format(t.mvpPollTotal, { total: snapshot.total })}
        </span>
        {publishing && (
          <span className="text-[11px] text-neutral-500">
            {t.mvpPollPublishing}
          </span>
        )}
      </div>
      <p className="text-xs text-neutral-500 mb-3">{t.mvpPollIntro}</p>

      {!scene ? (
        <p className="text-xs text-amber-300">{t.mvpPollNoScene}</p>
      ) : (
        <>
          {!chatConnected && (
            <div className="mb-3 rounded-xl bg-amber-900/30 border border-amber-500/40 px-3 py-2 text-xs text-amber-200">
              {t.mvpPollChatOffline}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onStart}
              disabled={candidates.length < MIN_CANDIDATES}
              className={smallBtnClass}
              data-testid="caster-mvp-poll-start"
            >
              {t.mvpPollStart}
            </button>
            <button
              type="button"
              onClick={onStop}
              disabled={!poll.isOpen}
              className={smallBtnClass}
              data-testid="caster-mvp-poll-stop"
            >
              {t.mvpPollStop}
            </button>
            <button
              type="button"
              onClick={() => void onReset()}
              disabled={snapshot.total === 0}
              className={smallBtnClass}
              data-testid="caster-mvp-poll-reset"
            >
              {t.mvpPollReset}
            </button>
          </div>

          {/* Tally live — trié par votes desc, badge = numéro d'origine (le
              même que dans l'overlay, pour que « !mvp 2 » reste lisible). */}
          <div className="mt-3 space-y-1.5" data-testid="caster-mvp-poll-tally">
            {sorted.length === 0 ? (
              <p className="text-xs text-neutral-500">
                {t.mvpPollNoCandidates}
              </p>
            ) : (
              sorted.map((c) => {
                const idx =
                  snapshot.candidates.findIndex((x) => x.id === c.id) + 1;
                const leader = snapshot.leaderId === c.id && c.count > 0;
                return (
                  <div key={c.id} className="flex items-center gap-2">
                    <span
                      className={`w-5 shrink-0 text-center text-[11px] font-bold rounded ${
                        leader
                          ? 'bg-emerald-500/80 text-black'
                          : 'text-neutral-500'
                      }`}
                    >
                      {idx}
                    </span>
                    <span className="w-32 shrink-0 truncate text-xs text-neutral-200">
                      {c.label}
                    </span>
                    <span className="flex-1 h-2 rounded-full bg-neutral-800 overflow-hidden">
                      <span
                        className={`block h-full rounded-full ${
                          leader ? 'bg-emerald-400' : 'bg-purple-500'
                        }`}
                        style={{ width: `${c.percent}%` }}
                      />
                    </span>
                    <span className="w-16 shrink-0 text-right text-xs tabular-nums text-neutral-300">
                      {c.count}{' '}
                      <span className="text-neutral-500">{c.percent}%</span>
                    </span>
                  </div>
                );
              })
            )}
          </div>

          <p className="text-[11px] text-neutral-600 mt-3">{t.mvpPollHint}</p>
        </>
      )}
    </section>
  );
}
