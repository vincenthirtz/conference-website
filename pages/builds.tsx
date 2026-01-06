import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Button from '@/components/Buttons/button';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';

type Build = {
  id: string;
  state: string;
  error: string | null;
  created_at: string | null;
  updated_at?: string | null;
  published_at?: string | null;
  deploy_time: number | null;
  commit_ref: string | null;
  commit_url: string | null;
  commit_message?: string | null;
  title: string | null;
  branch: string | null;
  context: string | null;
  deploy_url?: string | null;
  review_id?: string | null;
  review_url?: string | null;
  user_id?: string | null;
  user_name?: string | null;
};

function computeStatus(build: Build) {
  const s = (build.state || '').toLowerCase();
  const successStates = ['ready', 'done', 'success', 'published'];
  const errorStates = ['error', 'failed', 'timeout', 'canceled', 'cancelled'];

  if (build.error || errorStates.includes(s)) {
    return 'error';
  }

  if (
    successStates.includes(s) ||
    (!s && build.deploy_time !== null && build.error === null)
  ) {
    return 'success';
  }

  return 'pending';
}

function StatusBadge({ build }: { build: Build }) {
  const status = computeStatus(build);

  if (status === 'success') {
    return (
      <span className="px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-100 border border-emerald-500/40 text-[12px]">
        Succès
      </span>
    );
  }

  if (status === 'error') {
    return (
      <span className="px-3 py-1 rounded-full bg-red-500/15 text-red-100 border border-red-500/40 text-[12px]">
        Échoué
      </span>
    );
  }

  return (
    <span className="px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-100 border border-emerald-500/40 text-[12px]">
      Succès
    </span>
  );
}

export default function BuildsPage() {
  const [builds, setBuilds] = useState<Build[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBuilds = async () => {
      try {
        // Use API route for local dev; on Netlify the API route will still work.
        const res = await fetch('/api/netlify-builds');
        if (!res.ok) {
          throw new Error(`Erreur ${res.status}`);
        }
        const data = (await res.json()) as Build[];
        setBuilds(data);
      } catch (err: any) {
        setError(err?.message || 'Impossible de charger les builds');
      } finally {
        setLoading(false);
      }
    };

    fetchBuilds();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#0b0b14] to-black text-white">
      <Head>
        <title>Statut des builds Netlify | OW Women&apos;s Cup</title>
      </Head>

      <main className="container mx-auto max-w-5xl px-4 pt-24 pb-16">
        <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <Heading typeStyle="heading-md" className="text-gradient mb-1">
              Builds Netlify
            </Heading>
            <Paragraph
              typeStyle="body-sm"
              textColor="text-gray-300"
              className="max-w-2xl"
            >
              Suivez en temps réel les déploiements du site.
            </Paragraph>
          </div>
          <div className="flex gap-2">
            <Link href="/">
              <Button type="button" size="compact" className="px-3 py-1.5">
                ← Retour à l&apos;accueil
              </Button>
            </Link>
          </div>
        </header>

        <section className="bg-white/5 border border-white/10 rounded-2xl p-4">
          {loading && (
            <p className="text-sm text-gray-300">Chargement des builds…</p>
          )}
          {error && (
            <p className="text-sm text-red-300">
              Erreur lors du chargement : {error}
            </p>
          )}

          {!loading && !error && builds.length === 0 && (
            <p className="text-sm text-gray-300">Aucun build récent trouvé.</p>
          )}

          {!loading && !error && builds.length > 0 && (
            <ul className="divide-y divide-white/5">
              {builds.map((build) => (
                <li
                  key={build.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-[2px] rounded-full bg-white/10 text-white border border-white/30 text-[11px]">
                        {stateLabel(build.state)}
                      </span>
                      {build.context && (
                        <span className="text-[11px] text-gray-400">
                          {build.context}
                        </span>
                      )}
                      {build.branch && (
                        <span className="text-[11px] text-gray-400">
                          · {build.branch}
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-semibold text-white">
                      {build.title || build.commit_ref || 'Build'}
                    </div>
                    <div className="text-[12px] text-gray-400 flex flex-wrap gap-2">
                      {build.created_at && (
                        <span>Démarré : {formatDate(build.created_at)}</span>
                      )}
                      {build.deploy_time !== null && (
                        <span>· Durée : {build.deploy_time}s</span>
                      )}
                      {build.commit_url && (
                        <a
                          href={build.commit_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-300 hover:text-blue-100"
                        >
                          Voir le commit
                        </a>
                      )}
                    </div>
                    {build.error && (
                      <div className="text-[12px] text-red-300">
                        Erreur : {build.error}
                      </div>
                    )}
                  </div>
                  <StatusBadge build={build} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function stateLabel(state: string) {
  switch (state) {
    case 'done':
    case 'success':
    case 'ready':
      return 'Succès';
    case 'building':
    case 'enqueued':
      return 'En cours';
    case 'error':
      return 'Erreur';
    default:
      return state;
  }
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
