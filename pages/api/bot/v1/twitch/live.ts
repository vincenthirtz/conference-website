// GET /api/bot/v1/twitch/live
//
// Wrapper bot : combine la liste des channels Twitch enregistres dans
// twitch_channels (is_active=true) + le statut live courant depuis l'API
// Helix. Le bot recoit directement ce qui est en live, pret a afficher
// dans /lives — pas besoin de poll l'API Twitch lui-meme.
//
// Query :
//   - includeOffline : '1' ou 'true' pour renvoyer aussi les offline
//                      (defaut : seulement les live)
//   - channels       : logins Twitch separes par des virgules. Interroge CES
//                      chaines au lieu de la table (cf. plus bas).
//
// POURQUOI `channels` EXISTE. Notre propre chaine n'est PAS dans
// `twitch_channels` : cette table alimente les listes publiques des chaines
// partenaires (/association, /live), et s'y ajouter nous ferait figurer parmi
// nos propres ambassadrices. Le bot doit pourtant savoir quand elle passe en
// direct, pour l'annoncer dans son salon a lui. Il demande donc explicitement
// ce login — Helix reste appele ici, jamais par le bot.
//
// Cache HTTP : 60s (le statut live change peu en sub-minute).

import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import {
  fetchTwitchLiveStatus,
  fetchTwitchProfileImages,
} from '@/utils/twitch';
import { logger } from '@/utils/logger';

type ChannelRow = {
  channel: string;
  label: string | null;
  badge: string | null;
  description: string | null;
  background_url: string | null;
};

/** Au-dela, ce n'est plus « une chaine precise » mais un scan — Helix paie. */
const MAX_EXPLICIT_CHANNELS = 20;

/**
 * Logins demandes explicitement, ou `null` si le parametre est absent.
 *
 * Un tableau VIDE est une reponse legitime (« tu as demande des chaines, mais
 * aucune n'est un login valide ») et se distingue de `null` (« tu n'as rien
 * demande, lis la table »).
 */
export function parseChannelsParam(
  raw: string | string[] | undefined
): string[] | null {
  if (raw === undefined) return null;
  const seen = new Set<string>();
  for (const part of (Array.isArray(raw) ? raw : [raw]).flatMap((v) =>
    String(v).split(',')
  )) {
    const login = part.trim().toLowerCase();
    // Login Twitch : lettres, chiffres et `_`, 25 caracteres au plus. Filtrer
    // ici plutot que de laisser Helix trancher — une chaine fantaisiste ne doit
    // pas partir sur le reseau.
    if (/^[a-z0-9_]{1,25}$/.test(login)) seen.add(login);
    if (seen.size >= MAX_EXPLICIT_CHANNELS) break;
  }
  return [...seen];
}

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const includeOffline =
    req.query.includeOffline === '1' || req.query.includeOffline === 'true';

  const explicit = parseChannelsParam(req.query.channels as string | undefined);

  let channels: ChannelRow[];
  if (explicit) {
    // Demande explicite : pas de table, donc pas d'habillage (label, badge,
    // description) — l'appelant sait deja de quelle chaine il parle.
    channels = explicit.map((channel) => ({
      channel,
      label: null,
      badge: null,
      description: null,
      background_url: null,
    }));
  } else {
    const { data: channelsData, error } = await supabaseAdmin
      .from('twitch_channels')
      .select('channel, label, badge, description, background_url')
      .eq('tenant_id', req.botContext.tenantId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    if (error) {
      logger.error('[bot/twitch/live] channels error', error);
      return res
        .status(500)
        .json({ error: 'Erreur de chargement des channels' });
    }
    channels = (channelsData ?? []) as ChannelRow[];
  }

  if (channels.length === 0) {
    return res.status(200).json({ channels: [], total: 0, liveCount: 0 });
  }

  const statuses = await fetchTwitchLiveStatus(channels.map((c) => c.channel));
  if (statuses === null) {
    // Twitch mal configure (env vars manquantes) -> on degrade gracefully :
    // on renvoie la liste sans statut live plutot que de 500. Le bot saura
    // qu'aucun live n'est detecte (live: false partout).
    const fallback = channels.map((c) => ({
      channel: c.channel,
      label: c.label,
      badge: c.badge,
      description: c.description,
      backgroundUrl: c.background_url,
      live: false as const,
      profileImageUrl: null,
    }));
    return res
      .status(200)
      .json({ channels: fallback, total: fallback.length, liveCount: 0 });
  }

  // Avatars : appel Helix distinct, et UNIQUEMENT pour les chaînes en live —
  // c'est le seul cas où l'image sert (annonce Discord). Inutile de payer un
  // second appel pour des chaînes hors ligne. Best-effort : une map vide fait
  // simplement une annonce sans vignette.
  const liveLogins = channels
    .map((c) => c.channel)
    .filter((ch) => statuses[ch.toLowerCase()]?.live);
  const avatars =
    liveLogins.length > 0 ? await fetchTwitchProfileImages(liveLogins) : {};

  const enriched = channels.map((c) => {
    const status = statuses[c.channel.toLowerCase()] ?? { live: false };
    return {
      channel: c.channel,
      label: c.label,
      badge: c.badge,
      description: c.description,
      backgroundUrl: c.background_url,
      live: status.live,
      title: status.title ?? null,
      viewerCount: status.viewerCount ?? null,
      gameName: status.gameName ?? null,
      startedAt: status.startedAt ?? null,
      profileImageUrl: avatars[c.channel.toLowerCase()] ?? null,
    };
  });

  const filtered = includeOffline ? enriched : enriched.filter((c) => c.live);
  const liveCount = enriched.filter((c) => c.live).length;

  res.setHeader(
    'Cache-Control',
    'public, s-maxage=60, stale-while-revalidate=30'
  );
  return res.status(200).json({
    channels: filtered,
    total: enriched.length,
    liveCount,
  });
}

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 60, key: 'bot-twitch-live' },
});
