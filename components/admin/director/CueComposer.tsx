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
//
// Passe « Le Ruban » (lot 10C) : état du run en Chip (ton `live`), sévérités
// en couleurs de SIGNAL (ardoise / alerte / erreur), envoi AdminButton.

import { memo, useCallback, useRef, useState } from 'react';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { runStatusLabel } from '@/utils/eventSegmentLabels';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import { logger } from '@/utils/logger';
import type {
  EventCue,
  EventCueSeverity,
  EventRunStatus,
} from '@/types/events';
import nsAdminDirectorCueComposer from '@/lib/i18n/locales/admin-fr/adminDirectorCueComposer';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import {
  rubanCard,
  rubanEyebrow,
  rubanInput,
} from '@/features/admin/diffusion/ui/rubanClasses';

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
    active:
      'bg-[var(--s3,#2f2732)] border-[var(--t3,#a39ba6)] text-[var(--t1,#f4edf7)]',
    inactive:
      'bg-[var(--s2,#1d1520)] border-[var(--line2,rgba(194,196,201,.2))] text-[var(--t3,#a39ba6)] hover:border-[var(--t4,#807984)] hover:text-[var(--t1,#f4edf7)]',
  },
  {
    value: 'warn',
    label: 'Warn',
    active:
      'bg-[rgba(245,165,36,.18)] border-[var(--warn,#f5a524)] text-[#ffd9a3]',
    inactive:
      'bg-[var(--s2,#1d1520)] border-[var(--line2,rgba(194,196,201,.2))] text-[var(--t3,#a39ba6)] hover:border-[rgba(245,165,36,.45)] hover:text-[#ffd9a3]',
  },
  {
    value: 'urgent',
    label: 'Urgent',
    active:
      'bg-[rgba(255,107,107,.2)] border-[var(--err,#ff6b6b)] text-[#ffc2c2] animate-pulse',
    inactive:
      'bg-[var(--s2,#1d1520)] border-[var(--line2,rgba(194,196,201,.2))] text-[var(--t3,#a39ba6)] hover:border-[rgba(255,107,107,.45)] hover:text-[#ffc2c2]',
  },
];

// Memoise : la page Director tick `nowMs` toutes les 1s (timing/drift), ce qui
// re-render le parent chaque seconde. Le composer n'a aucune prop dependante du
// temps (runId/runStatus primitifs, onCueCreated = setState stable), donc on le
// decouple du tick pour que la frappe ne subisse pas le re-render 1s.
function CueComposer({ runId, runStatus, onCueCreated }: Props) {
  const t = useAdminT(nsAdminDirectorCueComposer);
  const { mutateJson, regenerate } = useIdempotentMutation();
  const { addToast } = useToast();

  const [severity, setSeverity] = useState<EventCueSeverity>('info');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const isLive = runStatus === 'live';
  const trimmed = body.trim();
  const canSend =
    isLive && trimmed.length > 0 && trimmed.length <= MAX_BODY && !busy;

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
      addToast(severity === 'urgent' ? t.cueUrgentSent : t.cueSent, 'success');
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
    <div className={`${rubanCard} p-5`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className={rubanEyebrow}>{t.heading}</h3>
        <Chip tone={isLive ? 'live' : 'neutral'}>
          {isLive
            ? t.statusLive
            : format(t.statusRun, { status: runStatusLabel(runStatus) })}
        </Chip>
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
              className={`h-[38px] rounded-[var(--r-ctrl,4px)] border px-3 font-[family-name:var(--fd)] text-[12px] font-bold uppercase tracking-[0.02em] transition-colors ${
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
        className={`${rubanInput} resize-none text-base`}
        aria-describedby="cue-body-help"
      />

      <div
        id="cue-body-help"
        className="mt-1 flex items-center justify-between text-[11px]"
      >
        <span className="text-[var(--t4,#807984)]">
          <kbd className="rounded-[3px] bg-[var(--s2,#1d1520)] border border-[var(--line2,rgba(194,196,201,.2))] px-1 py-0.5 text-[10px] text-[var(--t3,#a39ba6)]">
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
              ? 'text-[var(--warn,#f5a524)]'
              : 'text-[var(--t4,#807984)]'
          }
        >
          {trimmed.length}/{MAX_BODY}
        </span>
      </div>

      <AdminButton
        variant={severity === 'urgent' ? 'danger' : 'secondary'}
        onClick={handleSend}
        disabled={!canSend}
        aria-label={t.sendAria}
        data-testid="cue-composer-submit"
        className={`mt-3 w-full ${
          severity === 'warn'
            ? 'border-[rgba(245,165,36,.45)] text-[#ffd9a3] hover:border-[var(--warn,#f5a524)] hover:bg-[rgba(245,165,36,.08)]'
            : ''
        }`}
      >
        {busy ? t.sending : t.send}
      </AdminButton>

      {severity === 'urgent' && (
        <p className="mt-2 text-[11px] text-[#ffc2c2]" role="note">
          {t.ackNote}
        </p>
      )}
      {!isLive && (
        <p className="mt-2 text-[11px] text-[var(--t4,#807984)]" role="note">
          {t.startNote}
        </p>
      )}
    </div>
  );
}

export default memo(CueComposer);
