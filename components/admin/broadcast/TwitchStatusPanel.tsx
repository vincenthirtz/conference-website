// components/admin/broadcast/TwitchStatusPanel.tsx
// Widget LECTURE SEULE pour la console régie live (pages/admin/broadcast/live).
// Objectif : le régisseur PRÉVISUALISE en direct le flux Twitch du tenant
// (aperçu vidéo embarqué) + voit le statut live / nombre de spectateurs, sans
// quitter la console.
//
// Contrats consommés (aucune écriture) :
//  - GET /api/admin/diffusion/twitch-channels → { items } : chaînes ACTIVES de
//    l'espace du staff, lecture seule, ouverte au rôle caster (la route
//    d'édition exigeait manage_broadcast et masquait le panneau aux casteuses).
//  - GET /api/twitch/live?channels=a,b → { statuses: { <chan>: { live, title?,
//    viewer_count? } } } ; 503 si TWITCH_CLIENT_ID/SECRET absents.
//
// Embed : iframe player.twitch.tv muté, en réutilisant EXACTEMENT le mécanisme
// des composants publics (useTwitchLive / LiveTwitchSection) — le paramètre
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
//
// Passe « Le Ruban » (lot 10C) : carte d'encre, statut de chaîne en Chip — une
// chaîne à l'antenne prend le ton `live` (la lueur), hors ligne reste neutre.

import { useEffect, useMemo, useState } from 'react';
import { useActiveTwitchChannels } from '@/features/admin/diffusion/hooks/useBroadcastCards';
import type { TwitchChannelRow } from '@/features/admin/diffusion/liveClient';
import { useTwitchLiveStatuses } from '@/hooks/useTwitchLiveStatuses';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminBroadcastLive from '@/lib/i18n/locales/admin-fr/adminBroadcastLive';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import { rubanCard, rubanEyebrow } from '@/features/admin/_shared/ui/ruban';

const EMPTY_CHANNELS: TwitchChannelRow[] = [];

export default function TwitchStatusPanel() {
  const t = useAdminT(nsAdminBroadcastLive);
  // 1) Chaînes actives de l'espace (une seule fois), par la route LECTURE
  //    SEULE de la diffusion : la route d'édition exigeait manage_broadcast,
  //    et le panneau se masquait pour les casteuses, celles qui sont à
  //    l'antenne. En cas d'échec : « aucune chaîne » (masqué), jamais de crash.
  // channels === null : chargement en cours. [] : aucune chaîne active (masqué).
  const channelsQuery = useActiveTwitchChannels();
  const channels: TwitchChannelRow[] | null = channelsQuery.isError
    ? EMPTY_CHANNELS
    : channelsQuery.data
      ? (channelsQuery.data.items ?? EMPTY_CHANNELS)
      : null;
  // `parent` du player Twitch : indisponible côté SSR, récupéré après hydratation
  // (comme LiveTwitchSection). Sans lui, Twitch refuse l'embed.
  const [parent, setParent] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') setParent(window.location.hostname);
  }, []);

  const activeChannels = useMemo(
    () => (channels ?? []).filter((c) => c.channel),
    [channels]
  );

  // 2) Statuts live : le hook partagé (60 s onglet visible, relecture au
  //    retour, 503 = « non configuré », erreur = dernier statut conservé).
  const { statuses, notConfigured } = useTwitchLiveStatuses(
    activeChannels.map((c) => c.channel)
  );

  // Chargement initial des chaînes : ligne discrète (pas d'écran blanc).
  if (channels === null) {
    return (
      <div className={`${rubanCard} px-5 py-4 mb-6`}>
        <div className={`${rubanEyebrow} mb-2`}>{t.twitchHeading}</div>
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
  // CSP : proxy.ts frame-src autorise player.twitch.tv ET www.twitch.tv.
  const chatSrc = parent
    ? `https://www.twitch.tv/embed/${encodeURIComponent(
        primaryLogin
      )}/chat?parent=${encodeURIComponent(parent)}&darkpopout`
    : null;

  return (
    <div className={`${rubanCard} px-5 py-4 mb-6`}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className={rubanEyebrow}>{t.twitchHeading}</div>
        <AdminButton
          variant="ghost"
          size="xs"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
        >
          {collapsed ? t.twitchExpand : t.twitchCollapse}
        </AdminButton>
      </div>

      {notConfigured ? (
        <div className="text-xs text-neutral-500 italic">
          {t.twitchNotConfigured}
        </div>
      ) : (
        <>
          {/* Statut compact par chaîne active (info utile au-dessus du player). */}
          {/* La LISTE n'est plus une région live : elle était relue à chaque
              sondage (60 s), audience comprise. Seul le passage en direct ou
              hors ligne, ci-dessous, est annoncé. */}
          <ul aria-label={t.twitchHeading} className="space-y-1.5 mb-3">
            {activeChannels.map((c) => {
              const login = c.channel.trim().toLowerCase();
              const st = statuses[login];
              const live = !!st?.live;
              return (
                <li key={login} className="flex items-center gap-3 text-sm">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                      live
                        ? 'bg-[var(--lf,#7fca65)] animate-pulse shadow-[var(--glow-live)]'
                        : 'bg-[var(--t4,#807984)]'
                    }`}
                    aria-hidden
                  />
                  <span className="font-semibold text-[var(--t1,#f4edf7)] shrink-0">
                    {c.label || login}
                  </span>
                  <span aria-live="polite" className="shrink-0 text-xs">
                    {live ? (
                      <Chip tone="live">{t.twitchLive}</Chip>
                    ) : (
                      <Chip>{t.twitchOffline}</Chip>
                    )}
                  </span>
                  {live && (
                    <>
                      {st?.title && (
                        <span className="min-w-0 truncate text-xs text-neutral-400">
                          {st.title}
                        </span>
                      )}
                      {typeof st?.viewer_count === 'number' && (
                        <span
                          className="ml-auto shrink-0 whitespace-nowrap font-mono text-xs text-[var(--t2,#c7bfca)]"
                          data-numeric
                        >
                          {format(t.twitchViewers, {
                            count: st.viewer_count.toLocaleString(),
                          })}
                        </span>
                      )}
                    </>
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
              <div className="relative w-full aspect-video overflow-hidden rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-black lg:aspect-auto lg:h-[380px] lg:flex-1 lg:max-w-2xl">
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
                <div className="relative w-full h-[320px] overflow-hidden rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-black lg:h-[380px] lg:w-[340px] lg:shrink-0">
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
