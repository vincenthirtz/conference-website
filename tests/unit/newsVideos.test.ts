// tests/unit/newsVideos.test.ts
//
// Les vidéos YouTube lues dans le texte d'une actualité (utils/news/newsVideos.ts),
// posées en lecteur sous l'article. Cas réel : « Scrim caritatif du 17 mai »
// citait sa vidéo en fin de phrase, et la page n'en montrait que le lien.

import { describe, expect, it } from 'vitest';
import { extractNewsVideoIds, MAX_NEWS_VIDEOS } from '@/utils/news/newsVideos';

describe('extractNewsVideoIds', () => {
  it('trouve la vidéo citée en fin de phrase', () => {
    expect(
      extractNewsVideoIds(
        'Revoir le scrim en vidéo : https://www.youtube.com/watch?v=DGN4olmhb2Q'
      )
    ).toEqual(['DGN4olmhb2Q']);
  });

  it('accepte youtu.be, shorts, un lien Markdown et la ponctuation collée', () => {
    expect(
      extractNewsVideoIds(
        [
          'Court : https://youtu.be/aaaaaaaaaaa.',
          'Short : https://youtube.com/shorts/bbbbbbbbbbb,',
          'Lien : [la vidéo](https://www.youtube.com/watch?v=ccccccccccc&t=42)',
        ].join('\n')
      )
    ).toEqual(['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc']);
  });

  it('ignore les autres liens, Twitch compris, et les doublons', () => {
    expect(
      extractNewsVideoIds(
        'https://twitch.tv/womens_cup https://owwomenscup.fr/news https://youtu.be/aaaaaaaaaaa https://www.youtube.com/watch?v=aaaaaaaaaaa'
      )
    ).toEqual(['aaaaaaaaaaa']);
  });

  it(`s'arrête à ${MAX_NEWS_VIDEOS} lecteurs`, () => {
    const links = ['a', 'b', 'c', 'd']
      .map((c) => `https://youtu.be/${c.repeat(11)}`)
      .join(' ');
    expect(extractNewsVideoIds(links)).toHaveLength(MAX_NEWS_VIDEOS);
  });

  it('rien sans texte, ni pour un identifiant mal formé', () => {
    expect(extractNewsVideoIds(null)).toEqual([]);
    expect(extractNewsVideoIds('')).toEqual([]);
    expect(extractNewsVideoIds('https://youtu.be/court')).toEqual([]);
  });
});
