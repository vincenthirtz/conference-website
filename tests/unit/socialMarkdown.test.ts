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
  discordMentionIds,
  renderForFlavour,
  stripDiscordMarkup,
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

/* -------------------------------------------------------------------------- */
/* Marques propres à Discord                                                   */
/* -------------------------------------------------------------------------- */

// Régression du 2 septembre 2026 : « informations de l'association » a été
// publiée sur le site avec `@everyone` en tête et trois `<@493476…>` bruts au
// milieu des phrases. Rien hors de Discord ne sait afficher ces marques.
describe('stripDiscordMarkup', () => {
  it('retire @everyone et @here', () => {
    expect(stripDiscordMarkup('@everyone \nLes infos')).toBe('Les infos');
    expect(stripDiscordMarkup('@here on y va')).toBe('on y va');
    // Une adresse e-mail ou un pseudo ne doit pas y passer.
    expect(stripDiscordMarkup('écrire à everyone@asso.fr')).toBe(
      'écrire à everyone@asso.fr'
    );
  });

  it('retire les mentions de personne, de rôle et de salon', () => {
    expect(stripDiscordMarkup('cédée à <@493476887977394176>.')).toBe('cédée à.');
    expect(stripDiscordMarkup('ping <@!123456789> ok')).toBe('ping ok');
    expect(stripDiscordMarkup('rôle <@&987654321> ok')).toBe('rôle ok');
    expect(stripDiscordMarkup('voir <#1430516361255321691> ok')).toBe(
      'voir ok'
    );
  });

  it('garde le nom des émojis personnalisés', () => {
    // Effacer l'émoji viderait une ligne qui n'est faite que de ça.
    expect(stripDiscordMarkup('bravo <:coeur:1234567890>')).toBe(
      'bravo :coeur:'
    );
    expect(stripDiscordMarkup('<a:danse:1234567890>')).toBe(':danse:');
  });

  it('rend un horodatage Discord lisible plutôt que de le perdre', () => {
    expect(stripDiscordMarkup('rendez-vous <t:1767225600:F>')).toBe(
      'rendez-vous 2026-01-01'
    );
  });

  it('ne touche pas à un texte sans marque Discord', () => {
    const src = '## Titre\n\nUn **texte** normal avec un [lien](https://x.fr).';
    expect(stripDiscordMarkup(src)).toBe(src);
  });
});

describe('renderForFlavour — adaptation au canal', () => {
  const source =
    '@everyone \n🚨 Les infos 🚨\n\nla présidence est cédée à <@493476887977394176>.';

  it('le site reçoit le texte débarrassé des marques Discord', () => {
    const out = renderForFlavour(source, 'markdown');
    expect(out).not.toContain('@everyone');
    expect(out).not.toContain('<@');
    expect(out).toContain('la présidence est cédée à');
  });

  it('Discord, lui, garde ses mentions — c’est chez lui qu’elles servent', () => {
    const out = renderForFlavour(source, 'discord');
    expect(out).toContain('@everyone');
    expect(out).toContain('<@493476887977394176>');
  });

  it('Instagram reçoit du texte brut ET sans marque Discord', () => {
    const out = renderForFlavour('@everyone **gras** <@123456789>', 'plain');
    expect(out).toBe('gras');
  });
});

describe('discordMentionIds', () => {
  it('liste les ids sans doublon, pour l’avertissement du panneau', () => {
    expect(
      discordMentionIds('<@111111111> et <@!222222222> puis <@111111111>')
    ).toEqual(['111111111', '222222222']);
  });

  it('ignore les rôles et les salons : seules les personnes ont un nom', () => {
    expect(discordMentionIds('<@&111111111> <#222222222>')).toEqual([]);
  });
});
