// Playlist YouTube « Reviews » d'un tournoi : extraction/validation de l'ID,
// lecture du flux RSS (parsing + statuts), politique de cache ISR.

import { describe, it, expect, vi } from 'vitest';
import {
  extractPlaylistId,
  isValidPlaylistId,
  nocookieEmbedUrl,
  playlistPageUrl,
} from '../../utils/youtube/playlist';
import {
  fetchPlaylistVideos,
  parsePlaylistFeed,
  reviewsRevalidateSeconds,
  REVIEWS_REVALIDATE_FAILURE_S,
  REVIEWS_REVALIDATE_OK_S,
} from '../../utils/youtube/playlistFeed';

const PL = 'PLBu9E8qChrHcAbCdEfGhIjKlMnOpQrStU'; // 34 caractères

describe('extractPlaylistId', () => {
  it('accepte un ID nu', () => {
    expect(extractPlaylistId(PL)).toBe(PL);
    expect(extractPlaylistId(`  ${PL}  `)).toBe(PL);
  });

  it('extrait de toutes les formes d’URL YouTube', () => {
    for (const url of [
      `https://www.youtube.com/playlist?list=${PL}`,
      `https://youtube.com/playlist?list=${PL}&si=abc`,
      `https://m.youtube.com/playlist?list=${PL}`,
      `https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=${PL}&index=2`,
      `https://youtu.be/dQw4w9WgXcQ?list=${PL}`,
      `youtube.com/playlist?list=${PL}`,
    ]) {
      expect(extractPlaylistId(url), url).toBe(PL);
    }
  });

  it('refuse les autres sites, les URL sans list= et les ID mal formés', () => {
    for (const bad of [
      `https://evil.example/playlist?list=${PL}`,
      `https://www.youtube.com.evil.example/playlist?list=${PL}`,
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      `javascript:alert(1)//?list=${PL}`,
      'PL<script>',
      'short',
      'PLBu9E8qC', // 9 caractères : sous la borne
      'a'.repeat(65),
      '',
      '   ',
      null,
      42,
    ]) {
      expect(extractPlaylistId(bad as unknown), String(bad)).toBeNull();
    }
  });

  it('accepte l’ID tronqué fourni (13 car.) comme ID valide — c’est YouTube qui tranchera', () => {
    // Le format est respecté : la validation ne peut pas savoir qu'il manque
    // des caractères. Le flux renverra 404 → état « playlist introuvable ».
    expect(isValidPlaylistId('PLBu9E8qChrHc')).toBe(true);
  });

  it('construit des URL encodées', () => {
    expect(playlistPageUrl(PL)).toBe(
      `https://www.youtube.com/playlist?list=${PL}`
    );
    expect(nocookieEmbedUrl('dQw4w9WgXcQ')).toMatch(
      /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/
    );
  });
});

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <title>Reviews</title>
 <entry>
  <id>yt:video:dQw4w9WgXcQ</id>
  <yt:videoId>dQw4w9WgXcQ</yt:videoId>
  <title>Review &amp; analyse : Team A vs Team B</title>
  <published>2026-09-20T18:00:00+00:00</published>
 </entry>
 <entry>
  <yt:videoId>bad id!</yt:videoId>
  <title>ID invalide</title>
  <published>2026-09-21T18:00:00+00:00</published>
 </entry>
 <entry>
  <yt:videoId>abcdefghijk</yt:videoId>
  <title>Sans date</title>
 </entry>
</feed>`;

describe('parsePlaylistFeed', () => {
  it('rend id, titre décodé, miniature et date ; écarte les entrées douteuses', () => {
    expect(parsePlaylistFeed(FEED)).toEqual([
      {
        id: 'dQw4w9WgXcQ',
        title: 'Review & analyse : Team A vs Team B',
        thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        publishedAt: '2026-09-20T18:00:00+00:00',
      },
    ]);
  });

  it('flux sans entrée → liste vide', () => {
    expect(parsePlaylistFeed('<feed></feed>')).toEqual([]);
  });
});

function fakeFetch(status: number, body = ''): typeof fetch {
  return vi.fn(async () => new Response(body, { status })) as never;
}

describe('fetchPlaylistVideos', () => {
  it('appelle le flux de la playlist et parse la réponse', async () => {
    const f = fakeFetch(200, FEED);
    const res = await fetchPlaylistVideos(PL, f);
    expect(res).toMatchObject({ status: 'ok' });
    expect(res.status === 'ok' && res.videos).toHaveLength(1);
    expect(
      (f as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]
    ).toBe(`https://www.youtube.com/feeds/videos.xml?playlist_id=${PL}`);
  });

  it('404 → not_found (playlist privée, supprimée ou ID tronqué)', async () => {
    expect(await fetchPlaylistVideos(PL, fakeFetch(404))).toEqual({
      status: 'not_found',
    });
  });

  it('5xx, HTML inattendu ou exception → error', async () => {
    expect(await fetchPlaylistVideos(PL, fakeFetch(500))).toEqual({
      status: 'error',
    });
    expect(
      await fetchPlaylistVideos(PL, fakeFetch(200, '<html>consent</html>'))
    ).toEqual({ status: 'error' });
    const boom = vi.fn(async () => {
      throw new Error('network');
    }) as never;
    expect(await fetchPlaylistVideos(PL, boom)).toEqual({ status: 'error' });
  });

  it('ID invalide → not_found sans requête réseau', async () => {
    const f = fakeFetch(200, FEED);
    expect(await fetchPlaylistVideos('../etc', f)).toEqual({
      status: 'not_found',
    });
    expect(f).not.toHaveBeenCalled();
  });
});

describe('cache ISR de la page Reviews', () => {
  it('1 h quand la lecture a réussi, 5 min après un échec', () => {
    expect(reviewsRevalidateSeconds('ok')).toBe(REVIEWS_REVALIDATE_OK_S);
    expect(REVIEWS_REVALIDATE_OK_S).toBe(3600);
    expect(reviewsRevalidateSeconds('error')).toBe(
      REVIEWS_REVALIDATE_FAILURE_S
    );
    expect(reviewsRevalidateSeconds('not_found')).toBe(300);
  });
});
