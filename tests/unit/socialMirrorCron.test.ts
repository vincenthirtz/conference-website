// Cron social-mirror : le payload `social.mirror` tel qu'il part vraiment.
// Target: pages/api/cron/social-mirror.ts
//
// Ce qui compte ici, et que les tests purs de `feedMirror.test.ts` ne voient
// pas :
//   - la vignette est lue dans `social_feed_items` APRÈS `persistFeedItems`, en
//     UNE requête par lot et par source ;
//   - un post émis sans ligne stockée (au-delà des 3 nouveautés recopiées par
//     passage) tombe en repli au lieu d'échouer : l'originale pour
//     Bluesky/YouTube, rien pour TikTok/Instagram ;
//   - l'URL émise est nettoyée.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

vi.mock('@/utils/botEvents', () => ({
  emitBotEvent: vi.fn(async () => ({ delivered: true })),
}));
vi.mock('@/utils/integrationSecrets', () => ({
  getIntegrationSecret: vi.fn(async () => 'womenscup.bsky.social'),
}));
vi.mock('@/utils/social/blueskyMirror', () => ({
  fetchAuthorFeed: vi.fn(async () => []),
}));
vi.mock('@/utils/social/youtubeMirror', () => ({
  YOUTUBE_CHANNEL_KEY: 'youtube_channel_id',
  fetchChannelVideos: vi.fn(async () => []),
}));
vi.mock('@/utils/social/instagramMirror', () => ({
  readInstagramForMirror: vi.fn(async () => null),
}));
vi.mock('@/utils/social/tiktokMirror', () => ({
  fetchOwnVideos: vi.fn(async () => null),
}));
vi.mock('@/utils/social/socialFeed', () => ({
  persistFeedItems: vi.fn(async () => 0),
}));

import {
  store,
  fromCalls,
  resetSupabaseMock,
} from './__helpers__/supabaseMock';
import { emitBotEvent } from '@/utils/botEvents';
import { fetchAuthorFeed } from '@/utils/social/blueskyMirror';
import { fetchChannelVideos } from '@/utils/social/youtubeMirror';
import { fetchOwnVideos } from '@/utils/social/tiktokMirror';
import { persistFeedItems } from '@/utils/social/socialFeed';
import handler from '../../pages/api/cron/social-mirror';
import type { MirrorPost } from '../../utils/social/feedMirror';

const TENANT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CHANNEL = '1486719313116401755';
const HOSTED = 'https://storage.example.test/teams-images/social/tt-1.jpg';

/** Il y a `minutes` minutes : dans la fenêtre du premier passage (24 h). */
function ago(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function run() {
  const req = {
    method: 'POST',
    headers: { authorization: 'Bearer cron-secret' },
    query: { tenant: TENANT },
  } as unknown as NextApiRequest;
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    setHeader: vi.fn(),
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  return handler(req, res as unknown as NextApiResponse).then(() => res);
}

/** Les `data` émis, par source. */
function emitted(source: string): Array<Record<string, unknown>> {
  return (emitBotEvent as unknown as ReturnType<typeof vi.fn>).mock.calls
    .filter(
      ([name, data]) => name === 'social.mirror' && data.source === source
    )
    .map(([, data]) => data as Record<string, unknown>);
}

const tiktokPosts: MirrorPost[] = [
  {
    id: 'tt-1',
    url: 'https://www.tiktok.com/@ow_womenscup/video/1?utm_campaign=tt4d_open_api&utm_source=abc',
    text: 'Best of POTG #owwc',
    publishedAt: ago(30),
    thumbnailUrl: 'https://p16-sign.tiktokcdn.test/1.jpg?x-expires=1',
  },
  {
    // Au-delà des 3 recopies du passage : aucune ligne en base.
    id: 'tt-2',
    url: 'https://www.tiktok.com/@ow_womenscup/video/2?utm_campaign=tt4d_open_api',
    text: 'Résumé',
    publishedAt: ago(20),
    thumbnailUrl: 'https://p16-sign.tiktokcdn.test/2.jpg?x-expires=1',
  },
];

const youtubePosts: MirrorPost[] = [
  {
    id: 'yt-1',
    url: 'https://www.youtube.com/watch?v=yt-1',
    text: 'Finale',
    title: 'Finale',
    description: 'Le replay complet.',
    publishedAt: ago(10),
    thumbnailUrl: 'https://i.ytimg.com/vi/yt-1/hqdefault.jpg',
  },
];

beforeEach(() => {
  resetSupabaseMock();
  vi.clearAllMocks();
  process.env.CRON_SECRET = 'cron-secret';
  store.site_settings = [
    { tenant_id: TENANT, key: 'bluesky_mirror_channel_id', value: CHANNEL },
    { tenant_id: TENANT, key: 'youtube_channel_id', value: 'UCxyz' },
  ];
  vi.mocked(fetchOwnVideos).mockResolvedValue(tiktokPosts);
  vi.mocked(fetchChannelVideos).mockResolvedValue(youtubePosts);
  vi.mocked(fetchAuthorFeed).mockResolvedValue([]);
  // Ce que `persistFeedItems` aurait écrit : la copie de la vignette du
  // premier TikTok, et une ligne YouTube dont la recopie a échoué.
  vi.mocked(persistFeedItems).mockImplementation(async (tenant, source) => {
    if (source === 'tiktok')
      (store.social_feed_items ||= []).push({
        tenant_id: tenant,
        source: 'tiktok',
        external_id: 'tt-1',
        thumbnail_url: HOSTED,
      });
    if (source === 'youtube')
      (store.social_feed_items ||= []).push({
        tenant_id: tenant,
        source: 'youtube',
        external_id: 'yt-1',
        thumbnail_url: null,
      });
    return 1;
  });
});

describe('cron social-mirror — payload `social.mirror`', () => {
  it('prend la vignette HÉBERGÉE, et rien pour un TikTok sans copie', async () => {
    const res = await run();
    expect(res.statusCode).toBe(200);

    const [first, second] = emitted('tiktok');
    expect(first.thumbnailUrl).toBe(HOSTED);
    // Pas de ligne → pas de repli sur la couverture signée (6 h de vie).
    expect(second.thumbnailUrl).toBeNull();
  });

  it('YouTube sans copie retombe sur la vignette d’origine, stable', async () => {
    await run();
    const [video] = emitted('youtube');
    expect(video).toMatchObject({
      title: 'Finale',
      text: 'Le replay complet.',
      thumbnailUrl: 'https://i.ytimg.com/vi/yt-1/hqdefault.jpg',
      content:
        '📺 Nouvelle vidéo — Finale\n\nhttps://www.youtube.com/watch?v=yt-1',
    });
  });

  it('émet l’URL nettoyée, dans `url` comme dans `content`', async () => {
    await run();
    const [first] = emitted('tiktok');
    expect(first).toMatchObject({
      source: 'tiktok',
      channelId: CHANNEL,
      url: 'https://www.tiktok.com/@ow_womenscup/video/1',
      content:
        '🎵 TikTok — Best of POTG #owwc\n\nhttps://www.tiktok.com/@ow_womenscup/video/1',
      text: 'Best of POTG #owwc',
      title: null,
      account: {
        handle: '@ow_womenscup',
        url: 'https://www.tiktok.com/@ow_womenscup',
      },
    });
  });

  it('lit les vignettes en UNE requête par lot', async () => {
    // L'ordre (lecture APRÈS `persistFeedItems`) est prouvé par le premier
    // test : la ligne hébergée n'existe qu'une fois l'écriture passée.
    await run();
    // Bluesky : aucune nouveauté → aucune lecture. TikTok (deux posts) et
    // YouTube : une chacun.
    expect(fromCalls.filter((t) => t === 'social_feed_items')).toHaveLength(2);
  });

  it('n’interroge pas la table quand aucun salon n’est configuré', async () => {
    store.site_settings = [
      { tenant_id: TENANT, key: 'youtube_channel_id', value: 'UCxyz' },
    ];
    await run();
    expect(emitBotEvent).not.toHaveBeenCalled();
    expect(fromCalls.filter((t) => t === 'social_feed_items')).toHaveLength(0);
    // Le mur du site, lui, est toujours alimenté.
    expect(persistFeedItems).toHaveBeenCalled();
  });

  it('ne renvoie pas une publication déjà présente dans l’outbox', async () => {
    // Garde d'idempotence (incident du 2026-09-12) : même si le curseur laisse
    // repasser une publication, elle ne repart pas dans le salon. L'URL
    // comparée est celle qui part vraiment, donc NETTOYÉE de ses `utm_*`.
    store.bot_event_outbox = [
      {
        tenant_id: TENANT,
        event_name: 'social.mirror',
        created_at: new Date().toISOString(),
        payload: {
          data: { url: 'https://www.tiktok.com/@ow_womenscup/video/1' },
        },
      },
    ];

    await run();

    const urls = emitted('tiktok').map((d) => d.url);
    expect(urls).not.toContain('https://www.tiktok.com/@ow_womenscup/video/1');
    expect(urls).toEqual(['https://www.tiktok.com/@ow_womenscup/video/2']);
  });

  it('avance quand même le curseur sur une publication déjà émise', async () => {
    // C'est ce qui RÉPARE un curseur resté en arrière : sans cet avancement, la
    // même publication serait réexaminée à chaque passage, indéfiniment.
    store.bot_event_outbox = [
      {
        tenant_id: TENANT,
        event_name: 'social.mirror',
        created_at: new Date().toISOString(),
        payload: {
          data: { url: 'https://www.tiktok.com/@ow_womenscup/video/2' },
        },
      },
    ];

    await run();

    const cursor = (store.site_settings || []).find(
      (r) => r.key === 'tiktok_mirror_last_video_at'
    );
    // tt-2 est la plus récente des deux : le curseur doit la dépasser, alors
    // même qu'elle n'a pas été réémise.
    expect(cursor?.value).toBe(tiktokPosts[1].publishedAt);
  });
});
