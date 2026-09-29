// features/admin/tournaments/ui/TournamentDashboardStates.tsx — les états du
// hub tournoi hors données : premier chargement, erreur de chargement, et la
// bannière d'erreur des actions (statut, équipes, phases) qu'on peut fermer.

const CARD =
  'rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)]';
const ERROR_SURFACE =
  'rounded-[var(--r-card,14px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] text-sm text-[#ffc2c2]';

export function TournamentDashboardLoading({ label }: { label: string }) {
  return (
    <div
      className={`${CARD} flex items-center justify-center gap-3 p-8 text-center text-[var(--t3,#a39ba6)]`}
      aria-busy="true"
    >
      <span
        className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        aria-hidden
      />
      {label}
    </div>
  );
}

export function TournamentDashboardLoadError({ message }: { message: string }) {
  return (
    <div className={`${ERROR_SURFACE} p-4`} role="alert">
      {message}
    </div>
  );
}

export function TournamentDashboardActionError({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}) {
  return (
    <div
      className={`${ERROR_SURFACE} mb-4 flex items-center gap-2 px-4 py-3`}
      role="alert"
    >
      <svg
        className="h-5 w-5 flex-shrink-0 text-[var(--err,#ff6b6b)]"
        fill="currentColor"
        viewBox="0 0 20 20"
        aria-hidden
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
          clipRule="evenodd"
        />
      </svg>
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="text-[var(--err,#ff6b6b)] transition-colors hover:text-[var(--t1,#f4edf7)]"
        aria-label="×"
      >
        ×
      </button>
    </div>
  );
}
