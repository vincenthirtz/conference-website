import { describe, it, expect } from 'vitest';
import { hasNoStream, resolveStreamUrl } from '@/utils/matches/streamUrl';

const CHANNEL = 'https://www.twitch.tv/womens_cup';
const PARTNER = 'https://www.twitch.tv/partenaire';

describe('resolveStreamUrl', () => {
  it("prend l'URL du match quand elle existe", () => {
    expect(
      resolveStreamUrl({ stream_url: PARTNER }, { default_stream_url: CHANNEL })
    ).toEqual({ url: PARTNER, source: 'match' });
  });

  it('hérite de la chaîne du tournoi sinon', () => {
    expect(
      resolveStreamUrl({ stream_url: null }, { default_stream_url: CHANNEL })
    ).toEqual({ url: CHANNEL, source: 'tournament' });
  });

  it('traite une chaîne vide ou blanche comme absente', () => {
    // Un formulaire écrit '' bien plus souvent que NULL ; sans ça, l'affichage
    // proposerait un lien « Voir le stream » qui ne mène nulle part.
    expect(
      resolveStreamUrl({ stream_url: '   ' }, { default_stream_url: CHANNEL })
    ).toEqual({ url: CHANNEL, source: 'tournament' });
    expect(
      resolveStreamUrl({ stream_url: '' }, { default_stream_url: '  ' })
    ).toEqual({ url: null, source: null });
  });

  it('rend null quand ni le match ni le tournoi ne diffusent', () => {
    expect(resolveStreamUrl({ stream_url: null }, null)).toEqual({
      url: null,
      source: null,
    });
    expect(resolveStreamUrl(null, undefined)).toEqual({
      url: null,
      source: null,
    });
  });
});

describe('hasNoStream', () => {
  it("n'alerte que sur un match sans aucune diffusion connue", () => {
    expect(
      hasNoStream({ stream_url: null }, { default_stream_url: CHANNEL })
    ).toBe(false);
    expect(hasNoStream({ stream_url: PARTNER }, null)).toBe(false);
    expect(
      hasNoStream({ stream_url: null }, { default_stream_url: null })
    ).toBe(true);
  });
});
