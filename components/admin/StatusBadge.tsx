// components/admin/StatusBadge.tsx
// Reusable match status badge for admin pages

import type { MatchStatus } from '@/types/admin';
import { STATUS_CONFIG } from '@/utils/statusConfig';

type StatusBadgeProps = {
  status: MatchStatus;
  size?: 'sm' | 'md';
};

export default function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status];
  const textSize = size === 'sm' ? 'text-[10px]' : 'text-xs';
  const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2';

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-medium border ${textSize} ${cfg.bg}`}
    >
      <span className={`${dotSize} rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}
