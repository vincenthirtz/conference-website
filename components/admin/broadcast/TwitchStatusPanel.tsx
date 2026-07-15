// components/admin/broadcast/TwitchStatusPanel.tsx
// Widget LECTURE SEULE pour la console régie live (pages/admin/broadcast/live).
// Objectif : le régisseur PRÉVISUALISE en direct le flux Twitch du tenant
// (aperçu vidéo embarqué) + voit le statut live / nombre de spectateurs, sans
// quitter la console.
//
// Contrats consommés (aucune écriture) :
//  - GET /api/admin/twitch-channels → { items: TwitchChannelRow[] } (staff-scoped,
//    résout le tenant depuis le contexte admin ; actives uniquement par défaut).
//  - GET /api/twitch/live?channels=a,b → { statuses: { <chan>: { live, title?,
//    viewer_count? } } } ; 503 si TWITCH_CLIENT_ID/SECRET absents.
//
// Embed : iframe player.twitch.tv muté, en réutilisant EXACTEMENT le mécanisme
// des composants publics (HomeTwitchEmbed / LiveTwitchSection) — le paramètre
// `parent` = window.location.hostname est indispensable, sinon Twitch refuse
// l'embed. La CSP frame-src autorise déjà Twitch (ces composants l'embarquent).
// Player MUTÉ par défaut : le son de l'antenne est géré ailleurs, un player non
// muté en régie créerait du larsen.
//
// Cas dégradés (le widget ne doit JAMAIS bloquer le pilotage) :
//  - aucune chaîne active           → masqué (null).
//  - /api/twitch/live renvoie 503   → ligne discrète « Twitch non configuré ».
//  - chaîne principale hors ligne   → « Hors ligne » à la place du player.
//  - erreur réseau / autre non-2xx  → état neutre (dernier statut connu, pas de crash).
//
// Poll 60s VISIBILITY-GATÉ (comme le reste de la console) + refetch au retour
// visible. Pas de realtime : le statut Twitch bouge lentement.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT, format } from '@/lib/i18n/useAdminT';

type TwitchChannelRow = {
  channel: string;
  label: string | null;
  is_active: boolean;
};

type LiveStatus = {
  live: boolean;
  title?: string;
  viewer_count?: number;
};

const POLL_MS = 60_000;

export default function TwitchStatusPanel() {
  const t = useAdminT('adminBroadcastLive');
  const { adminFetch, adminFetchJson } = useAdminFetch();

  // channels === null : chargement en cours. [] : aucune chaîne active (masqué).
  const [channels, setChannels] = useState<TwitchChannelRow[] | null>(null);
  const [statuses, setStatuses] = useState<Record<string, LiveStatus>>({});
  const [notConfigured, setNotConfigured] = useState(false);
  // `parent` du player Twitch : indisponible côté SSR, récupéré après hydratation
  // (comme HomeTwitchEmbed). Sans lui, Twitch refuse l'embed.
  const [parent, setParent] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') setParent(window.location.hostname);
  }, []);

  // Liste des logins actifs, jointe — sert de clé de dépendance stable au poll.
  const activeChannels = useMemo(
    () => (channels ?? []).filter((c) => c.is_active && c.channel),
    [channels]
  );
  const loginsKey = useMemo(
    () => activeChannels.map((c) => c.channel.trim().toLowerCase()).join(','),
    [activeChannels]
  );

  // 1) Chaînes du tenant (une seule fois). L'endpoint admin résout le tenant de
  //    façon fiable et ne renvoie que les chaînes actives par défaut. En cas
  //    d'échec on dégrade en « aucune chaîne » (widget masqué), jamais de crash.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const json = await adminFetchJson<{ items: TwitchChannelRow[] }>(
          '/api/admin/twitch-channels'
        );
        if (!cancelled) setChannels(json.items ?? []);
      } catch {
        if (!cancelled) setChannels([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminFetchJson]);

  // 2) Statuts live. adminFetch renvoie la Response brute → on inspecte le status
  //    pour distinguer le 503 (« non configuré ») des autres erreurs (neutre).
  const fetchStatuses = useCallback(
    async (logins: string) => {
      if (!logins) return;
      try {
        const res = await adminFetch(
          `/api/twitch/live?channels=${encodeURIComponent(logins)}`,
          { skipAuthRedirect: true }
        );
        if (res.status === 503) {
          setNotConfigured(true);
          return;
        }
        if (!res.ok) return; // état neutre : on garde le dernier statut connu.
        const json = (await res.json()) as {
          statuses?: Record<string, LiveStatus>;
        };
        setNotConfigured(false);
        const map: Record<string, LiveStatus> = {};
        Object.entries(json.statuses ?? {}).forEach(([ch, info]) => {
          map[ch.toLowerCase()] = {
            live: Boolean(info?.live),
            title: info?.title,
            viewer_count: info?.viewer_count,
          };
        });
        setStatuses(map);
      } catch {
        // Réseau HS : on reste neutre (dernier statut affiché), pas de crash.
      }
    },
    [adminFetch]
  );

  useEffect(() => {
    if (!loginsKey) return;
    fetchStatuses(loginsKey);
    function tick() {
      if (
        typeof document !== 'undefined' &&
        document.visibilityState !== 'visible'
      )
        return;
      fetchStatuses(loginsKey);
    }
    const handle = setInterval(tick, POLL_MS);
    function onVisible() {
      if (document.visibilityState === 'visible') fetchStatuses(loginsKey);
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(handle);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loginsKey, fetchStatuses]);

  // Chargement initial des chaînes : ligne discrète (pas d'écran blanc).
  if (channels === null) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 px-4 py-4 mb-6">
        <div className="text-xs uppercase tracking-widest text-neutral-400 mb-2">
          {t.twitchHeading}
        </div>
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <span className="inline-block h-4 w-4 rounded-full border-2 border-neutral-600 border-t-neutral-300 animate-spin" />
          {t.twitchLoading}
        </div>
      </div>
    );
  }

  // Aucune chaîne active → widget masqué (rien à surveiller).
  if (activeChannels.length === 0) return null;

  // Chaîne principale = première chaîne active (player principal).
  const primary = activeChannels[0];
  const primaryLogin = primary.channel.trim().toLowerCase();
  const primaryStatus = statuses[primaryLogin];
  const primaryLive = !!primaryStatus?.live;
  const playerSrc =
    primaryLive && parent
      ? `https://player.twitch.tv/?channel=${encodeURIComponent(
          primaryLogin
        )}&parent=${encodeURIComponent(parent)}&muted=true`
      : null;
  // Chat Twitch (host DIFFÉRENT : www.twitch.tv, pas player.twitch.tv). Reste
  // consultable même hors live → affiché indépendamment du statut. `darkpopout`
  // = thème sombre cohérent avec la console admin.
  // ⚠️ CSP : proxy.ts frame-src n'autorise que player.twitch.tv, PAS
  // www.twitch.tv → l'iframe sera bloquée tant que la directive n'est pas
  // complétée (signalé au coordinateur, hors périmètre de ce widget).
  const chatSrc = parent
    ? `https://www.twitch.tv/embed/${encodeURIComponent(
        primaryLogin
      )}/chat?parent=${encodeURIComponent(parent)}&darkpopout`
    : null;

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 px-4 py-4 mb-6">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="text-xs uppercase tracking-widest text-neutral-400">
          {t.twitchHeading}
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          className="px-2 py-1 rounded-md bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-[11px] font-medium text-neutral-300"
        >
          {collapsed ? t.twitchExpand : t.twitchCollapse}
        </button>
      </div>

      {notConfigured ? (
        <div className="text-xs text-neutral-500 italic">
          {t.twitchNotConfigured}
        </div>
      ) : (
        <>
          {/* Statut compact par chaîne active (info utile au-dessus du player). */}
          <ul
            aria-live="polite"
            aria-label={t.twitchHeading}
            className="space-y-1.5 mb-3"
          >
            {activeChannels.map((c) => {
              const login = c.channel.trim().toLowerCase();
              const st = statuses[login];
              const live = !!st?.live;
              return (
                <li key={login} className="flex items-center gap-3 text-sm">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                      live ? 'bg-red-500 animate-pulse' : 'bg-neutral-600'
                    }`}
                    aria-hidden
                  />
                  <span className="font-medium shrink-0">
                    {c.label || login}
                  </span>
                  {live ? (
                    <>
                      <span className="text-xs font-bold text-red-400 shrink-0">
                        {t.twitchLive}
                      </span>
                      {st?.title && (
                        <span className="min-w-0 truncate text-xs text-neutral-400">
                          {st.title}
                        </span>
                      )}
                      {typeof st?.viewer_count === 'number' && (
                        <span className="ml-auto shrink-0 whitespace-nowrap text-xs text-neutral-500">
                          {format(t.twitchViewers, {
                            count: st.viewer_count.toLocaleString(),
                          })}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-neutral-500">
                      {t.twitchOffline}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>

          {/* Aperçu chaîne principale : player (muté) + chat côte à côte sur
              large écran, empilés en dessous sur écran étroit. */}
          {!collapsed && (
            <div className="flex flex-col lg:flex-row gap-3">
              {/* Player vidéo (muté). Placeholder « hors ligne » si offline. */}
              <div className="relative w-full aspect-video overflow-hidden rounded-xl border border-neutral-800 bg-black lg:aspect-auto lg:h-[380px] lg:flex-1 lg:max-w-2xl">
                {playerSrc ? (
                  <iframe
                    key={playerSrc}
                    src={playerSrc}
                    title={format(t.twitchPreviewTitle, {
                      channel: primary.label || primaryLogin,
                    })}
                    allowFullScreen
                    allow="autoplay; fullscreen"
                    className="absolute inset-0 h-full w-full"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-neutral-500">
                    {t.twitchOfflinePlayer}
                  </div>
                )}
              </div>

              {/* Chat Twitch (consultable même hors live). Hauteur alignée sur
                  le player en large écran. */}
              {chatSrc && (
                <div className="relative w-full h-[320px] overflow-hidden rounded-xl border border-neutral-800 bg-black lg:h-[380px] lg:w-[340px] lg:shrink-0">
                  <iframe
                    key={chatSrc}
                    src={chatSrc}
                    title={format(t.twitchChatTitle, {
                      channel: primary.label || primaryLogin,
                    })}
                    className="absolute inset-0 h-full w-full"
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
