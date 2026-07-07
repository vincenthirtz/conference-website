import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import { useT } from '@/lib/i18n/useT';
import ShareEmbedPanel from '@/components/tournament/ShareEmbedPanel';

// Placeholder page to keep the route valid and avoid build failures.
// If a dedicated bracket view is added later, replace this stub.
export default function TournamentBracketPage() {
  const router = useRouter();
  const t = useT('tournamentBracket');
  const { id } = router.query;

  useEffect(() => {
    // Soft-redirect users toward the matches view while this page is pending.
    if (id) {
      router.replace(`/tournament/${id}/matches`);
    }
  }, [id, router]);

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center px-6 py-16 text-center">
      <Head>
        <title>{t.headTitle}</title>
      </Head>
      <div className="space-y-4 max-w-xl">
        <h1 className="text-3xl font-semibold">{t.heading}</h1>
        <p className="text-neutral-300">{t.body}</p>
        {id && (
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href={`/tournament/${id}/matches`}
              className="inline-flex items-center gap-2 rounded-full bg-pink-500/80 hover:bg-pink-500 px-4 py-2 text-sm font-medium text-white transition"
            >
              {t.viewMatches}
            </Link>
            <ShareEmbedPanel
              slugOrId={String(id)}
              variant="compact"
            />
          </div>
        )}
      </div>
    </div>
  );
}
