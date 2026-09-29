// components/Navbar/PlayerTopBarMenus.tsx — menus déroulants de la barre
// joueuse (menu « Site »), sortis de PlayerTopBar au lot P8. Rendu inchangé.

import Link from 'next/link';
import type { ReactNode } from 'react';

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden
      className={`h-3 w-3 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
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

export function DropdownButton({
  label,
  open,
  onToggle,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
        open
          ? 'bg-white/[0.08] text-white'
          : 'text-neutral-300 hover:bg-white/[0.06] hover:text-white'
      }`}
      aria-expanded={open}
      aria-haspopup="true"
    >
      {label}
      <ChevronDown open={open} />
    </button>
  );
}

export function DropdownPanel({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`absolute left-0 top-[calc(100%+8px)] z-[130] min-w-[220px] overflow-hidden rounded-xl border border-white/10 bg-neutral-900/95 shadow-2xl backdrop-blur-xl transition-all duration-200 ease-out ${
        open
          ? 'pointer-events-auto translate-y-0 opacity-100'
          : 'pointer-events-none -translate-y-1 opacity-0'
      }`}
      role="menu"
      aria-hidden={!open}
    >
      {children}
    </div>
  );
}

export function PanelLink({
  href,
  onNavigate,
  children,
}: {
  href: string;
  onNavigate: () => void;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      className="block px-4 py-2.5 text-[13px] text-neutral-300 transition-colors hover:bg-white/[0.06] hover:text-white"
      onClick={onNavigate}
    >
      {children}
    </Link>
  );
}
