// Miroirs « nos comptes → un salon Discord » : socle commun, Bluesky, YouTube,
// Instagram, TikTok.
//
// Ce qui compte ici :
//   - le curseur STRICT. Un `>=` reposterait indéfiniment la dernière
//     publication, toutes les quinze minutes ;
//   - l'ordre. Les deux flux rendent le plus récent en premier, un salon se lit
//     dans l'autre sens ;
//   - ne recopier QUE nos contenus : ni reposts, ni réponses ;
//   - `published` et non `updated` côté YouTube : corriger une faute dans un
//     titre ne doit pas republier une vidéo de l'an dernier ;
//   - la date Instagram, dont le décalage arrive sans deux-points : illisible,
//     elle ferait écarter TOUTES les publications, en silence ;
//   - la date TikTok, qui est un epoch EN SECONDES : lue en millisecondes,
//     chaque vidéo daterait de 1970 et le miroir resterait muet.

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  buildMirrorMessage,
  selectNew,
  MAX_PER_RUN,
  type MirrorPost,
} from '../../utils/social/feedMirror';
import { parseFeed, postUrl } from '../../utils/social/blueskyMirror';
import {
  decodeEntities,
  parseYoutubeFeed,
} from '../../utils/social/youtubeMirror';
import {
  MAX_CAPTION,
  normalizeTimestamp,
  parseMedia,
  truncateCaption,
} from '../../utils/social/instagramMirror';
import {
  parseVideos,
  timestampFromCreateTime,
} from '../../utils/social/tiktokMirror';

const HANDLE = 'womenscup.bsky.social';

function bskyItem(rkey: string, createdAt: string, extra = {}) {
  return {
    post: {
      uri: `at://did:plc:abc/app.bsky.feed.post/${rkey}`,
      author: { handle: HANDLE },
      record: { text: `post ${rkey}`, createdAt },
      ...extra,
    },
  };
}

function mk(id: string, publishedAt: string): MirrorPost {
  return { id, url: `https://x.test/${id}`, text: id, publishedAt };
}

/* -------------------------------------------------------------------------- */

describe('selectNew — commun aux sources', () => {
  const posts = [
    mk('c', '2026-09-02T12:00:00Z'),
    mk('b', '2026-09-02T11:00:00Z'),
    mk('a', '2026-09-02T10:00:00Z'),
  ];

  it('ne garde que ce qui est postérieur au curseur', () => {
    const out = selectNew(posts, new Date('2026-09-02T10:30:00Z'));
    expect(out.map((p) => p.id)).toEqual(['b', 'c']);
  });

  it('rend du plus ancien au plus récent', () => {
    const out = selectNew(posts, new Date('2026-09-01T00:00:00Z'));
    expect(out.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('est STRICT : la publication du curseur n’est pas reprise', () => {
    // Sinon le cron la reposterait tous les quarts d'heure, indéfiniment.
    expect(selectNew(posts, new Date('2026-09-02T12:00:00Z'))).toEqual([]);
  });

  it('plafonne un passage et garde les plus récentes', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      mk(`p${i}`, `2026-09-02T${String(10 + i).padStart(2, '0')}:00:00Z`)
    );
    const out = selectNew(many, new Date('2026-09-01T00:00:00Z'));
    expect(out).toHaveLength(MAX_PER_RUN);
    expect(out[out.length - 1].id).toBe('p11');
  });

  it('ignore une date illisible plutôt que de tout republier', () => {
    expect(selectNew([mk('x', 'pas-une-date')], new Date(0))).toEqual([]);
  });
});

describe('buildMirrorMessage', () => {
  it('met le lien en dernier, sur sa propre ligne, pour l’aperçu Discord', () => {
    expect(buildMirrorMessage(mk('a', '2026-09-02T10:00:00Z'))).toBe(
      'a\n\nhttps://x.test/a'
    );
  });

  it('préfixe la source quand on le demande', () => {
    expect(
      buildMirrorMessage(mk('a', '2026-09-02T10:00:00Z'), '📺 Nouvelle vidéo —')
    ).toBe('📺 Nouvelle vidéo — a\n\nhttps://x.test/a');
  });

  it('une publication sans texte se réduit à son lien', () => {
    const p = { ...mk('a', '2026-09-02T10:00:00Z'), text: '' };
    expect(buildMirrorMessage(p)).toBe('https://x.test/a');
  });
});

/* -------------------------------------------------------------------------- */

describe('Bluesky', () => {
  it('transforme une at:// en lien bsky.app', () => {
    expect(postUrl('at://did:plc:abc/app.bsky.feed.post/3kxyz', HANDLE)).toBe(
      `https://bsky.app/profile/${HANDLE}/post/3kxyz`
    );
  });

  it('garde nos posts', () => {
    const out = parseFeed(
      { feed: [bskyItem('a', '2026-09-02T10:00:00Z')] },
      HANDLE
    );
    expect(out).toHaveLength(1);
    expect(out[0].url).toContain('/post/a');
  });

  it('écarte les reposts', () => {
    const item = {
      ...bskyItem('a', '2026-09-02T10:00:00Z'),
      reason: { by: {} },
    };
    expect(parseFeed({ feed: [item] }, HANDLE)).toHaveLength(0);
  });

  it('écarte les réponses, même si l’API en laissait passer', () => {
    const item = bskyItem('a', '2026-09-02T10:00:00Z');
    (item.post.record as Record<string, unknown>).reply = { parent: {} };
    expect(parseFeed({ feed: [item] }, HANDLE)).toHaveLength(0);
  });

  it('ne casse pas sur une réponse vide ou malformée', () => {
    expect(parseFeed(null, HANDLE)).toEqual([]);
    expect(parseFeed({ feed: [{}] }, HANDLE)).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */

describe('YouTube', () => {
  const feed = `<?xml version="1.0"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015">
  <title>OW WOMEN'S CUP</title>
  <entry>
    <yt:videoId>DGN4olmhb2Q</yt:videoId>
    <title>Finale &amp; remise des prix</title>
    <published>2026-05-19T09:11:50+00:00</published>
    <updated>2026-08-01T10:00:00+00:00</updated>
  </entry>
  <entry>
    <yt:videoId>3j6w7CjXne8</yt:videoId>
    <title>BEST OF POTG</title>
    <published>2025-12-19T16:36:50+00:00</published>
  </entry>
</feed>`;

  it('lit identifiant, titre et date de mise en ligne', () => {
    const out = parseYoutubeFeed(feed);
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe('DGN4olmhb2Q');
    expect(out[0].url).toBe('https://www.youtube.com/watch?v=DGN4olmhb2Q');
    expect(out[0].publishedAt).toBe('2026-05-19T09:11:50+00:00');
  });

  it('se fie à `published`, pas à `updated`', () => {
    // Corriger une faute dans un titre met `updated` à jour : s'y fier
    // republierait une vidéo de l'an dernier.
    expect(parseYoutubeFeed(feed)[0].publishedAt).not.toBe(
      '2026-08-01T10:00:00+00:00'
    );
  });

  it('décode les entités des titres', () => {
    expect(parseYoutubeFeed(feed)[0].text).toBe('Finale & remise des prix');
  });

  it('écarte une entrée sans date — elle paraîtrait éternellement nouvelle', () => {
    const bad = `<feed><entry><yt:videoId>x</yt:videoId><title>T</title></entry></feed>`;
    expect(parseYoutubeFeed(bad)).toEqual([]);
  });

  it('rend un flux vide sur une entrée sans identifiant', () => {
    const bad = `<feed><entry><title>T</title><published>2026-01-01T00:00:00Z</published></entry></feed>`;
    expect(parseYoutubeFeed(bad)).toEqual([]);
  });

  describe('decodeEntities', () => {
    it('décode les entités nommées et numériques', () => {
      expect(
        decodeEntities('a &amp; b &#39;c&#39; &lt;d&gt; &quot;e&quot;')
      ).toBe(`a & b 'c' <d> "e"`);
    });

    it('décode `&amp;` en dernier, sans double décodage', () => {
      // Le texte d'origine disait littéralement « &lt; ».
      expect(decodeEntities('&amp;lt;')).toBe('&lt;');
    });
  });
});

/* -------------------------------------------------------------------------- */

describe('Instagram', () => {
  const media = {
    data: [
      {
        id: '17900000000000000',
        caption: 'Finale ce soir 🔥 #owwc',
        permalink: 'https://www.instagram.com/reel/DAbCdEfGhIj/',
        timestamp: '2026-09-02T12:00:00+0000',
      },
      {
        id: '17900000000000001',
        caption: null,
        permalink: 'https://www.instagram.com/p/DAbCdEfGhIk/',
        timestamp: '2026-09-01T09:30:00+0000',
      },
    ],
  };

  it('lit identifiant, légende, permalien et date', () => {
    const out = parseMedia(media);
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe('17900000000000000');
    expect(out[0].url).toBe('https://www.instagram.com/reel/DAbCdEfGhIj/');
    expect(out[0].text).toBe('Finale ce soir 🔥 #owwc');
  });

  it('rend une date que `selectNew` sait lire', () => {
    // Instagram écrit `+0000` sans deux-points. Une date illisible ferait
    // écarter la publication — miroir muet, sans la moindre erreur.
    const out = parseMedia(media);
    expect(out[0].publishedAt).toBe('2026-09-02T12:00:00+00:00');
    expect(selectNew(out, new Date('2026-09-01T00:00:00Z'))).toHaveLength(2);
  });

  it('accepte une publication sans légende', () => {
    // Une image seule se réduit à son lien, comme chez les autres sources.
    const out = parseMedia(media);
    expect(out[1].text).toBe('');
    expect(buildMirrorMessage(out[1])).toBe(
      'https://www.instagram.com/p/DAbCdEfGhIk/'
    );
  });

  it('écarte une entrée sans permalien ou sans date', () => {
    expect(
      parseMedia({
        data: [
          { id: 'a', caption: 'x', timestamp: '2026-09-02T12:00:00+0000' },
          { id: 'b', caption: 'x', permalink: 'https://instagram.test/p/b/' },
        ],
      })
    ).toEqual([]);
  });

  it('ne casse pas sur une réponse vide ou malformée', () => {
    expect(parseMedia(null)).toEqual([]);
    expect(parseMedia({})).toEqual([]);
    expect(parseMedia({ data: [{}] })).toEqual([]);
  });

  describe('truncateCaption', () => {
    it('laisse une légende courte intacte', () => {
      expect(truncateCaption('court')).toBe('court');
    });

    it('coupe une légende trop longue — sinon Discord emporterait le lien', () => {
      // 2 200 caractères possibles côté Instagram, 2 000 max côté Discord : le
      // handler du bot tronque par la FIN, c'est-à-dire sur l'URL.
      const long = 'mot '.repeat(500);
      const out = truncateCaption(long);
      expect(out.length).toBeLessThanOrEqual(MAX_CAPTION + 1);
      expect(out.endsWith('…')).toBe(true);
    });

    it('recule jusqu’à l’espace le plus proche pour ne pas couper un mot', () => {
      const out = truncateCaption(`${'a'.repeat(20)} ${'b'.repeat(20)}`, 24);
      expect(out).toBe(`${'a'.repeat(20)}…`);
    });

    it('ne recule pas jusqu’à un espace lointain — ce serait perdre un paragraphe', () => {
      const out = truncateCaption(`${'a'.repeat(10)} ${'b'.repeat(20)}`, 25);
      expect(out).toBe(`${'a'.repeat(10)} ${'b'.repeat(14)}…`);
    });
  });

  describe('normalizeTimestamp', () => {
    it('insère les deux-points du décalage', () => {
      expect(normalizeTimestamp('2026-09-02T12:00:00+0000')).toBe(
        '2026-09-02T12:00:00+00:00'
      );
      expect(normalizeTimestamp('2026-09-02T12:00:00-0500')).toBe(
        '2026-09-02T12:00:00-05:00'
      );
    });

    it('laisse une date déjà normalisée tranquille', () => {
      expect(normalizeTimestamp('2026-09-02T12:00:00Z')).toBe(
        '2026-09-02T12:00:00Z'
      );
      expect(normalizeTimestamp('2026-09-02T12:00:00+00:00')).toBe(
        '2026-09-02T12:00:00+00:00'
      );
    });
  });
});

/* -------------------------------------------------------------------------- */

describe('TikTok', () => {
  const listing = {
    data: {
      videos: [
        {
          id: '7300000000000000000',
          title: '',
          video_description: 'Best of POTG #owwc',
          create_time: 1789000000,
          share_url:
            'https://www.tiktok.com/@ow_womenscup/video/7300000000000000000',
        },
        {
          id: '7300000000000000001',
          title: 'Résumé de la finale',
          video_description: '',
          create_time: 1788000000,
          share_url:
            'https://www.tiktok.com/@ow_womenscup/video/7300000000000000001',
        },
      ],
      cursor: 1788000000,
      has_more: false,
    },
  };

  it('lit identifiant, légende, lien de partage et date', () => {
    const out = parseVideos(listing);
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe('7300000000000000000');
    expect(out[0].url).toContain('/video/7300000000000000000');
    expect(out[0].text).toBe('Best of POTG #owwc');
  });

  it('retombe sur le titre quand la description est vide', () => {
    // Sur TikTok, la légende affichée est `video_description` ; le titre est
    // souvent vide. On prend donc l'une, puis l'autre.
    expect(parseVideos(listing)[1].text).toBe('Résumé de la finale');
  });

  it('lit `create_time` en SECONDES', () => {
    // En millisecondes, la vidéo daterait de 1970 : antérieure à tout curseur,
    // elle ne serait jamais recopiée — et sans la moindre erreur.
    const out = parseVideos(listing);
    expect(out[0].publishedAt).toBe(new Date(1789000000 * 1000).toISOString());
    expect(new Date(out[0].publishedAt).getUTCFullYear()).toBeGreaterThan(2020);
  });

  it('écarte une vidéo sans lien de partage ou sans date', () => {
    expect(
      parseVideos({
        data: {
          videos: [
            { id: 'a', video_description: 'x', create_time: 1789000000 },
            { id: 'b', video_description: 'x', share_url: 'https://tt.test/b' },
          ],
        },
      })
    ).toEqual([]);
  });

  it('ne casse pas sur une réponse vide ou malformée', () => {
    expect(parseVideos(null)).toEqual([]);
    expect(parseVideos({})).toEqual([]);
    expect(parseVideos({ data: {} })).toEqual([]);
    expect(parseVideos({ data: { videos: [{}] } })).toEqual([]);
  });

  describe('timestampFromCreateTime', () => {
    it('convertit un epoch en secondes', () => {
      expect(timestampFromCreateTime(1789000000)).toBe(
        new Date(1789000000 * 1000).toISOString()
      );
    });

    it('refuse ce qui n’est pas une date exploitable', () => {
      expect(timestampFromCreateTime(0)).toBeNull();
      expect(timestampFromCreateTime(-1)).toBeNull();
      expect(timestampFromCreateTime(undefined)).toBeNull();
      expect(timestampFromCreateTime('pas-un-nombre')).toBeNull();
    });
  });
});
