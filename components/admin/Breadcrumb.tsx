import Link from 'next/link';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminBreadcrumb from '@/lib/i18n/locales/admin-fr/adminBreadcrumb';

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

type BreadcrumbProps = {
  items: BreadcrumbItem[];
};

export default function Breadcrumb({ items }: BreadcrumbProps) {
  const t = useAdminT(nsAdminBreadcrumb);
  if (items.length === 0) return null;

  return (
    <nav aria-label={t.ariaLabel} className="mb-4">
      <ol className="flex items-center gap-1.5 text-[13px] text-[var(--t3,#a39ba6)] flex-wrap">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={i} className="flex items-center gap-1.5">
              {i > 0 && (
                <svg
                  className="w-3.5 h-3.5 text-[var(--t4,#807984)] flex-shrink-0"
                  aria-hidden="true"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              )}
              {isLast || !item.href ? (
                <span
                  className={
                    isLast
                      ? 'text-[var(--t1,#f4edf7)] font-medium truncate max-w-[200px]'
                      : 'truncate max-w-[200px]'
                  }
                  aria-current={isLast ? 'page' : undefined}
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="rounded-[var(--r-ctrl,4px)] transition-colors truncate max-w-[200px] hover:text-[var(--t1,#f4edf7)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--or,#b467d1)]"
                >
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
