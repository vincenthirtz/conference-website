// components/tcg/landing/TcgStartCta.tsx
//
// « Commencer ma collection » : l'espace TCG pour une joueuse connectée, la
// connexion (avec retour vers cet espace) sinon.
//
// LE LIEN DE CONNEXION EST LA VALEUR PAR DÉFAUT. La page est statique : au
// rendu serveur, et tant que la session n'est pas résolue, personne n'est
// connu. Viser `/login?next=…` dans ce cas reste juste — une joueuse déjà
// connectée y est renvoyée vers `next` — alors que viser l'espace ferait
// rebondir une visiteuse par une redirection de plus.

import Link from 'next/link';
import type { JSX } from 'react';

import { useSession } from '@/hooks/useSession';

export const TCG_SPACE_PATH = '/player/tcg';
export const TCG_LOGIN_PATH = `/login?next=${TCG_SPACE_PATH}`;

/** Cible du CTA selon l'état de session. Exportée pour être testée sans DOM. */
export function startCtaHref(signedIn: boolean): string {
  return signedIn ? TCG_SPACE_PATH : TCG_LOGIN_PATH;
}

/** Les classes du bouton principal, partagées avec les autres CTA de la page. */
export const PRIMARY_CTA_CLASS =
  'inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--color-violet-cta)] px-6 py-3 text-base font-semibold transition hover:bg-[var(--color-violet-deep)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-deep)]';

export default function TcgStartCta({
  label,
  className = '',
}: {
  label: string;
  className?: string;
}): JSX.Element {
  const { user, loading } = useSession();
  const href = startCtaHref(!loading && Boolean(user));

  return (
    <Link href={href} className={`${PRIMARY_CTA_CLASS} ${className}`}>
      {label}
    </Link>
  );
}
