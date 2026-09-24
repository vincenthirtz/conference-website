/* biome-ignore-all lint/performance/noImgElement: avatar hors next/image (hôtes OAuth arbitraires) */
// components/Navbar/AccountMenu.tsx
//
// Menu de compte du site public (bureau) : avatar + nom, puis les AUTRES
// espaces — Mon espace, Mon profil, Administration pour le staff — et la
// déconnexion.
//
// POURQUOI. Une fois connectée, une joueuse perdait les boutons Connexion /
// Inscription sans rien à la place : aucun lien vers son espace depuis le site.
// Et depuis que la barre admin ne remplace plus le menu du site (cf.
// headerBars.ts), c'est ici que le staff retrouve l'administration.

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';

export type LabeledAccountLink = { key: string; href: string; label: string };

export default function AccountMenu({
  name,
  avatarUrl,
  roleLabel,
  links,
  logoutLabel,
  menuLabel,
  onLogout,
}: {
  name: string;
  avatarUrl: string | null;
  roleLabel?: string | null;
  links: LabeledAccountLink[];
  logoutLabel: string;
  /** Nom accessible du bouton (« Mon compte »). */
  menuLabel: string;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const initial = name.trim().charAt(0).toUpperCase() || '?';

  return (
    <div ref={rootRef} className="relative ml-3 shrink-0">
      <button
        type="button"
        aria-label={`${menuLabel} — ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1 pl-1 pr-3 text-[13px] font-medium text-neutral-100 backdrop-blur-md transition-all hover:border-white/20 hover:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="h-7 w-7 rounded-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span
            aria-hidden
            className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-violet-cta)] text-[12px] font-bold text-white"
          >
            {initial}
          </span>
        )}
        <span className="max-w-[9rem] truncate">{name}</span>
        <svg
          aria-hidden
          className={`h-3.5 w-3.5 text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`}
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
      </button>

      {open && (
        <div
          id={panelId}
          role="menu"
          className="absolute right-0 top-full z-[130] mt-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-[#140c26]/95 p-1.5 shadow-2xl backdrop-blur-2xl"
        >
          {roleLabel && (
            <p className="px-3 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
              {roleLabel}
            </p>
          )}
          {links.map((l) => (
            <Link
              key={l.key}
              href={l.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2 text-[13px] text-neutral-200 transition-colors hover:bg-white/[0.08] hover:text-white focus:outline-none focus-visible:bg-white/[0.08]"
            >
              {l.label}
            </Link>
          ))}
          <div className="my-1 h-px bg-white/[0.08]" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
            className="block w-full rounded-lg px-3 py-2 text-left text-[13px] text-neutral-300 transition-colors hover:bg-white/[0.08] hover:text-white focus:outline-none focus-visible:bg-white/[0.08]"
          >
            {logoutLabel}
          </button>
        </div>
      )}
    </div>
  );
}
