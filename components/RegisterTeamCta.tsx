// components/RegisterTeamCta.tsx
//
// Le bouton « Inscrire mon équipe », partout sur le site public.
//
// Il existait en huit exemplaires, chacun avec son propre balisage, et SEULE la
// landing de tournoi savait que les places étaient prises. Les sept autres
// invitaient donc à s'inscrire à un tournoi complet — jusqu'au formulaire, où
// la personne l'apprenait.
//
// Quand c'est complet : le bouton passe en DÉSACTIVÉ, affiche « Complet » en
// rouge, et laisse à côté la seule action encore possible — créer son équipe
// pour la saison suivante. On ne le masque pas : une place prise est une
// information, un bouton disparu n'en est pas une.
//
// L'état vient de `useRegistrationFull`, qui le DÉDUIT des places libres. Rien
// à rouvrir à la main l'an prochain.

import Link from 'next/link';
import type { JSX, ReactNode } from 'react';
import { useRegistrationFull } from '@/hooks/useRegistrationFull';
import { useT } from '@/lib/i18n/useT';
import nsRegisterCta from '@/lib/i18n/locales/fr/registerCta';

type Props = {
  /** Le libellé de la page appelante — « Inscrire mon équipe », etc. */
  label: string;
  /** Classes du bouton quand les inscriptions sont ouvertes. */
  className?: string;
  /** Contenu riche (flèche, halo…) rendu à la place du simple libellé. */
  children?: ReactNode;
  /**
   * Afficher le lien « Créer une équipe (prochaine saison) » à côté de l'état
   * complet. Faux là où la page propose déjà cette action par elle-même.
   */
  withNextSeason?: boolean;
};

export default function RegisterTeamCta({
  label,
  className,
  children,
  withNextSeason = true,
}: Props): JSX.Element {
  const t = useT(nsRegisterCta);
  const { isFull, loading } = useRegistrationFull();

  // Tant qu'on ne sait pas, on garde le bouton normal : un faux « Complet »
  // découragerait une inscription légitime.
  if (loading || !isFull) {
    return (
      <Link href="/team/create" className={className}>
        {children ?? label}
      </Link>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled
        aria-disabled="true"
        title={t.fullTitle}
        className="inline-flex cursor-not-allowed items-center gap-2 rounded-xl border border-red-500/50 bg-red-500/10 px-6 py-3.5 text-base font-extrabold uppercase tracking-wider text-red-300 opacity-90"
      >
        {t.full}
      </button>
      {withNextSeason && (
        <Link
          href="/team/create"
          className="rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-white transition hover:border-[var(--color-green)]/60 hover:bg-[var(--color-green)]/10 hover:text-[var(--color-green-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green)]"
        >
          {t.nextSeason}
        </Link>
      )}
    </span>
  );
}
