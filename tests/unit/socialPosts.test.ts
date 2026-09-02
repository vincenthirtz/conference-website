// Tests du cœur « post multi-cibles » (utils/social/socialPosts.ts).
//
// Trois choses valent d'être verrouillées ici :
//   - la distinction entre « pas de surcharge » (hérite) et « surcharge vide »
//     (erreur) — un post parti vide est pire qu'un post refusé ;
//   - la déduplication de slug, parce que `news` porte un UNIQUE(tenant, slug)
//     que ni la route d'ingestion ni la route admin ne gèrent, et qu'un
//     composeur produit précisément des titres qui se répètent ;
//   - le statut agrégé `partial`, qui est l'état à partir duquel on rejoue une
//     seule cible au lieu de tout republier.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

const { emitBotEvent } = vi.hoisted(() => ({
  emitBotEvent: vi.fn(async () => ({ delivered: true, attempts: 1 })),
}));
vi.mock('@/utils/botEvents', () => ({ emitBotEvent }));

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';

import {
  aggregateStatus,
  deriveNewsTitle,
  publishTargets,
  resolveTarget,
  resolveTargets,
  uniqueNewsSlug,
} from '../../utils/social/socialPosts';
import { SOCIAL_PLATFORMS, socialPlatform } from '../../utils/social/platforms';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';

beforeEach(() => {
  resetSupabaseMock();
  emitBotEvent.mockClear();
});

describe('deriveNewsTitle', () => {
  it('prend la première ligne non vide', () => {
    expect(deriveNewsTitle('\n\nLe J7 bouge\nDétails en dessous')).toBe(
      'Le J7 bouge'
    );
  });

  it('retire le markdown de tête, comme le forwarder Discord', () => {
    expect(deriveNewsTitle('## Le J7 bouge')).toBe('Le J7 bouge');
    expect(deriveNewsTitle('**Le J7 bouge**')).toBe('Le J7 bouge');
  });

  it('borne un titre trop long', () => {
    const title = deriveNewsTitle('x'.repeat(300));
    expect(title.length).toBe(120);
    expect(title.endsWith('…')).toBe(true);
  });

  it('renvoie une chaîne vide sur un texte sans contenu', () => {
    expect(deriveNewsTitle('   \n  \n')).toBe('');
  });
});

describe('resolveTarget', () => {
  const base = { text: 'Texte commun', imageUrl: 'https://img.test/a.png' };

  it('hérite du texte de base quand la surcharge est absente', () => {
    const out = resolveTarget(base, { platform: 'discord_announce' });
    expect(out.text).toBe('Texte commun');
    expect(out.imageUrl).toBe('https://img.test/a.png');
    expect(out.error).toBeNull();
  });

  it('applique une surcharge explicite', () => {
    const out = resolveTarget(base, {
      platform: 'discord_announce',
      textOverride: 'Version Discord',
    });
    expect(out.text).toBe('Version Discord');
  });

  it('refuse une surcharge VIDE au lieu de retomber sur le texte de base', () => {
    const out = resolveTarget(base, {
      platform: 'discord_announce',
      textOverride: '   ',
    });
    expect(out.error).toMatch(/vide/);
  });

  it('signale un dépassement de longueur avec le nombre exact en trop', () => {
    const limit = socialPlatform('discord_announce')!.textLimit!;
    const out = resolveTarget(
      { text: 'x'.repeat(limit + 7) },
      { platform: 'discord_announce' }
    );
    expect(out.error).toMatch(/7 de trop/);
  });

  it('laisse passer un texte long sur le site, qui n’a pas de limite', () => {
    const out = resolveTarget(
      { text: 'x'.repeat(5000) },
      { platform: 'site_news' }
    );
    expect(out.error).toBeNull();
  });

  it('déduit un titre pour le site, et respecte celui qu’on donne', () => {
    const auto = resolveTarget(
      { text: 'Le J7 bouge\nsuite' },
      { platform: 'site_news' }
    );
    expect(auto.title).toBe('Le J7 bouge');

    const manual = resolveTarget(
      { text: 'Le J7 bouge\nsuite' },
      { platform: 'site_news', titleOverride: 'Calendrier mis à jour' }
    );
    expect(manual.title).toBe('Calendrier mis à jour');
  });

  it('ne pose pas de titre sur une cible qui n’en veut pas', () => {
    const out = resolveTarget(base, { platform: 'discord_announce' });
    expect(out.title).toBeNull();
  });

  it('rejette une destination inconnue plutôt que de l’ignorer', () => {
    const out = resolveTarget(base, {
      // Volontairement hors du type : c'est ce qu'un payload malformé enverrait.
      platform: 'myspace' as never,
    });
    expect(out.error).toMatch(/inconnue/);
  });
});

describe('resolveTargets', () => {
  it('rend les cibles dans l’ordre du catalogue, pas celui du payload', () => {
    const out = resolveTargets(
      { text: 'Texte' },
      [{ platform: 'discord_announce' }, { platform: 'site_news' }]
    );
    // On n'attend QUE les cibles demandées, mais dans l'ordre du catalogue.
    // Comparer au catalogue entier ferait échouer ce test à chaque cible
    // ajoutée, alors qu'il ne parle que de tri.
    const catalogue = SOCIAL_PLATFORMS.map((p) => p.key);
    const got = out.map((t) => t.platform);
    expect(got).toEqual(
      catalogue.filter((k) => k === 'site_news' || k === 'discord_announce')
    );
  });
});

describe('aggregateStatus', () => {
  it('done quand rien n’échoue', () => {
    expect(aggregateStatus(['sent', 'sent'])).toBe('done');
  });

  it('partial quand une cible passe et une autre échoue', () => {
    expect(aggregateStatus(['sent', 'failed'])).toBe('partial');
  });

  it('failed quand aucune ne passe', () => {
    expect(aggregateStatus(['failed', 'failed'])).toBe('failed');
  });
});

describe('uniqueNewsSlug', () => {
  it('garde le slug tel quel quand il est libre', async () => {
    expect(await uniqueNewsSlug(TENANT, 'Le J7 bouge')).toBe('le-j7-bouge');
  });

  it('suffixe quand le slug est déjà pris — sinon l’insert casse sur l’UNIQUE', async () => {
    store.news = [
      { id: 'n1', tenant_id: TENANT, slug: 'le-j7-bouge' },
      { id: 'n2', tenant_id: TENANT, slug: 'le-j7-bouge-2' },
    ];
    expect(await uniqueNewsSlug(TENANT, 'Le J7 bouge')).toBe('le-j7-bouge-3');
  });

  it('retombe sur un slug par défaut quand le titre ne donne rien', async () => {
    expect(await uniqueNewsSlug(TENANT, '???')).toBe('actualite');
  });
});

describe('publishTargets', () => {
  it('publie une actualité et émet news.published', async () => {
    const targets = resolveTargets({ text: 'Le J7 bouge\ndétails' }, [
      { platform: 'site_news' },
    ]);
    const [out] = await publishTargets(targets, {
      tenantId: TENANT,
      staffId: 'staff-1',
      postId: 'post-1',
    });

    expect(out.status).toBe('sent');
    expect(out.permalink).toBe('/news/le-j7-bouge');
    expect(store.news).toHaveLength(1);
    expect(store.news[0].status).toBe('published');
    expect(store.news[0].title).toBe('Le J7 bouge');
    // Le corps garde le texte ENTIER : amputer la première ligne parce qu'elle
    // a servi de titre tronquerait l'actualité dès qu'un titre est saisi.
    expect(store.news[0].content).toContain('détails');
    expect(emitBotEvent).toHaveBeenCalledWith(
      'news.published',
      expect.objectContaining({ source: 'social_post' }),
      TENANT
    );
  });

  it('pousse l’annonce Discord par event bot, jamais par webhook', async () => {
    const targets = resolveTargets({ text: 'Le J7 bouge' }, [
      { platform: 'discord_announce' },
    ]);
    const [out] = await publishTargets(targets, {
      tenantId: TENANT,
      staffId: 'staff-1',
      postId: 'post-1',
    });

    expect(out.status).toBe('sent');
    expect(emitBotEvent).toHaveBeenCalledWith(
      'social.post',
      expect.objectContaining({ postId: 'post-1', content: 'Le J7 bouge' }),
      TENANT
    );
  });

  it('une cible en erreur n’interrompt pas les suivantes', async () => {
    const limit = socialPlatform('discord_announce')!.textLimit!;
    const targets = resolveTargets({ text: 'x'.repeat(limit + 1) }, [
      { platform: 'site_news' },
      { platform: 'discord_announce' },
    ]);
    const outcomes = await publishTargets(targets, {
      tenantId: TENANT,
      staffId: null,
      postId: 'post-1',
    });

    const byPlatform = Object.fromEntries(
      outcomes.map((o) => [o.platform, o])
    );
    expect(byPlatform.site_news.status).toBe('sent');
    expect(byPlatform.discord_announce.status).toBe('failed');
    expect(
      aggregateStatus(outcomes.map((o) => o.status))
    ).toBe('partial');
  });
});
