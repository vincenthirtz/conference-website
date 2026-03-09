// components/admin/AlertBanner.tsx
// Reusable alert banner for admin pages

type AlertVariant = 'error' | 'success' | 'info' | 'warning';

type AlertBannerProps = {
  message: string | null;
  variant?: AlertVariant;
  className?: string;
  onDismiss?: () => void;
};

const VARIANT_STYLES: Record<AlertVariant, string> = {
  error: 'bg-red-500/10 border-red-500/20 text-red-300',
  success: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300',
  info: 'bg-blue-500/10 border-blue-500/20 text-blue-300',
  warning: 'bg-amber-500/10 border-amber-500/20 text-amber-300',
};

export default function AlertBanner({
  message,
  variant = 'error',
  className = '',
  onDismiss,
}: AlertBannerProps) {
  if (!message) return null;

  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm ${VARIANT_STYLES[variant]} ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span>{message}</span>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8m0-8L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
