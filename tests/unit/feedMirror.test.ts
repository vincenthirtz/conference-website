// Miroirs « nos comptes → un salon Discord » : socle commun, Bluesky, YouTube.
//
// Ce qui compte ici :
//   - le curseur STRICT. Un `>=` reposterait indéfiniment la dernière
//     publication, toutes les quinze minutes ;
//   - l'ordre. Les deux flux rendent le plus récent en premier, un salon se lit
//     dans l'autre sens ;
//   - ne recopier QUE nos contenus : ni reposts, ni réponses ;
//   - `published` et non `updated` côté YouTube : corriger une faute dans un
//     titre ne doit pas republier une vidéo de l'an dernier.

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
    const item = { ...bskyItem('a', '2026-09-02T10:00:00Z'), reason: { by: {} } };
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
      expect(decodeEntities('a &amp; b &#39;c&#39; &lt;d&gt; &quot;e&quot;')).toBe(
        `a & b 'c' <d> "e"`
      );
    });

    it('décode `&amp;` en dernier, sans double décodage', () => {
      // Le texte d'origine disait littéralement « &lt; ».
      expect(decodeEntities('&amp;lt;')).toBe('&lt;');
    });
  });
});
