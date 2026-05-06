import { useEffect, useState, type JSX } from 'react';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';

const CHANNEL = 'womens_cup';
const POLL_MS = 60_000;

type LiveInfo = {
  live: boolean;
  title?: string;
  viewer_count?: number;
};

function scheduleIdle(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(cb, { timeout: 2000 });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(cb, 1500);
  return () => window.clearTimeout(id);
}

export default function HomeTwitchEmbed(): JSX.Element | null {
  const [info, setInfo] = useState<LiveInfo | null>(null);
  const [parent, setParent] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setParent(window.location.hostname);
    }
    return scheduleIdle(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/twitch/live?channels=${CHANNEL}`);
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        setInfo(json?.statuses?.[CHANNEL] ?? { live: false });
      } catch {
        /* offline / network error: stay null */
      }
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [ready]);

  if (!info?.live || !parent) return null;

  const playerSrc = `https://player.twitch.tv/?channel=${CHANNEL}&parent=${parent}&muted=true`;

  return (
    <section
      className="container mt-20 flex flex-col gap-6 px-4 md:px-0"
      aria-label="Diffusion en direct"
    >
      <div className="flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-rose-200">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500" />
          </span>
          En direct sur Twitch
        </div>
        <Heading
          typeStyle="heading-md"
          className="text-gradient text-center lg:mt-3"
        >
          {info.title || 'Le live est en cours'}
        </Heading>
        {typeof info.viewer_count === 'number' && (
          <Paragraph className="mt-2 text-sm" textColor="text-gray-300">
            {info.viewer_count.toLocaleString('fr-FR')} spectateur
            {info.viewer_count > 1 ? 's' : ''} connecté
            {info.viewer_count > 1 ? 's' : ''}
          </Paragraph>
        )}
      </div>

      <div className="relative w-full overflow-hidden rounded-3xl border border-white/10 bg-black shadow-2xl aspect-video">
        <iframe
          src={playerSrc}
          title={`Twitch ${CHANNEL} live player`}
          allowFullScreen
          allow="autoplay; fullscreen"
          className="absolute inset-0 h-full w-full"
        />
      </div>
    </section>
  );
}
