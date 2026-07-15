// components/Caster/UrgentCueModal.tsx
//
// Feature: Run-of-show — Lot 5.
// Modal bloquante full-screen pour un cue 'urgent' non ack.
//
// Comportement :
//   - Overlay z-50 sur fond noir/blur, focus trap, role="alertdialog".
//   - Au mount : son via playChime('urgent') + vibration 200/100/200.
//   - Focus auto sur bouton "Vu".
//   - Esc NE FERME PAS — il faut acker.
//   - Click backdrop NE FERME PAS — il faut acker.
//   - Retry inline si l ack reseau echoue.

import { useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { playChime } from '@/utils/playChime';
import type { CueWithAck } from '@/hooks/useCueStream';
import { useT } from '@/lib/i18n/useT';

type Props = {
  cue: CueWithAck;
  /** Resolves quand l ack a abouti, throws sinon. */
  onAck: (cueId: string) => Promise<void>;
};

export default function UrgentCueModal({ cue, onAck }: Props) {
  const t = useT('urgentCueModal');
  const trapRef = useFocusTrap<HTMLDivElement>();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Effet on-open : chime + vibration. Re-trigger si on change de cue
  // (Director envoie un nouvel urgent pendant qu un est ouvert).
  useEffect(() => {
    try {
      playChime('urgent');
      // Petit relai 600ms plus tard pour insister.
      const t = setTimeout(() => playChime('urgent'), 600);
      return () => clearTimeout(t);
    } catch {
      return undefined;
    }
  }, [cue.id]);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate?.([200, 100, 200]);
      } catch {
        // ignore
      }
    }
  }, [cue.id]);

  // Focus le bouton "Vu" au mount + a chaque changement de cue (useFocusTrap
  // pose deja le focus sur le premier focusable, mais on est explicite).
  useEffect(() => {
    buttonRef.current?.focus();
  }, [cue.id]);

  // Empeche Esc de declencher la fermeture native (au cas ou un parent
  // ajoute un handler global).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  const handleAck = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onAck(cue.id);
      // Pas de close() ici : le parent retire la modal en voyant
      // acked_by_me=true via le hook useCueStream.
    } catch (err) {
      setError((err as Error)?.message || t.ackFailed);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur flex items-center justify-center px-4"
      aria-hidden={false}
    >
      <div
        ref={trapRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="urgent-cue-title"
        aria-describedby="urgent-cue-body"
        className="w-full max-w-md rounded-2xl border border-red-500/60 bg-gradient-to-b from-red-950/90 to-black/95 shadow-2xl shadow-red-900/40 p-5 space-y-4"
        data-testid="urgent-cue-modal"
      >
        <div className="flex items-center gap-2">
          <span
            id="urgent-cue-title"
            className="text-[11px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-red-600 text-white font-bold animate-pulse"
          >
            {t.urgent}
          </span>
          <span className="text-[11px] text-red-200">{t.directorCue}</span>
        </div>

        <p
          id="urgent-cue-body"
          className="text-lg text-white leading-snug whitespace-pre-wrap break-words"
        >
          {cue.body}
        </p>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-amber-500/40 bg-amber-900/30 px-3 py-2 text-xs text-amber-100"
          >
            {error}
          </div>
        )}

        <button
          ref={buttonRef}
          type="button"
          onClick={handleAck}
          disabled={submitting}
          className={`w-full py-3 rounded-xl text-base font-semibold transition focus:outline-none focus:ring-2 focus:ring-white/60 ${
            submitting
              ? 'bg-red-700/70 text-white/80 cursor-progress'
              : 'bg-red-500 hover:bg-red-400 text-white'
          }`}
          data-testid="urgent-cue-ack"
        >
          {submitting ? t.sending : error ? t.retry : t.seen}
        </button>
      </div>
    </div>
  );
}
