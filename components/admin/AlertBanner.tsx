// components/admin/AlertBanner.tsx
// Reusable alert banner for admin pages

import type { ReactElement } from 'react';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminAlertBanner from '@/lib/i18n/locales/admin-fr/adminAlertBanner';

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

// Per-variant icon path (drawn inside a 16x16 viewBox, stroke: currentColor).
// An icon (not just color) is required for WCAG 1.4.1 (use of color).
const VARIANT_ICON: Record<AlertVariant, ReactElement> = {
  error: (
    <>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M5.5 5.5l5 5m0-5l-5 5" strokeLinecap="round" />
    </>
  ),
  success: (
    <>
      <circle cx="8" cy="8" r="6.25" />
      <path
        d="M5.25 8.25l1.75 1.75 3.75-4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  info: (
    <>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 7.25v3.5" strokeLinecap="round" />
      <path d="M8 5.25v.01" strokeLinecap="round" />
    </>
  ),
  warning: (
    <>
      <path d="M8 2.25L14.5 13.5H1.5L8 2.25z" strokeLinejoin="round" />
      <path d="M8 6.75v2.75" strokeLinecap="round" />
      <path d="M8 11.5v.01" strokeLinecap="round" />
    </>
  ),
};

export default function AlertBanner({
  message,
  variant = 'error',
  className = '',
  onDismiss,
}: AlertBannerProps) {
  const t = useAdminT(nsAdminAlertBanner);
  if (!message) return null;

  const assertive = variant === 'error';

  return (
    <div
      role={assertive ? 'alert' : 'status'}
      aria-live={assertive ? 'assertive' : 'polite'}
      className={`rounded-lg border px-4 py-3 text-sm ${VARIANT_STYLES[variant]} ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
            className="flex-shrink-0"
          >
            {VARIANT_ICON[variant]}
          </svg>
          <span>{message}</span>
        </span>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t.close}
            className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path
                d="M4 4l8 8m0-8L4 12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
