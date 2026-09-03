// components/Tournaments/TournamentsPage.tsx
//
// Page « liste des tournois » complète : la liste, ou l'état d'erreur.
//
// Extraite de `pages/tournaments.tsx` pour que la variante par espace
// (`pages/[tenantSlug]/tournaments.tsx`) rende exactement la même chose. Deux
// copies de ce rendu auraient divergé au premier ajustement.

import TournamentsList, {
  type Tournament,
} from '@/components/Tournaments/TournamentsList';
import { useT } from '@/lib/i18n/useT';
import nsTournamentsList from '@/lib/i18n/locales/fr/tournamentsList';

export type TournamentsPageProps = {
  tournaments: Tournament[];
  loadError: boolean;
};

export default function TournamentsPage({
  tournaments,
  loadError,
}: TournamentsPageProps) {
  const t = useT(nsTournamentsList);

  if (loadError) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
        <main className="container mx-auto px-4 pt-24 pb-16 max-w-6xl">
          <section className="text-center py-16" role="alert">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                />
              </svg>
            </div>
            <h1 className="text-xl font-semibold mb-2">{t.loadErrorTitle}</h1>
            <p className="text-gray-400 mb-6">{t.loadErrorBody}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-md bg-[var(--color-violet)] hover:bg-[var(--color-violet-deep)] text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)]"
            >
              {t.retry}
            </button>
          </section>
        </main>
      </div>
    );
  }

  return <TournamentsList tournaments={tournaments} />;
}
