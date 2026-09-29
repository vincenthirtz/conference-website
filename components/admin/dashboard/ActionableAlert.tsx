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
    wrapper:
      'border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)]',
    iconWrap: 'text-[var(--or-300,#dea3f6)] bg-[var(--s3,#2f2732)]',
    cta: 'text-[var(--t2,#c7bfca)] border-[var(--line2,rgba(194,196,201,.2))] hover:text-[var(--t1,#f4edf7)] hover:border-[var(--t4,#807984)]',
  },
  warning: {
    wrapper: 'border-[rgba(245,165,36,.38)] bg-[rgba(245,165,36,.06)]',
    iconWrap: 'text-[#ffd9a3] bg-[rgba(245,165,36,.13)]',
    cta: 'text-[#ffd9a3] border-[rgba(245,165,36,.38)] hover:bg-[rgba(245,165,36,.13)]',
  },
  error: {
    wrapper: 'border-[rgba(255,107,107,.4)] bg-[rgba(255,107,107,.06)]',
    iconWrap: 'text-[#ffc2c2] bg-[rgba(255,107,107,.13)]',
    cta: 'text-[#ffc2c2] border-[rgba(255,107,107,.4)] hover:bg-[rgba(255,107,107,.13)]',
  },
  critical: {
    wrapper: 'border-[rgba(255,107,107,.6)] bg-[rgba(255,107,107,.1)]',
    iconWrap: 'text-[#ffc2c2] bg-[rgba(255,107,107,.2)] animate-pulse',
    cta: 'text-[#ffc2c2] border-[rgba(255,107,107,.6)] hover:bg-[rgba(255,107,107,.2)]',
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
      className={`flex flex-wrap items-center gap-3 rounded-[var(--r-card,14px)] border p-3 ${s.wrapper}`}
    >
      {icon && (
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--r-ctrl,4px)] ${s.iconWrap}`}
        >
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[var(--t1,#f4edf7)]">
          {title}
        </p>
        {message !== undefined && message !== null && message !== '' && (
          <p className="mt-0.5 truncate text-xs text-[var(--t2,#c7bfca)]">
            {message}
          </p>
        )}
        {/* Résultat du geste : annoncé (`aria-live`) parce qu'il remplace ce
            que la navigation disait avant — « c'est parti » ou « ça a raté ». */}
        {outcome && (
          <p
            aria-live="polite"
            className={`mt-1 text-xs ${
              outcome.kind === 'ok'
                ? 'text-[var(--lf-200,#b3e7a3)]'
                : 'text-[#ffc2c2]'
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
          className={`inline-flex h-[30px] shrink-0 items-center rounded-[var(--r-ctrl,4px)] border px-3 font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.02em] transition-colors disabled:opacity-50 ${s.cta}`}
        >
          {busy ? (action.pendingLabel ?? action.label) : action.label}
        </button>
      )}
      {cta && (
        <Link
          href={cta.href}
          className={`inline-flex h-[30px] shrink-0 items-center rounded-[var(--r-ctrl,4px)] border px-3 font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.02em] transition-colors ${s.cta}`}
        >
          {cta.label} →
        </Link>
      )}
    </div>
  );
}
