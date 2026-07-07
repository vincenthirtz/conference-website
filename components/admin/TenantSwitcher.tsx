// components/admin/TenantSwitcher.tsx
//
// Tenant switcher dropdown for the admin navbar. Reads the list of accessible
// tenants and the currently-active one, lets the user pick another. On
// selection, POSTs the new tenant_id to /api/admin/active-tenant (which sets
// the active-tenant cookie) and reloads the page so SSR picks up the change.
//
// Behaviours :
//  - 0 tenants : nothing rendered (degenerate state, shouldn't happen for
//    real staff but stays safe).
//  - 1 tenant  : passive label with the tenant name only, no dropdown.
//  - 2+        : button + dropdown panel matching the AdminTopBar style.
//    Slug badges are shown only inside the dropdown options (visual aid
//    to distinguish tenants when several share similar names) — never
//    in the TopBar bar itself, where the name suffices.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useToast } from '@/components/Toast';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import {
  useAccessibleTenants,
  type AccessibleTenant,
} from '@/hooks/useAccessibleTenants';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useAdminT, format } from '@/lib/i18n/useAdminT';

import { logger } from '../../utils/logger';

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      className={`h-3 w-3 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 9l-7 7-7-7"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden
      className="h-3.5 w-3.5 text-emerald-400"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.5}
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}

type TenantBadgeProps = {
  tenant: AccessibleTenant | { slug: string; name: string; is_active: boolean };
  size?: 'sm' | 'md';
};

function TenantBadge({ tenant, size = 'md' }: TenantBadgeProps) {
  const padding =
    size === 'sm' ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]';
  return (
    <span
      className={`rounded-md border border-white/10 bg-white/5 ${padding} font-medium uppercase tracking-wider text-neutral-300`}
    >
      {tenant.slug}
    </span>
  );
}

function TenantSwitcherSkeleton() {
  return (
    <div
      data-testid="tenant-switcher-skeleton"
      className="flex h-7 w-32 items-center gap-2 rounded-lg bg-white/5 px-2"
    >
      <div className="h-2 w-2 animate-pulse rounded-full bg-white/20" />
      <div className="h-3 flex-1 animate-pulse rounded bg-white/10" />
    </div>
  );
}

export default function TenantSwitcher() {
  const router = useRouter();
  const { addToast } = useToast();
  const tx = useAdminT('adminTenantSwitcher');
  const {
    tenant: active,
    isLoading: loadingActive,
    refresh: refreshActive,
  } = useActiveTenant();
  const { tenants, isLoading: loadingList } = useAccessibleTenants();
  const { mutateJson } = useIdempotentMutation();

  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  if (loadingActive || loadingList) {
    return <TenantSwitcherSkeleton />;
  }

  if (tenants.length === 0) {
    // Defensive : staff with zero tenants shouldn't reach here, but stay safe.
    return null;
  }

  if (tenants.length === 1) {
    const only = tenants[0];
    return (
      <div
        data-testid="tenant-switcher-single"
        className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-white/5 px-2 py-1"
        title={format(tx.tenantTitle, { name: only.name })}
      >
        <span className="text-[12px] font-medium text-neutral-200">
          {only.name}
        </span>
      </div>
    );
  }

  const current = active ?? tenants[0];
  const handleSelect = async (target: AccessibleTenant) => {
    if (target.id === current.id) {
      setOpen(false);
      return;
    }
    setSwitching(target.id);
    try {
      await mutateJson('/api/admin/active-tenant', {
        method: 'POST',
        body: JSON.stringify({ tenant_id: target.id }),
      });
      await refreshActive();
      addToast(format(tx.switchedToast, { name: target.name }), 'success');
      setOpen(false);
      // Reload so SSR pages (everywhere) re-render with the new active tenant.
      router.reload();
    } catch (err) {
      logger.error('TenantSwitcher: switch error', err);
      addToast((err as Error)?.message ?? tx.switchError, 'error');
    } finally {
      setSwitching(null);
    }
  };

  return (
    <div
      ref={wrapperRef}
      data-testid="tenant-switcher"
      className="relative shrink-0"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[12px] font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
          open
            ? 'bg-white/[0.1] text-white'
            : 'text-neutral-200 hover:bg-white/[0.08] hover:text-white'
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid="tenant-switcher-button"
      >
        <span className="max-w-[160px] truncate text-neutral-100">
          {current.name}
        </span>
        <ChevronDown open={open} />
      </button>

      <div
        role="listbox"
        aria-hidden={!open}
        className={`absolute left-0 top-[calc(100%+8px)] z-[140] min-w-[260px] overflow-hidden rounded-xl border border-white/10 bg-neutral-900/95 shadow-2xl backdrop-blur-xl transition-all duration-200 ease-out ${
          open
            ? 'pointer-events-auto translate-y-0 opacity-100'
            : 'pointer-events-none -translate-y-1 opacity-0'
        }`}
      >
        <div className="border-b border-white/[0.06] px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
          {tx.activeTenantHeader}
        </div>
        <ul className="max-h-[320px] overflow-y-auto py-1">
          {tenants.map((t) => {
            const isCurrent = t.id === current.id;
            const isSwitching = switching === t.id;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => handleSelect(t)}
                  disabled={isSwitching}
                  role="option"
                  aria-selected={isCurrent}
                  data-testid={`tenant-option-${t.slug}`}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-[13px] transition-colors ${
                    isCurrent
                      ? 'bg-white/[0.06] text-white'
                      : 'text-neutral-300 hover:bg-white/[0.06] hover:text-white'
                  } disabled:cursor-progress disabled:opacity-60`}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <TenantBadge tenant={t} size="sm" />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{t.name}</span>
                      <span className="truncate text-[10px] uppercase tracking-wider text-neutral-500">
                        {t.role}
                        {!t.is_active && tx.inactiveSuffix}
                      </span>
                    </span>
                  </span>
                  {isCurrent && !isSwitching && <CheckIcon />}
                  {isSwitching && (
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
