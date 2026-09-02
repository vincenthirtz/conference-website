// Hashtags d'un post multi-cibles (utils/social/hashtags.ts + facets Bluesky).
//
// Ce qui compte ici :
//   - la NORMALISATION, parce que trois orthographes d'un même tag font trois
//     audiences séparées dont aucune n'atteint la bonne taille ;
//   - le COMPTAGE : les tags s'ajoutent au texte AVANT la mesure, et sur les
//     300 graphèmes de Bluesky ils décident du passage ;
//   - les FACETS : un `#tag` sans facet n'est, sur Bluesky, qu'un texte — des
//     caractères dépensés pour aucune portée.

import { describe, it, expect } from 'vitest';

import {
  MAX_HASHTAGS,
  appendHashtags,
  normalizeHashtag,
  normalizeHashtags,
  parseHashtagInput,
} from '../../utils/social/hashtags';
import { detectTagFacets } from '../../utils/social/bluesky';
import { resolveTarget } from '../../utils/social/socialPosts';

describe('normalizeHashtag', () => {
  it('retire le croisillon, les accents et la casse', () => {
    expect(normalizeHashtag('#Overwatch')).toBe('overwatch');
    expect(normalizeHashtag('  #ESport-Féminin ')).toBe('esportfeminin');
    expect(normalizeHashtag('##double')).toBe('double');
  });

  it('refuse ce qu’aucune plateforme n’indexe', () => {
    expect(normalizeHashtag('#a')).toBeNull();
    expect(normalizeHashtag('#2026')).toBeNull();
    expect(normalizeHashtag('#')).toBeNull();
    expect(normalizeHashtag('#' + 'a'.repeat(61))).toBeNull();
  });
});

describe('normalizeHashtags', () => {
  it('dédoublonne les variantes d’un même tag', () => {
    expect(normalizeHashtags(['#Overwatch', 'overwatch', '#OVERWATCH'])).toEqual(
      ['overwatch']
    );
  });

  it('plafonne la liste', () => {
    const many = Array.from({ length: 50 }, (_, i) => `tag${'x'.repeat(i + 1)}`);
    expect(normalizeHashtags(many)).toHaveLength(MAX_HASHTAGS);
  });
});

describe('parseHashtagInput', () => {
  it('accepte espaces, virgules et points-virgules', () => {
    expect(parseHashtagInput('#ow, esport; #owwc')).toEqual([
      'ow',
      'esport',
      'owwc',
    ]);
  });
});

describe('appendHashtags', () => {
  it('ajoute les tags sur leur propre ligne', () => {
    expect(appendHashtags('On y est.', ['ow', 'owwc'])).toBe(
      'On y est.\n\n#ow #owwc'
    );
  });

  it('ne répète pas un tag déjà écrit dans le corps', () => {
    expect(appendHashtags('on lance le #OWWC', ['owwc'])).toBe(
      'on lance le #OWWC'
    );
  });

  it('sans tag, le texte est rendu tel quel', () => {
    expect(appendHashtags('Rien à ajouter.', [])).toBe('Rien à ajouter.');
  });
});

describe('resolveTarget — les tags comptent dans la limite', () => {
  it('Bluesky : un texte tout juste sous la limite passe au-dessus avec les tags', () => {
    // 290 caractères + « \n\n#overwatchleague » (20) = 310 > 300.
    const text = 'a'.repeat(290);
    const ok = resolveTarget({ text }, { platform: 'bluesky' });
    expect(ok.error).toBeNull();

    const over = resolveTarget(
      { text },
      { platform: 'bluesky', hashtags: ['#OverwatchLeague'] }
    );
    expect(over.error).toContain('300');
  });

  it('les tags sont ajoutés au texte envoyé, en forme canonique', () => {
    const out = resolveTarget(
      { text: 'Coup d’envoi ce soir.' },
      { platform: 'bluesky', hashtags: ['#Overwatch', 'ESport-Féminin'] }
    );
    expect(out.text).toBe('Coup d’envoi ce soir.\n\n#overwatch #esportfeminin');
    expect(out.hashtags).toEqual(['overwatch', 'esportfeminin']);
  });

  it('une destination sans hashtags les ignore au lieu de les coller', () => {
    // Sur Discord, `#quelquechose` désigne un salon : un tag y ferait un lien
    // mort. Sur le site, la table `news` a déjà sa colonne `tag`.
    for (const platform of ['site_news', 'discord_announce'] as const) {
      const out = resolveTarget(
        { text: 'Coup d’envoi.' },
        { platform, hashtags: ['#Overwatch'] }
      );
      expect(out.text).not.toContain('#overwatch');
      expect(out.hashtags).toEqual([]);
    }
  });
});

describe('detectTagFacets — Bluesky', () => {
  it('produit une facet par tag, avec la valeur sans croisillon', () => {
    const facets = detectTagFacets('Allez ! #owwc #esport');
    expect(facets).toHaveLength(2);
    expect(facets[0].features[0]).toEqual({
      $type: 'app.bsky.richtext.facet#tag',
      tag: 'owwc',
    });
  });

  it('compte les décalages en OCTETS, pas en unités JavaScript', () => {
    // « Éé » fait 2 caractères JS mais 4 octets UTF-8 : un index JS
    // soulignerait à côté du tag.
    const facets = detectTagFacets('Éé #ow');
    expect(facets[0].index.byteStart).toBe(5);
    expect(facets[0].index.byteEnd).toBe(8);
  });

  it('ignore un croisillon qui n’ouvre pas un tag', () => {
    expect(detectTagFacets('le langage C# est ancien')).toHaveLength(0);
    expect(detectTagFacets('numéro # 4')).toHaveLength(0);
  });
});
