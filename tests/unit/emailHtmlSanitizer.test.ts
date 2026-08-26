// tests/unit/emailHtmlSanitizer.test.ts
//
// Le sanitizer est la seule barrière entre le HTML libre saisi par le staff et
// deux surfaces sensibles : la preview admin (iframe, même origine) et les
// boîtes mail des destinataires. Les assertions ci-dessous vérifient donc
// surtout le NÉGATIF — ce qui ne doit PAS ressortir — en plus du contenu
// légitime qui doit survivre intact.

import { describe, it, expect } from 'vitest';
import {
  sanitizeEmailHtml,
  emailHtmlToPlainText,
} from '../../utils/emailHtmlSanitizer';

describe('sanitizeEmailHtml — contenu légitime préservé', () => {
  it('garde la mise en forme, les listes et les tableaux', () => {
    const html = sanitizeEmailHtml(
      '<h1 style="color:#fff">Titre</h1><p>Un <strong>mot</strong> en gras.</p>' +
        '<ul><li>Point</li></ul>' +
        '<table role="presentation" cellpadding="0"><tr><td width="50%">Cellule</td></tr></table>'
    );
    expect(html).toContain('<h1 style="color:#fff">Titre</h1>');
    expect(html).toContain('<strong>mot</strong>');
    expect(html).toContain('<li>Point</li>');
    expect(html).toContain('cellpadding="0"');
    expect(html).toContain('width="50%"');
  });

  it('garde une image https avec ses dimensions', () => {
    const html = sanitizeEmailHtml(
      '<img src="https://owwomenscup.fr/img/logos/pogtv.png" alt="POGTV" width="120" height="120" />'
    );
    expect(html).toContain('src="https://owwomenscup.fr/img/logos/pogtv.png"');
    expect(html).toContain('alt="POGTV"');
    expect(html).toContain('width="120"');
  });

  it('renvoie une chaîne vide pour une entrée vide ou non-texte', () => {
    expect(sanitizeEmailHtml('')).toBe('');
    expect(sanitizeEmailHtml('   ')).toBe('');
    expect(sanitizeEmailHtml(undefined as unknown as string)).toBe('');
  });
});

describe('sanitizeEmailHtml — code exécutable retiré', () => {
  it('supprime <script> avec son contenu', () => {
    const html = sanitizeEmailHtml(
      '<p>Avant</p><script>alert(1)</script><p>Après</p>'
    );
    expect(html).not.toContain('script');
    expect(html).not.toContain('alert(1)');
    expect(html).toContain('Avant');
    expect(html).toContain('Après');
  });

  it('supprime les gestionnaires d’événements sans jeter la balise', () => {
    const html = sanitizeEmailHtml(
      '<p onclick="steal()" onmouseover="x()">Texte</p>'
    );
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('onmouseover');
    expect(html).toContain('Texte');
  });

  it('supprime img onerror — le vecteur XSS le plus courant', () => {
    const html = sanitizeEmailHtml(
      '<img src="https://x.test/a.png" onerror="alert(1)" />'
    );
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('alert(1)');
  });

  it('supprime iframe, form, input, object et style', () => {
    const html = sanitizeEmailHtml(
      '<iframe src="https://evil.test"></iframe>' +
        '<form action="https://evil.test"><input name="pwd" /></form>' +
        '<object data="x"></object><style>body{display:none}</style><p>ok</p>'
    );
    expect(html).not.toContain('iframe');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('<input');
    expect(html).not.toContain('object');
    expect(html).not.toContain('<style');
    expect(html).toContain('ok');
  });

  it('déballe une balise inconnue en gardant son texte', () => {
    const html = sanitizeEmailHtml('<marquee>Défile</marquee>');
    expect(html).not.toContain('marquee');
    expect(html).toContain('Défile');
  });
});

describe('sanitizeEmailHtml — URLs', () => {
  it('déballe un lien javascript: en gardant le libellé', () => {
    const html = sanitizeEmailHtml(
      '<a href="javascript:alert(1)">Clique ici</a>'
    );
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<a');
    expect(html).toContain('Clique ici');
  });

  it('conserve http, https et mailto et force target/rel', () => {
    const html = sanitizeEmailHtml(
      '<a href="https://owwomenscup.fr">Site</a><a href="mailto:a@b.fr">Mail</a>'
    );
    expect(html).toContain('href="https://owwomenscup.fr"');
    expect(html).toContain('href="mailto:a@b.fr"');
    expect(html.match(/rel="noopener noreferrer"/g)).toHaveLength(2);
    expect(html.match(/target="_blank"/g)).toHaveLength(2);
  });

  it('absolutise les chemins relatifs — inutilisables dans une boîte mail', () => {
    const html = sanitizeEmailHtml(
      '<a href="/team/create">Inscrire</a><img src="/img/logos/pogtv.png" alt="" />',
      'https://owwomenscup.fr'
    );
    expect(html).toContain('href="https://owwomenscup.fr/team/create"');
    expect(html).toContain('src="https://owwomenscup.fr/img/logos/pogtv.png"');
  });

  it('supprime une image dont le src n’est ni https ni data:image', () => {
    const html = sanitizeEmailHtml(
      '<img src="http://insecure.test/a.png" /><img src="data:image/svg+xml,<svg/onload=alert(1)>" />'
    );
    expect(html).not.toContain('<img');
  });

  it('accepte une image inline data:image/png', () => {
    const html = sanitizeEmailHtml(
      '<img src="data:image/png;base64,iVBORw0KGgo=" alt="pixel" />'
    );
    expect(html).toContain('data:image/png;base64');
  });

  it('ajoute un alt vide quand il manque — sinon le lecteur d’écran lit l’URL', () => {
    const html = sanitizeEmailHtml('<img src="https://x.test/a.png" />');
    expect(html).toContain('alt=""');
  });
});

describe('sanitizeEmailHtml — attribut style', () => {
  it('rejette un style porteur d’expression() ou de javascript:', () => {
    const html = sanitizeEmailHtml(
      '<p style="width:expression(alert(1))">a</p>' +
        '<p style="background:url(javascript:alert(1))">b</p>'
    );
    expect(html).not.toContain('expression(');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('a');
    expect(html).toContain('b');
  });

  it('rejette position:fixed — recouvrement de l’interface dans la preview', () => {
    const html = sanitizeEmailHtml(
      '<div style="position:fixed;top:0">overlay</div>'
    );
    expect(html).not.toContain('position:fixed');
    expect(html).toContain('overlay');
  });

  it('garde un style de mise en forme ordinaire', () => {
    const html = sanitizeEmailHtml(
      '<p style="color:#C6BED9;font-size:15px;line-height:1.6">texte</p>'
    );
    expect(html).toContain('color:#C6BED9');
  });
});

describe('emailHtmlToPlainText', () => {
  it('extrait le texte et normalise les espaces', () => {
    expect(
      emailHtmlToPlainText('<h1>Titre</h1>\n\n<p>Un   <b>mot</b>.</p>')
    ).toBe('Titre Un mot.');
  });

  it('ignore le contenu des balises supprimées', () => {
    expect(emailHtmlToPlainText('<script>secret()</script><p>visible</p>')).toBe(
      'visible'
    );
  });

  it('tronque au-delà de la longueur demandée', () => {
    const out = emailHtmlToPlainText(`<p>${'a'.repeat(500)}</p>`, 20);
    expect(out).toHaveLength(20);
    expect(out.endsWith('…')).toBe(true);
  });
});
