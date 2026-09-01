// components/admin/dashboard/ActionableAlert.tsx
//
// Bandeau d'alerte du centre de contrôle.
//
// Lot A1 de docs/PLAN-espace-admin.md : jusqu'ici, une alerte portait un LIEN,
// pas un geste. Constater « 3 équipes non checkées » demandait d'ouvrir la page
// check-in, d'y retrouver les équipes, puis d'agir — trois écrans, au pire
// moment (un soir de journée à six matchs simultanés).
//
// L'alerte accepte donc désormais une ACTION exécutée sur place, en plus (ou à
// la place) du lien. L'action est asynchrone, se verrouille pendant l'appel et
// rend son résultat dans le bandeau : le staff n'a pas à deviner si son clic a
// abouti. Le lien reste offert quand il faut aller voir le détail.

import Link from 'next/link';
import { useState, type ReactNode } from 'react';

export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';

const STYLES: Record<
  AlertSeverity,
  { wrapper: string; iconWrap: string; cta: string }
> = {
  info: {
    wrapper: 'border-blue-500/30 bg-blue-500/5',
    iconWrap: 'text-blue-300 bg-blue-500/10',
    cta: 'text-blue-200 hover:bg-blue-500/15',
  },
  warning: {
    wrapper: 'border-amber-500/30 bg-amber-500/5',
    iconWrap: 'text-amber-300 bg-amber-500/10',
    cta: 'text-amber-200 hover:bg-amber-500/15',
  },
  error: {
    wrapper: 'border-red-500/30 bg-red-500/5',
    iconWrap: 'text-red-300 bg-red-500/10',
    cta: 'text-red-200 hover:bg-red-500/15',
  },
  critical: {
    wrapper: 'border-red-600/50 bg-red-600/10 ring-1 ring-red-600/30',
    iconWrap: 'text-red-200 bg-red-600/20 animate-pulse',
    cta: 'text-red-100 hover:bg-red-600/20',
  },
};

export type AlertAction = {
  label: string;
  /** Libellé pendant l'exécution (ex. « Relance… »). */
  pendingLabel?: string;
  /**
   * Exécute le geste. Doit être IDEMPOTENTE côté serveur : un soir de match,
   * un double clic est la norme, pas l'exception.
   *
   * Résout avec un message de confirmation à afficher, ou rejette avec une
   * erreur affichée telle quelle.
   */
  run: () => Promise<string>;
};

type Props = {
  severity: AlertSeverity;
  icon?: ReactNode;
  title: string;
  message?: ReactNode;
  cta?: { label: string; href: string };
  /** Geste exécutable sur place (lot A1). */
  action?: AlertAction;
};

export default function ActionableAlert({
  severity,
  icon,
  title,
  message,
  cta,
  action,
}: Props) {
  const s = STYLES[severity];
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{
    kind: 'ok' | 'error';
    text: string;
  } | null>(null);

  const run = async () => {
    if (!action || busy) return;
    setBusy(true);
    setOutcome(null);
    try {
      const text = await action.run();
      setOutcome({ kind: 'ok', text });
    } catch (err) {
      setOutcome({
        kind: 'error',
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${s.wrapper}`}
    >
      {icon && (
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${s.iconWrap}`}
        >
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{title}</p>
        {message !== undefined && message !== null && message !== '' && (
          <p className="mt-0.5 truncate text-xs text-gray-300">{message}</p>
        )}
        {/* Résultat du geste : annoncé (`aria-live`) parce qu'il remplace ce
            que la navigation disait avant — « c'est parti » ou « ça a raté ». */}
        {outcome && (
          <p
            aria-live="polite"
            className={`mt-1 text-xs ${
              outcome.kind === 'ok' ? 'text-emerald-300' : 'text-red-300'
            }`}
          >
            {outcome.text}
          </p>
        )}
      </div>
      {action && (
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className={`shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${s.cta}`}
        >
          {busy ? (action.pendingLabel ?? action.label) : action.label}
        </button>
      )}
      {cta && (
        <Link
          href={cta.href}
          className={`shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium transition-colors ${s.cta}`}
        >
          {cta.label} →
        </Link>
      )}
    </div>
  );
}
