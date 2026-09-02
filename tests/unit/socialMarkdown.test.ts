// Dégradation du Markdown par destination (utils/social/markdown.ts).
//
// Le texte est écrit UNE fois et rendu sur trois surfaces qui n'acceptent pas
// la même chose. Ce qui compte ici :
//   - Instagram reçoit du texte brut. Une étoile qui survit, et la légende
//     publique affiche `**gras**` — visible de tous, corrigeable à la main
//     seulement.
//   - Discord garde son Markdown mais ne rend NI tableaux NI images : les
//     laisser passer donne une bouillie de barres verticales.
//   - Le compteur de caractères compte ce qui PART, pas ce qui est saisi.

import { describe, it, expect } from 'vitest';

import {
  renderForFlavour,
  stripMarkdown,
  toDiscordMarkdown,
} from '../../utils/social/markdown';
import { resolveTarget } from '../../utils/social/socialPosts';

describe('stripMarkdown', () => {
  it('retire gras, italique, barré et code', () => {
    expect(stripMarkdown('**gras** *ital* ~~barré~~ `code`')).toBe(
      'gras ital barré code'
    );
  });

  it('retire le gras-italique sans laisser d’étoile orpheline', () => {
    expect(stripMarkdown('***très fort***')).toBe('très fort');
  });

  it('retire les titres et les citations', () => {
    expect(stripMarkdown('## Titre\n> une citation')).toBe(
      'Titre\nune citation'
    );
  });

  it('aplati les listes, cases à cocher comprises', () => {
    expect(stripMarkdown('- un\n- deux\n- [ ] trois')).toBe('un\ndeux\ntrois');
  });

  it('garde le texte du lien et met l’URL entre parenthèses', () => {
    expect(stripMarkdown('[le calendrier](https://ow.fr/cal)')).toBe(
      'le calendrier (https://ow.fr/cal)'
    );
  });

  it('n’écrit pas deux fois une URL qui est son propre libellé', () => {
    expect(stripMarkdown('[https://ow.fr](https://ow.fr)')).toBe('https://ow.fr');
  });

  it('aplati un tableau en lignes lisibles', () => {
    const table = '| Équipe | Score |\n| --- | --- |\n| EMBERS | 3 |';
    expect(stripMarkdown(table)).toBe('Équipe · Score\nEMBERS · 3');
  });

  it('ne mange pas les underscores d’un identifiant', () => {
    // `nom_de_variable` n'est pas de l'italique : le retirer changerait le mot.
    expect(stripMarkdown('la clé nom_de_variable est là')).toBe(
      'la clé nom_de_variable est là'
    );
  });

  it('retire quand même l’italique par underscore entre espaces', () => {
    expect(stripMarkdown('un mot _en italique_ ici')).toBe(
      'un mot en italique ici'
    );
  });

  it('réduit les lignes vides en trop', () => {
    expect(stripMarkdown('a\n\n\n\nb')).toBe('a\n\nb');
  });
});

describe('toDiscordMarkdown', () => {
  it('laisse passer ce que Discord rend', () => {
    const md = '**gras** *ital* ~~barré~~ `code`\n> citation\n- puce';
    expect(toDiscordMarkdown(md)).toBe(md);
  });

  it('garde les liens masqués, que Discord sait rendre', () => {
    expect(toDiscordMarkdown('[le calendrier](https://ow.fr/cal)')).toBe(
      '[le calendrier](https://ow.fr/cal)'
    );
  });

  it('garde les titres jusqu’à ###', () => {
    expect(toDiscordMarkdown('### Titre')).toBe('### Titre');
  });

  it('déclasse les titres au-delà de ###, que Discord affiche en dièses', () => {
    expect(toDiscordMarkdown('#### Trop profond')).toBe('Trop profond');
  });

  it('aplati les tableaux, que Discord ne rend pas', () => {
    const table = '| Équipe | Score |\n| --- | --- |\n| EMBERS | 3 |';
    expect(toDiscordMarkdown(table)).toBe('Équipe · Score\nEMBERS · 3');
  });

  it('aplati les images, que Discord affiche en toutes lettres', () => {
    expect(toDiscordMarkdown('![visuel](https://ow.fr/a.png)')).toBe(
      'visuel (https://ow.fr/a.png)'
    );
  });

  it('ramène une case à cocher à une puce', () => {
    expect(toDiscordMarkdown('- [x] fait')).toBe('- fait');
  });
});

describe('renderForFlavour', () => {
  it('laisse le Markdown intact pour le site', () => {
    expect(renderForFlavour('**gras**', 'markdown')).toBe('**gras**');
  });
});

describe('le compteur compte ce qui part', () => {
  it('Instagram : la mise en forme est retirée avant validation', () => {
    const out = resolveTarget(
      { text: '**Le J7 bouge**', imageUrl: 'https://img.test/a.png' },
      { platform: 'instagram' }
    );
    expect(out.text).toBe('Le J7 bouge');
    expect(out.error).toBeNull();
  });

  it('Instagram : un texte refusé sur sa source passe une fois nettoyé', () => {
    // 2 200 caractères utiles + 4 d'étoiles = 2 204 en source, sous la limite
    // une fois le gras retiré. Compter la source refuserait ce post à tort.
    const body = 'x'.repeat(2200);
    const out = resolveTarget(
      { text: `**${body}**`, imageUrl: 'https://img.test/a.png' },
      { platform: 'instagram' }
    );
    expect(out.text.length).toBe(2200);
    expect(out.error).toBeNull();
  });

  it('Discord : le tableau est aplati avant d’être compté', () => {
    const out = resolveTarget(
      { text: '| a | b |\n| --- | --- |\n| 1 | 2 |' },
      { platform: 'discord_announce' }
    );
    expect(out.text).toBe('a · b\n1 · 2');
  });

  it('le titre d’actualité ne garde jamais de Markdown', () => {
    const out = resolveTarget(
      { text: '## **Le J7** bouge\nsuite' },
      { platform: 'site_news' }
    );
    expect(out.title).toBe('Le J7 bouge');
    // Le corps, lui, garde sa mise en forme : c'est la page qui la rend.
    expect(out.text).toContain('##');
  });
});
