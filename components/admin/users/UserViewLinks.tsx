// components/admin/users/UserViewLinks.tsx
//
// Les « vues » d'un compte, depuis une ligne de `/admin/users/manage` :
// joueuse, capitaine, staff.
//
// EXTRAIT DE `manage.tsx` — lot A7 : tout lot qui touche un god-component en
// sort un morceau. La page est gelée à 2 421 lignes par
// `tests/unit/adminFileSizeGuard.test.ts`, et y ajouter une troisième vue
// l'aurait fait grossir. Une cinquantaine de lignes de tracés SVG n'ont de
// toute façon rien à faire au milieu de la logique d'une liste.
//
// CHAQUE LIEN EST CONDITIONNEL À CE QUE LA PERSONNE EST. Un compte sans
// capitanat n'a pas de vue capitaine, un compte hors staff n'a pas de vue
// staff : proposer une vue vide ferait chercher une information qui n'existe
// pas. La vue joueuse, elle, vaut pour tout le monde — tout compte a un espace
// joueuse, même vide.

import type { JSX } from 'react';
import Link from 'next/link';

type Labels = {
  playerViewTitle: string;
  captainViewTitle: string;
  staffViewTitle: string;
};

type Props = {
  userId: string;
  /** La personne encadre-t-elle au moins une équipe ? */
  isCaptain: boolean;
  /** Son rôle de compte est-il un rôle de staff ? */
  isStaff: boolean;
  labels: Labels;
};

const ICON_CLASS = 'w-4 h-4';
const LINK_BASE =
  'p-2 rounded-lg text-neutral-400 hover:bg-white/[0.06] transition-colors';

export default function UserViewLinks({
  userId,
  isCaptain,
  isStaff,
  labels,
}: Props): JSX.Element {
  return (
    <>
      <Link
        href={`/admin/users/${userId}/player-view`}
        title={labels.playerViewTitle}
        aria-label={labels.playerViewTitle}
        className={`${LINK_BASE} hover:text-emerald-400`}
      >
        <svg
          className={ICON_CLASS}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
          />
        </svg>
      </Link>

      {isCaptain && (
        <Link
          href={`/admin/users/${userId}/captain-view`}
          title={labels.captainViewTitle}
          aria-label={labels.captainViewTitle}
          className={`${LINK_BASE} hover:text-amber-400`}
        >
          <svg
            className={ICON_CLASS}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
            />
          </svg>
        </Link>
      )}

      {isStaff && (
        <Link
          href={`/admin/users/${userId}/staff-view`}
          title={labels.staffViewTitle}
          aria-label={labels.staffViewTitle}
          className={`${LINK_BASE} hover:text-violet-400`}
        >
          <svg
            className={ICON_CLASS}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12l2 2 4-4M12 3l7 4v5c0 4.418-2.99 8.243-7 9-4.01-.757-7-4.582-7-9V7l7-4z"
            />
          </svg>
        </Link>
      )}
    </>
  );
}
