import Link from 'next/link';
import type { JSX, ReactNode } from 'react';

export type QuickActionTone = 'default' | 'blue' | 'emerald' | 'purple';

const TONE_CLASSES: Record<QuickActionTone, string> = {
  default: 'border-white/10 bg-white/5 hover:bg-white/10',
  blue: 'border-blue-400/20 bg-blue-500/10 hover:bg-blue-500/20',
  emerald: 'border-emerald-400/20 bg-emerald-500/10 hover:bg-emerald-500/20',
  purple: 'border-purple-400/20 bg-purple-500/10 hover:bg-purple-500/20',
};

const ICON_TONE: Record<QuickActionTone, string> = {
  default: 'text-gray-400',
  blue: 'text-blue-400',
  emerald: 'text-emerald-400',
  purple: 'text-purple-400',
};

export type QuickActionProps = {
  href: string;
  label: ReactNode;
  description?: string;
  /** SVG path data passed straight to a <path d=… /> child. */
  iconPath?: string;
  /** Or an arbitrary icon node (overrides iconPath). */
  icon?: ReactNode;
  tone?: QuickActionTone;
  /** Optional badge shown next to the label (e.g. unread count). */
  badge?: number;
};

export default function QuickAction({
  href,
  label,
  description,
  iconPath,
  icon,
  tone = 'default',
  badge,
}: QuickActionProps): JSX.Element {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition ${TONE_CLASSES[tone]}`}
    >
      <div className={`flex-shrink-0 ${ICON_TONE[tone]}`}>
        {icon ?? (
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {iconPath && <path d={iconPath} />}
          </svg>
        )}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium text-white flex items-center gap-2">
          <span className="truncate">{label}</span>
          {typeof badge === 'number' && badge > 0 && (
            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-emerald-500 text-[10px] font-bold text-white">
              {badge}
            </span>
          )}
        </div>
        {description && (
          <div className="text-xs text-gray-500 truncate">{description}</div>
        )}
      </div>
    </Link>
  );
}
