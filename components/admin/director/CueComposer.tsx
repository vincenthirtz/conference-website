// components/admin/director/CueComposer.tsx
//
// Feature: Run-of-show — Lot 5 (Director comms).
// Composer + envoyer un cue broadcast vers tous les casters du run.
//
// Contraintes :
//   - body : 1–500 caracteres (aligne sur le CHECK DB + zod schema cote API).
//   - severity : info | warn | urgent (default info, persiste apres envoi —
//     le Director envoie souvent plusieurs cues consecutifs du meme niveau).
//   - Le bouton "Envoyer" est disabled si body vide OU run non-live.
//   - Hotkey Cmd/Ctrl+Enter = envoyer (sans bouger le focus).
//   - POST via useIdempotentMutation (regenerate apres succes).
//   - Toast succes/erreur via useToast.
//
// Apres envoi reussi : on clear l'input, on regarde le focus (reste sur le
// textarea pour permettre la frappe du cue suivant), on garde la severite.

import { useCallback, useRef, useState } from 'react';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import { logger } from '@/utils/logger';
import type { EventCue, EventCueSeverity, EventRunStatus } from '@/types/events';

const MAX_BODY = 500;

type Props = {
  runId: string;
  runStatus: EventRunStatus;
  /** Appele apres un envoi reussi. Permet au parent de prepend le cue dans le feed sans attendre le poll suivant. */
  onCueCreated?: (cue: EventCue) => void;
};

const SEVERITY_BUTTONS: Array<{
  value: EventCueSeverity;
  label: string;
  // Tailwind classes "actif" (selectionne) et "inactif".
  active: string;
  inactive: string;
}> = [
  {
    value: 'info',
    label: 'Info',
    active: 'bg-slate-500/30 border-slate-400/60 text-slate-100',
    inactive:
      'bg-neutral-900/40 border-neutral-700/60 text-neutral-300 hover:border-slate-500/40 hover:text-slate-200',
  },
  {
    value: 'warn',
    label: 'Warn',
    active: 'bg-amber-500/25 border-amber-400/60 text-amber-100',
    inactive:
      'bg-neutral-900/40 border-neutral-700/60 text-neutral-300 hover:border-amber-500/40 hover:text-amber-200',
  },
  {
    value: 'urgent',
    label: 'Urgent',
    active:
      'bg-red-500/25 border-red-400/70 text-red-100 animate-pulse shadow-[0_0_12px_rgba(248,113,113,0.4)]',
    inactive:
      'bg-neutral-900/40 border-neutral-700/60 text-neutral-300 hover:border-red-500/50 hover:text-red-200',
  },
];

export default function CueComposer({
  runId,
  runStatus,
  onCueCreated,
}: Props) {
  const t = useAdminT('adminDirectorCueComposer');
  const { mutateJson, regenerate } = useIdempotentMutation();
  const { addToast } = useToast();

  const [severity, setSeverity] = useState<EventCueSeverity>('info');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const isLive = runStatus === 'live';
  const trimmed = body.trim();
  const canSend = isLive && trimmed.length > 0 && trimmed.length <= MAX_BODY && !busy;

  const handleSend = useCallback(async () => {
    if (!canSend) return;
    setBusy(true);
    regenerate();
    try {
      const json = await mutateJson<{ cue: EventCue }>(
        `/api/admin/events/${runId}/cues`,
        {
          method: 'POST',
          body: JSON.stringify({ severity, body: trimmed }),
        }
      );
      addToast(
        severity === 'urgent' ? t.cueUrgentSent : t.cueSent,
        'success'
      );
      setBody('');
      onCueCreated?.(json.cue);
      // Focus reste sur le textarea pour enchainer.
      requestAnimationFrame(() => textareaRef.current?.focus());
    } catch (err) {
      logger.error('[director-comms] cue send error', err);
      addToast((err as Error)?.message ?? t.sendFailed, 'error');
    } finally {
      setBusy(false);
    }
  }, [
    addToast,
    canSend,
    mutateJson,
    onCueCreated,
    regenerate,
    runId,
    severity,
    trimmed,
    t,
  ]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-700/50 bg-neutral-800/30 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-neutral-200">Cue composer</h3>
        <span
          className={`text-[11px] uppercase tracking-wide font-semibold ${
            isLive ? 'text-emerald-400' : 'text-neutral-500'
          }`}
        >
          {isLive ? 'Live' : `Run ${runStatus}`}
        </span>
      </div>

      {/* Severity picker — segmented */}
      <div
        role="radiogroup"
        aria-label={t.severityAria}
        className="grid grid-cols-3 gap-2 mb-3"
      >
        {SEVERITY_BUTTONS.map((sev) => {
          const selected = severity === sev.value;
          return (
            <button
              key={sev.value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={format(t.severityItemAria, { label: sev.label })}
              data-testid={`cue-composer-severity-${sev.value}`}
              onClick={() => setSeverity(sev.value)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                selected ? sev.active : sev.inactive
              }`}
            >
              {sev.label}
            </button>
          );
        })}
      </div>

      <label htmlFor="cue-body" className="sr-only">
        {t.cueTextLabel}
      </label>
      <textarea
        id="cue-body"
        data-testid="cue-composer-textarea"
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
        onKeyDown={handleKeyDown}
        placeholder={isLive ? t.placeholderLive : t.placeholderIdle}
        disabled={!isLive || busy}
        rows={3}
        className="w-full rounded-lg bg-neutral-900/60 border border-neutral-700/60 focus:border-purple-500/60 focus:outline-none focus:ring-1 focus:ring-purple-500/30 px-3 py-2 text-sm text-white placeholder:text-neutral-600 resize-none disabled:opacity-50"
        aria-describedby="cue-body-help"
      />

      <div
        id="cue-body-help"
        className="mt-1 flex items-center justify-between text-[11px]"
      >
        <span className="text-neutral-500">
          <kbd className="rounded bg-neutral-900/70 border border-neutral-700/60 px-1 py-0.5 text-[10px] text-neutral-400">
            {typeof navigator !== 'undefined' &&
            /Mac|iPhone|iPad/i.test(navigator.platform)
              ? t.keyMac
              : t.keyOther}
          </kbd>{' '}
          {t.toSend}
        </span>
        <span
          className={
            trimmed.length > MAX_BODY - 50
              ? 'text-amber-400'
              : 'text-neutral-500'
          }
        >
          {trimmed.length}/{MAX_BODY}
        </span>
      </div>

      <button
        type="button"
        onClick={handleSend}
        disabled={!canSend}
        aria-label={t.sendAria}
        data-testid="cue-composer-submit"
        className={`mt-3 w-full rounded-lg px-3 py-2 text-sm font-semibold transition ${
          canSend
            ? severity === 'urgent'
              ? 'bg-red-500/80 hover:bg-red-500 text-white'
              : severity === 'warn'
                ? 'bg-amber-500/80 hover:bg-amber-500 text-white'
                : 'bg-purple-600 hover:bg-purple-500 text-white'
            : 'bg-neutral-800/60 text-neutral-500 cursor-not-allowed'
        }`}
      >
        {busy ? t.sending : t.send}
      </button>

      {severity === 'urgent' && (
        <p className="mt-2 text-[11px] text-red-300/80" role="note">
          {t.ackNote}
        </p>
      )}
      {!isLive && (
        <p className="mt-2 text-[11px] text-neutral-500" role="note">
          {t.startNote}
        </p>
      )}
    </div>
  );
}
