// components/admin/dashboard/RosterUnlockAlert.tsx
//
// Déverrouillage temporaire du roster, depuis le tableau de bord du tournoi.
//
// L'alerte existante ne parle du verrou qu'AVANT qu'il tombe (« roster lock
// dans 6 h »). Une fois tombé, l'écran redevenait muet — précisément au moment
// où il y a quelque chose à faire : une joueuse se blesse, une remplaçante
// arrive, et le capitaine ne peut plus rien.
//
// Ce bloc prend le relais après le verrou. Il propose des durées courtes plutôt
// qu'un champ libre : le geste doit se faire en un clic, un soir de match, et
// « 30 minutes » se décide plus vite qu'une date à saisir.
//
// Quand une fenêtre est ouverte, il affiche jusqu'à quand — et permet de la
// refermer tout de suite. Un déverrouillage se referme seul, mais on doit
// pouvoir couper court sans attendre.

import { useState } from 'react';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTournamentDashboard from '@/lib/i18n/locales/admin-fr/adminTournamentDashboard';

/** Durées proposées. Au-delà, c'est la date de verrou qu'il faut déplacer. */
const PRESETS = [30, 120, 24 * 60] as const;

type Props = {
  tournamentId: string;
  /** Le verrou est-il tombé ? (dérivé de `roster_locked_at` côté dashboard) */
  locked: boolean;
  /** Fin de la fenêtre en cours, ou `null`. */
  unlockedUntil: string | null;
  /** Recharge le tableau de bord après le geste. */
  onRefresh: () => Promise<void>;
};

function presetLabel(minutes: number, tx: Record<string, string>): string {
  if (minutes < 60) return format(tx.rosterUnlockMinutes, { n: minutes });
  if (minutes < 24 * 60)
    return format(tx.rosterUnlockHours, { n: Math.round(minutes / 60) });
  return format(tx.rosterUnlockDays, { n: Math.round(minutes / (24 * 60)) });
}

export default function RosterUnlockAlert({
  tournamentId,
  locked,
  unlockedUntil,
  onRefresh,
}: Props) {
  const tx = useAdminT(nsAdminTournamentDashboard);
  const { mutateJson } = useIdempotentMutation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openUntilMs = unlockedUntil ? Date.parse(unlockedUntil) : NaN;
  const windowOpen = Number.isFinite(openUntilMs) && openUntilMs > Date.now();

  // Rien à proposer tant que le verrou n'est pas tombé : l'alerte de proximité
  // s'en charge déjà, et deux blocs sur le même sujet se contrediraient.
  if (!locked && !windowOpen) return null;

  const run = async (minutes: number | null) => {
    setBusy(true);
    setError(null);
    try {
      await mutateJson(`/api/admin/tournament/${tournamentId}/roster-unlock`, {
        method: minutes === null ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        ...(minutes === null
          ? {}
          : { body: JSON.stringify({ minutes }) }),
      });
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : tx.rosterUnlockError);
    } finally {
      setBusy(false);
    }
  };

  const untilLabel = windowOpen
    ? new Date(openUntilMs).toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div
      className={`rounded-xl border p-4 ${
        windowOpen
          ? 'border-emerald-500/40 bg-emerald-500/10'
          : 'border-amber-500/40 bg-amber-500/10'
      }`}
      data-testid="roster-unlock-alert"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">
            <span aria-hidden className="mr-1.5">
              {windowOpen ? '🔓' : '🔒'}
            </span>
            {windowOpen
              ? format(tx.rosterUnlockOpenTitle, { time: untilLabel ?? '' })
              : tx.rosterUnlockLockedTitle}
          </p>
          <p className="mt-1 text-xs text-neutral-300">
            {windowOpen ? tx.rosterUnlockOpenMsg : tx.rosterUnlockLockedMsg}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {windowOpen ? (
            <button
              type="button"
              onClick={() => void run(null)}
              disabled={busy}
              className="rounded-lg border border-neutral-500/60 px-3 py-1.5 text-xs text-neutral-100 hover:border-neutral-300 disabled:opacity-50"
              data-testid="roster-relock"
            >
              {busy ? tx.rosterUnlockWorking : tx.rosterRelockCta}
            </button>
          ) : (
            PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => void run(m)}
                disabled={busy}
                className="rounded-lg bg-amber-500/80 px-3 py-1.5 text-xs font-semibold text-neutral-950 hover:bg-amber-400 disabled:opacity-50"
                data-testid={`roster-unlock-${m}`}
              >
                {presetLabel(m, tx as unknown as Record<string, string>)}
              </button>
            ))
          )}
        </div>
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-300" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
