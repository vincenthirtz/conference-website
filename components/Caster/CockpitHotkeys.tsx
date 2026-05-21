// components/Caster/CockpitHotkeys.tsx
//
// Hotkeys du Cockpit caster : 3 boutons larges (mobile-friendly) qui
// declenchent un event 'cast.hotkey_triggered' dans bot_event_outbox.
//
// V1 :
//   - Highlight : marque un highlight pour le segment courant (le bot pourra
//     le timestamper sur le replay au Lot 5).
//   - Score : ouvre un mini prompt pour annoncer un score textuel
//     (ex: "2-1 fin Game 3"). Le bot le poussera en chat / overlay au Lot 5.
//   - Pause : signal "on coupe le micro 30s". Le Director le voit en realtime.
//
// Idempotency-Key : generee une fois par clic ; permet au serveur (et au bot
// downstream) de dedoublonner si le client retry. Pas de useIdempotentMutation
// ici car ce hook redirige sur /admin/login qui n est pas le bon flow caster.

import { useCallback, useState } from 'react';
import { useToast } from '@/components/Toast';
import { logger } from '@/utils/logger';

type HotkeyKind = 'highlight' | 'score' | 'pause';

type Props = {
  segmentId: string;
  accessToken: string | null;
  disabled?: boolean;
};

function makeIdempotencyKey(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

export default function CockpitHotkeys({
  segmentId,
  accessToken,
  disabled,
}: Props) {
  const { addToast } = useToast();
  const [busy, setBusy] = useState<HotkeyKind | null>(null);

  const trigger = useCallback(
    async (kind: HotkeyKind, payload?: Record<string, unknown>) => {
      if (disabled || busy) return;
      if (!accessToken) {
        addToast('Session expiree, reconnecte-toi.', 'error');
        return;
      }
      setBusy(kind);
      try {
        const res = await fetch(`/api/caster/segments/${segmentId}/hotkey`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            'Idempotency-Key': makeIdempotencyKey(),
          },
          body: JSON.stringify({ kind, payload }),
        });
        if (!res.ok && res.status !== 202) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error || `Erreur ${res.status}`);
        }
        const labels: Record<HotkeyKind, string> = {
          highlight: 'Highlight marque',
          score: 'Score annonce',
          pause: 'Signal pause envoye',
        };
        addToast(labels[kind], 'success');
      } catch (err) {
        logger.error('[hotkey] trigger error', err);
        addToast(
          (err as Error)?.message || 'Impossible de declencher la hotkey.',
          'error'
        );
      } finally {
        setBusy(null);
      }
    },
    [accessToken, addToast, busy, disabled, segmentId]
  );

  const onScore = useCallback(() => {
    if (busy || disabled) return;
    if (typeof window === 'undefined') return;
    const v = window.prompt('Score a annoncer (ex: "2-1 fin Game 3")', '');
    if (v === null) return;
    const trimmed = v.trim();
    if (!trimmed) return;
    trigger('score', { text: trimmed.slice(0, 120) });
  }, [busy, disabled, trigger]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-sm font-semibold text-white mb-3">Hotkeys</div>
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => trigger('highlight')}
          disabled={disabled || !!busy}
          className="col-span-2 px-4 py-4 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-purple-900/30"
          data-testid="hotkey-highlight"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
            />
          </svg>
          {busy === 'highlight' ? 'Envoi...' : 'Marquer un highlight'}
        </button>
        <button
          type="button"
          onClick={onScore}
          disabled={disabled || !!busy}
          className="px-3 py-3 rounded-xl border border-emerald-400/40 bg-emerald-500/15 text-emerald-50 text-sm font-semibold transition hover:bg-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="hotkey-score"
        >
          {busy === 'score' ? 'Envoi...' : 'Annoncer un score'}
        </button>
        <button
          type="button"
          onClick={() => trigger('pause')}
          disabled={disabled || !!busy}
          className="px-3 py-3 rounded-xl border border-amber-400/40 bg-amber-500/15 text-amber-50 text-sm font-semibold transition hover:bg-amber-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="hotkey-pause"
        >
          {busy === 'pause' ? 'Envoi...' : 'Pause'}
        </button>
      </div>
      {disabled && (
        <p className="text-[11px] text-gray-500 mt-2">
          Hotkeys disponibles uniquement quand un segment est en cours.
        </p>
      )}
    </div>
  );
}
