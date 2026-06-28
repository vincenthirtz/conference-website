import { useEffect, useState, type JSX } from 'react';
import { useT } from '@/lib/i18n/useT';

type Props = {
  /** The string copied to the clipboard. */
  value: string;
  /** Accessible label & tooltip; defaults to the localized "Copier". */
  label?: string;
  /** Tailwind classes appended to the button (size, color, etc.). */
  className?: string;
  /** How long the "Copié" feedback stays visible. */
  resetMs?: number;
};

export default function CopyButton({
  value,
  label,
  className = '',
  resetMs = 1500,
}: Props): JSX.Element {
  const t = useT('copyButton');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), resetMs);
    return () => clearTimeout(id);
  }, [copied, resetMs]);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(false), resetMs);
    return () => clearTimeout(id);
  }, [error, resetMs]);

  const handleClick = async () => {
    if (!value) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        return;
      }
      // Fallback for non-secure contexts (no clipboard API).
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'absolute';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (!ok) throw new Error('execCommand returned false');
      setCopied(true);
    } catch {
      setError(true);
    }
  };

  const tooltip = error ? t.error : copied ? t.copied : (label ?? t.copy);
  return (
    <button
      type="button"
      onClick={handleClick}
      title={tooltip}
      aria-label={tooltip}
      aria-live="polite"
      className={`inline-flex items-center justify-center rounded-md border border-white/10 bg-white/5 text-gray-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${className}`}
    >
      {copied ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="h-3.5 w-3.5 text-emerald-300"
        >
          <path d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="h-3.5 w-3.5"
        >
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V5a2 2 0 012-2h10" />
        </svg>
      )}
    </button>
  );
}
