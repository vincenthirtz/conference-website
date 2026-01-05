// pages/admin/tournament/[id]/bracket.tsx
// Vue bracket (admin) avec accès rapide vers l'éditeur

import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';

type StaffProps = {
  staff: {
    id: string | null;
    role: string | null;
    display_name: string | null;
  };
};

export const getServerSideProps = withStaffPage('manager');

function AdminBracketPage(_: StaffProps) {
  const router = useRouter();
  const { id } = router.query;
  const tournamentId = Array.isArray(id) ? id[0] : id;

  return (
    <>
      <Head>
        <title>Admin · Bracket</title>
      </Head>
      <div className="min-h-screen bg-neutral-950 text-white pt-24">
        <div className="max-w-6xl mx-auto px-6 py-10 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-purple-200/80">
                Admin · Bracket
              </p>
              <h1 className="text-2xl font-semibold">
                Tournoi {tournamentId ?? '—'}
              </h1>
              <p className="text-sm text-neutral-400">
                Accès rapide au bracket builder et aux matchs.
              </p>
            </div>
            <div className="flex gap-2">
              {tournamentId && (
                <>
                  <Link
                    href={`/admin/tournament/${tournamentId}/bracket-builder`}
                    className="px-3 py-2 rounded-lg bg-purple-600/80 hover:bg-purple-600 text-sm font-semibold shadow"
                  >
                    Ouvrir le bracket builder
                  </Link>
                  <Link
                    href={`/admin/tournament/${tournamentId}/matches`}
                    className="px-3 py-2 rounded-lg bg-white/10 border border-white/15 hover:bg-white/15 text-sm"
                  >
                    Voir les matchs
                  </Link>
                </>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-6">
            <p className="text-sm text-neutral-300">
              Cette page sert de point d’entrée vers l’outil de construction du bracket.
              Utilisez le bouton ci-dessus pour ajuster les slots, rounds et résultats.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

export default AdminBracketPage;
