import Head from 'next/head';

type Replay = {
  title: string;
  youtubeId: string;
  description?: string;
  date?: string;
};

// Renseigne ici les vidéos YouTube de l'édition 2025 (embed)
const replays: Replay[] = [
  {
    title: 'DAY 1 – OW Women’s Cup',
    youtubeId: 'MPa_TWJZQ60',
    description: 'Première journée.',
    date: '17 novembre 2025',
  },
  {
    title: 'DAY 2 – OW Women’s Cup',
    youtubeId: 'nhj6gCiSYrk',
    description: 'Seconde journée.',
    date: '24 novembre 2025',
  },
];

export default function RediffusionsPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <Head>
        <title>Rediffusions 2025 | OW Women&apos;s Cup</title>
      </Head>

      <div className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -left-32 -top-32 w-[420px] h-[420px] rounded-full bg-purple-600/30 blur-3xl" />
          <div className="absolute right-10 top-10 w-[360px] h-[360px] rounded-full bg-pink-500/20 blur-3xl" />
        </div>

        <div className="max-w-5xl mx-auto px-6 pt-24 pb-14 relative">
          <p className="text-xs uppercase tracking-[0.24em] text-purple-200/80">
            Rediffusions
          </p>
          <h1 className="text-4xl md:text-5xl font-bold mt-3 leading-tight">
            Revivez l&apos;édition 2025
          </h1>
          <p className="text-neutral-300 text-lg mt-4 max-w-2xl">
            Finales, meilleurs moments et VOD officielles.
          </p>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 pb-20">
        {replays.length === 0 ? (
          <p className="text-neutral-400 text-sm">
            Aucune rediffusion n&apos;est disponible pour le moment.
          </p>
        ) : (
          <div className="grid gap-8 md:grid-cols-2">
            {replays.map((replay) => (
              <div
                key={replay.title}
                className="bg-neutral-900 border border-white/10 rounded-2xl p-4 shadow-xl shadow-black/20"
              >
                <div className="aspect-video rounded-xl overflow-hidden border border-white/10 bg-black/40">
                  {replay.youtubeId.includes('VIDEO_ID') ? (
                    <div className="w-full h-full flex items-center justify-center text-sm text-neutral-400">
                      Remplace l&apos;ID YouTube pour afficher la vidéo.
                    </div>
                  ) : (
                    <iframe
                      className="w-full h-full"
                      src={`https://www.youtube.com/embed/${replay.youtubeId}`}
                      title={replay.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  )}
                </div>
                <div className="mt-3">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold">{replay.title}</h2>
                    {replay.date && (
                      <span className="text-xs px-2 py-1 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-100">
                        {replay.date}
                      </span>
                    )}
                  </div>
                  {replay.description && (
                    <p className="text-sm text-neutral-300 mt-1">
                      {replay.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
