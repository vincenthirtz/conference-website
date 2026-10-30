// Redirections et Cache-Control du Worker Cloudflare (cloudflare/responses.ts).
import { describe, expect, it } from 'vitest';
import {
  BROWSER_REVALIDATE,
  browserCacheControl,
  canonicalRedirect,
  selfImageRewrite,
} from '../../cloudflare/responses';

const redirect = (u: string) => canonicalRedirect(new URL(u));

describe('selfImageRewrite', () => {
  const image = (src: string) =>
    `https://owwomenscup.fr/_next/image?url=${encodeURIComponent(src)}&w=64&q=75`;
  const rewrite = (u: string) => selfImageRewrite(new URL(u));

  it('ramène une image de notre domaine à son chemin, le reste intact', () => {
    const out = rewrite(
      image('https://owwomenscup.fr/img/logos/2026-logo.png')
    );
    expect(out).toBe(
      `https://owwomenscup.fr/_next/image?url=${encodeURIComponent('/img/logos/2026-logo.png')}&w=64&q=75`
    );
    expect(
      new URL(
        rewrite(image('https://www.owwomenscup.fr/a.png?v=2')) as string
      ).searchParams.get('url')
    ).toBe('/a.png?v=2');
  });

  it('ne touche pas au reste', () => {
    // Déjà relatif, autre hôte, http, autre chemin, sans paramètre.
    expect(rewrite(image('/img/logos/2026-logo.png'))).toBeNull();
    expect(rewrite(image('https://media.owwomenscup.fr/a.png'))).toBeNull();
    expect(rewrite(image('https://example.com/a.png'))).toBeNull();
    expect(rewrite(image('http://owwomenscup.fr/a.png'))).toBeNull();
    expect(
      rewrite('https://owwomenscup.fr/img?url=https://owwomenscup.fr/a.png')
    ).toBeNull();
    expect(rewrite('https://owwomenscup.fr/_next/image?w=64')).toBeNull();
  });

  it('ne fabrique jamais une adresse externe ni un autre port', () => {
    expect(
      rewrite(image('https://owwomenscup.fr//evil.example/a.png'))
    ).toBeNull();
    expect(
      rewrite(image('https://owwomenscup.fr/\\evil.example/a.png'))
    ).toBeNull();
    expect(rewrite(image('https://owwomenscup.fr:8443/a.png'))).toBeNull();
    expect(
      rewrite(image('https://owwomenscup.fr.evil.example/a.png'))
    ).toBeNull();
  });
});

describe('canonicalRedirect', () => {
  it('www → domaine nu en https, chemin et paramètres gardés', () => {
    expect(redirect('https://www.owwomenscup.fr/tcg?x=1&y=2')).toBe(
      'https://owwomenscup.fr/tcg?x=1&y=2'
    );
    expect(redirect('http://www.owwomenscup.fr/')).toBe(
      'https://owwomenscup.fr/'
    );
  });

  it('http → https sur le domaine nu', () => {
    expect(redirect('http://owwomenscup.fr/tournament/a')).toBe(
      'https://owwomenscup.fr/tournament/a'
    );
  });

  it('laisse passer le domaine nu en https', () => {
    expect(redirect('https://owwomenscup.fr/tcg?x=1')).toBeNull();
  });

  it('ne touche ni workers.dev ni wrangler dev', () => {
    expect(redirect('https://owwomenscup.owwomenscup.workers.dev/')).toBeNull();
    expect(redirect('http://localhost:8787/')).toBeNull();
    expect(redirect('http://autre.owwomenscup.fr/')).toBeNull();
  });
});

describe('browserCacheControl', () => {
  it('page ISR : toujours redemander, comme Netlify', () => {
    expect(
      browserCacheControl('s-maxage=1231, stale-while-revalidate=2592000')
    ).toBe(BROWSER_REVALIDATE);
    expect(
      browserCacheControl('s-maxage=1, stale-while-revalidate=2592000')
    ).toBe(BROWSER_REVALIDATE);
    expect(
      browserCacheControl(
        'public, max-age=0, s-maxage=31536000, must-revalidate'
      )
    ).toBe(BROWSER_REVALIDATE);
  });

  it('garde les réponses privées et celles sans cache partagé', () => {
    expect(
      browserCacheControl(
        'private, no-cache, no-store, max-age=0, must-revalidate'
      )
    ).toBeNull();
    expect(
      browserCacheControl('public, max-age=31536000, immutable')
    ).toBeNull();
    expect(browserCacheControl(null)).toBeNull();
    expect(browserCacheControl('')).toBeNull();
  });
});
