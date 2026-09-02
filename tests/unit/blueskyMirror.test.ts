// Miroir Bluesky → Discord (utils/social/blueskyMirror.ts).
//
// Ce qui compte ici :
//   - ne recopier QUE nos posts : ni reposts, ni réponses. Un repost recopié
//     remplirait le salon de contenus qui ne sont pas de nous ;
//   - l'ordre. L'API rend le plus récent en premier, un salon se lit dans
//     l'autre sens : sans tri, trois posts d'un coup arrivent à l'envers ;
//   - le curseur strict. Un `>=` reposterait indéfiniment le dernier post à
//     chaque passage du cron, toutes les quinze minutes.

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  buildMirrorMessage,
  parseFeed,
  postUrl,
  selectNew,
  MAX_PER_RUN,
} from '../../utils/social/blueskyMirror';

const HANDLE = 'womenscup.bsky.social';

function post(
  rkey: string,
  createdAt: string,
  extra: Record<string, unknown> = {}
) {
  return {
    post: {
      uri: `at://did:plc:abc/app.bsky.feed.post/${rkey}`,
      author: { handle: HANDLE },
      record: { text: `post ${rkey}`, createdAt },
      ...extra,
    },
  };
}

describe('postUrl', () => {
  it('transforme une at:// en lien bsky.app', () => {
    expect(postUrl('at://did:plc:abc/app.bsky.feed.post/3kxyz', HANDLE)).toBe(
      `https://bsky.app/profile/${HANDLE}/post/3kxyz`
    );
  });
});

describe('parseFeed', () => {
  it('garde nos posts', () => {
    const out = parseFeed(
      { feed: [post('a', '2026-09-02T10:00:00Z')] },
      HANDLE
    );
    expect(out).toHaveLength(1);
    expect(out[0].url).toContain('/post/a');
    expect(out[0].text).toBe('post a');
  });

  it('écarte les reposts', () => {
    const item = { ...post('a', '2026-09-02T10:00:00Z'), reason: { by: {} } };
    expect(parseFeed({ feed: [item] }, HANDLE)).toHaveLength(0);
  });

  it('écarte les réponses, même si l’API en laissait passer', () => {
    const item = post('a', '2026-09-02T10:00:00Z');
    (item.post.record as Record<string, unknown>).reply = { parent: {} };
    expect(parseFeed({ feed: [item] }, HANDLE)).toHaveLength(0);
  });

  it('récupère l’image quand il y en a une', () => {
    const item = post('a', '2026-09-02T10:00:00Z', {
      embed: { images: [{ fullsize: 'https://cdn.test/a.jpg' }] },
    });
    expect(parseFeed({ feed: [item] }, HANDLE)[0].imageUrl).toBe(
      'https://cdn.test/a.jpg'
    );
  });

  it('ne casse pas sur une réponse vide ou malformée', () => {
    expect(parseFeed(null, HANDLE)).toEqual([]);
    expect(parseFeed({}, HANDLE)).toEqual([]);
    expect(parseFeed({ feed: [{}] }, HANDLE)).toEqual([]);
  });
});

describe('selectNew', () => {
  const feed = parseFeed(
    {
      feed: [
        post('c', '2026-09-02T12:00:00Z'),
        post('b', '2026-09-02T11:00:00Z'),
        post('a', '2026-09-02T10:00:00Z'),
      ],
    },
    HANDLE
  );

  it('ne garde que ce qui est postérieur au curseur', () => {
    const out = selectNew(feed, new Date('2026-09-02T10:30:00Z'));
    expect(out.map((p) => p.text)).toEqual(['post b', 'post c']);
  });

  it('rend du plus ancien au plus récent — un salon se lit dans ce sens', () => {
    const out = selectNew(feed, new Date('2026-09-01T00:00:00Z'));
    expect(out.map((p) => p.text)).toEqual(['post a', 'post b', 'post c']);
  });

  it('est STRICT : le post du curseur n’est pas repris', () => {
    // Sinon le cron reposterait le dernier post toutes les quinze minutes.
    const out = selectNew(feed, new Date('2026-09-02T12:00:00Z'));
    expect(out).toEqual([]);
  });

  it('plafonne le nombre de posts d’un même passage', () => {
    const many = parseFeed(
      {
        feed: Array.from({ length: 12 }, (_, i) =>
          post(`p${i}`, `2026-09-02T${String(10 + i).padStart(2, '0')}:00:00Z`)
        ),
      },
      HANDLE
    );
    const out = selectNew(many, new Date('2026-09-01T00:00:00Z'));
    expect(out).toHaveLength(MAX_PER_RUN);
    // On garde les PLUS RÉCENTS : en cas de rattrapage, mieux vaut l'actualité
    // que le début d'un historique.
    expect(out[out.length - 1].text).toBe('post p11');
  });

  it('ignore une date illisible plutôt que de tout republier', () => {
    const bad = parseFeed({ feed: [post('x', 'pas-une-date')] }, HANDLE);
    expect(selectNew(bad, new Date('2026-09-01T00:00:00Z'))).toEqual([]);
  });
});

describe('buildMirrorMessage', () => {
  it('met le lien en dernier, sur sa propre ligne, pour l’aperçu Discord', () => {
    const [p] = parseFeed({ feed: [post('a', '2026-09-02T10:00:00Z')] }, HANDLE);
    expect(buildMirrorMessage(p)).toBe(`post a\n\n${p.url}`);
  });

  it('un post sans texte se réduit à son lien', () => {
    const item = post('a', '2026-09-02T10:00:00Z');
    item.post.record.text = '';
    const [p] = parseFeed({ feed: [item] }, HANDLE);
    expect(buildMirrorMessage(p)).toBe(p.url);
  });
});
