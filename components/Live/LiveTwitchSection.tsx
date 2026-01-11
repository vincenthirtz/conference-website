import { useEffect, useMemo, useState } from 'react';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import Button from '@/components/Buttons/button';

type TwitchChannel = {
  channel: string;
  label: string;
  badge: string | null;
  description: string | null;
  background: string | null;
};

export default function LiveTwitchSection() {
  const [twitchChannels, setTwitchChannels] = useState<TwitchChannel[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [liveStatus, setLiveStatus] = useState<Record<string, boolean>>({});
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 6;

  // Charger les chaînes depuis l'API
  useEffect(() => {
    const fetchChannels = async () => {
      setLoadingChannels(true);
      try {
        const resp = await fetch('/api/twitch-channels');
        if (!resp.ok) throw new Error('Failed to fetch channels');
        const json = await resp.json();
        setTwitchChannels(json.items || []);
      } catch (err) {
        console.error('LiveTwitchSection channels fetch error:', err);
        setTwitchChannels([]);
      } finally {
        setLoadingChannels(false);
      }
    };

    fetchChannels();
  }, []);

  // Charger les statuts live
  useEffect(() => {
    if (twitchChannels.length === 0) return;

    const fetchStatuses = async () => {
      setLoadingStatus(true);
      try {
        const channelsParam = twitchChannels.map((c) => c.channel).join(',');
        const resp = await fetch(`/api/twitch/live?channels=${channelsParam}`);
        if (!resp.ok) throw new Error('Twitch status error');
        const json = await resp.json();
        const statuses: Record<string, boolean> = {};
        Object.entries(json.statuses || {}).forEach(([ch, info]: any) => {
          statuses[ch] = Boolean((info as any)?.live);
        });
        setLiveStatus(statuses);
      } catch (err) {
        console.error('LiveTwitchSection status fetch error:', err);
      } finally {
        setLoadingStatus(false);
      }
    };

    fetchStatuses();
  }, [twitchChannels]);

  const paginated = useMemo(() => {
    const start = page * pageSize;
    return twitchChannels.slice(start, start + pageSize);
  }, [page, twitchChannels]);

  const hasPrev = page > 0;
  const hasNext = (page + 1) * pageSize < twitchChannels.length;

  // Ne pas afficher la section si aucune chaîne
  if (!loadingChannels && twitchChannels.length === 0) {
    return null;
  }

  return (
    <div
      id="tickets"
      className="flex items-center flex-col justify-center pt-20 lg:pt-0"
    >
      <div className="text-xl text-white font-semibold border-b-2 border-blue-400 mb-1">
        Live
      </div>
      <div data-test="ticket-section" className="flex flex-col items-center ">
        <Heading
          typeStyle="heading-md"
          className="text-gradient text-center lg:mt-10"
        >
          En attendant la compétition
        </Heading>
        <div className="max-w-3xl sm:w-full text-center">
          <Paragraph
            typeStyle="body-lg"
            className="mt-6"
            textColor="text-gray-200"
          >
            Retrouvez nos chaînes partenaires, casts et analyses en attendant la
            compétition.
          </Paragraph>
        </div>

        {loadingChannels ? (
          <div className="mt-12 flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-gray-600 border-t-white rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="mt-12 grid gap-8 w-full grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
              {paginated.map(
                ({ channel, label, badge, description, background }) => {
                  const isLive = liveStatus[channel] === true;
                  return (
                    <div
                      key={channel}
                      className="group rounded-2xl border border-white/10 bg-white/5 overflow-hidden shadow-[0_18px_60px_rgba(0,0,0,0.35)] transition hover:border-purple-400/60 hover:-translate-y-1"
                    >
                      <div className="p-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div
                              className="h-12 w-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 text-white font-semibold flex items-center justify-center uppercase"
                              style={{
                                backgroundSize: 'cover',
                                backgroundImage: background
                                  ? `url(${background})`
                                  : undefined,
                              }}
                            >
                              {!background && label.charAt(0)}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[11px] uppercase tracking-[0.16em] text-gray-300"></span>
                              <span className="text-xl text-white font-semibold">
                                {label}
                              </span>
                              <span className="flex items-center gap-2 text-xs text-gray-200">
                                <span
                                  className={`h-2.5 w-2.5 rounded-full ${
                                    isLive
                                      ? 'bg-red-500 animate-pulse'
                                      : 'bg-gray-500'
                                  }`}
                                  aria-hidden
                                />
                                {isLive ? 'Live en cours' : 'Hors ligne'}
                              </span>
                            </div>
                          </div>
                          {badge && (
                            <span className="text-xs rounded-full bg-white/10 px-3 py-1 text-gray-200 border border-white/10">
                              {badge}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-300 leading-relaxed">
                          {description ||
                            `Streams OW2, analyses et cast en direct. Suivez ${label}.`}
                        </p>
                        {loadingStatus && (
                          <p className="text-[11px] text-gray-500">
                            Mise à jour du statut…
                          </p>
                        )}
                        <div className="flex justify-end">
                          <a
                            href={`https://twitch.tv/${channel}`}
                            target="_blank"
                            rel="noreferrer"
                            className="w-full md:w-auto"
                          >
                            <Button
                              type="button"
                              className="w-full md:w-auto px-4 py-2 bg-purple-600 hover:bg-purple-500"
                            >
                              Voir la chaîne
                            </Button>
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                }
              )}
            </div>
            {twitchChannels.length > pageSize && (
              <div className="mt-6 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={!hasPrev}
                  className={`px-4 py-2 rounded-lg border text-sm ${
                    hasPrev
                      ? 'border-white/30 text-white hover:border-white/60'
                      : 'border-white/10 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  ← Précédent
                </button>
                <span className="text-sm text-gray-300">
                  Page {page + 1} /{' '}
                  {Math.max(1, Math.ceil(twitchChannels.length / pageSize))}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => (hasNext ? p + 1 : p))}
                  disabled={!hasNext}
                  className={`px-4 py-2 rounded-lg border text-sm ${
                    hasNext
                      ? 'border-white/30 text-white hover:border-white/60'
                      : 'border-white/10 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  Suivant →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
