import { describe, expect, it } from 'vitest';
import { SVG_MAX_BYTES, SVG_MIME, sanitizeSvg } from '../../utils/svgSanitize';

/** Raccourci : renvoie la source nettoyée, ou fait échouer le test. */
function clean(source: string): string {
  const result = sanitizeSvg(source);
  if (!result.ok) throw new Error(`refusé : ${result.reason}`);
  return result.svg;
}

describe('constantes', () => {
  it('expose le type MIME et un plafond de 512 Ko', () => {
    expect(SVG_MIME).toBe('image/svg+xml');
    expect(SVG_MAX_BYTES).toBe(512 * 1024);
  });
});

describe('sanitizeSvg — refus', () => {
  it('refuse une source vide', () => {
    expect(sanitizeSvg('')).toMatchObject({ ok: false });
    expect(sanitizeSvg('   ')).toMatchObject({ ok: false });
  });

  it('refuse un fichier qui n’est pas un SVG', () => {
    expect(sanitizeSvg('<html><body>hello</body></html>')).toMatchObject({
      ok: false,
    });
  });

  it('refuse les entités XML sans même parser (XXE / billion laughs)', () => {
    const bomb = `<?xml version="1.0"?>
      <!DOCTYPE svg [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;">]>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><title>&lol2;</title></svg>`;
    const result = sanitizeSvg(bomb);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/ENTITY/);
  });

  it('refuse un SVG sans viewBox ni dimensions (rendu 0×0)', () => {
    const result = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>'
    );
    expect(result.ok).toBe(false);
  });

  it('accepte width+height seuls, sans viewBox', () => {
    expect(
      clean(
        '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64"/></svg>'
      )
    ).toContain('<rect');
  });
});

describe('sanitizeSvg — code exécutable', () => {
  it('supprime <script>', () => {
    const out = clean(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(document.cookie)</script><rect width="10" height="10"/></svg>`
    );
    expect(out).not.toMatch(/script|alert/i);
    expect(out).toContain('<rect');
  });

  it('supprime les gestionnaires on* (onload, onclick, onmouseover)', () => {
    const out = clean(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="alert(1)"><rect width="10" height="10" onclick="alert(2)" onmouseover="alert(3)"/></svg>`
    );
    expect(out).not.toMatch(/onload|onclick|onmouseover|alert/i);
  });

  it('supprime <foreignObject> et son HTML', () => {
    const out = clean(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><foreignObject width="10" height="10"><iframe src="https://evil.test"/></foreignObject><circle r="4"/></svg>`
    );
    expect(out).not.toMatch(/foreignObject|iframe/i);
    expect(out).toContain('<circle');
  });

  it('supprime <a href="javascript:…"> et <animate>', () => {
    const out = clean(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><a xlink:href="javascript:alert(1)"><rect width="10" height="10"/></a><animate attributeName="href" values="javascript:alert(2)"/></svg>`
    );
    expect(out).not.toMatch(/javascript:|<a[\s>]|animate/i);
  });

  it('supprime les commentaires', () => {
    const out = clean(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><!-- Generator: Illustrator --><rect width="10" height="10"/></svg>`
    );
    expect(out).not.toContain('Illustrator');
  });
});

describe('sanitizeSvg — références externes', () => {
  it('supprime un href http(s) (mouchard au rendu)', () => {
    const out = clean(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><use href="https://evil.test/x.svg#a"/><rect width="10" height="10"/></svg>`
    );
    expect(out).not.toContain('evil.test');
  });

  it('garde un href de fragment interne (#gradient)', () => {
    const out = clean(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><use href="#g"/></svg>`
    );
    expect(out).toContain('href="#g"');
    expect(out).toContain('linearGradient');
  });

  it('supprime un bloc <style> qui importe ou charge de l’externe', () => {
    const out = clean(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><style>@import url("https://evil.test/x.css");</style><rect width="10" height="10"/></svg>`
    );
    expect(out).not.toMatch(/@import|evil\.test/i);
  });

  it('garde un bloc <style> inoffensif', () => {
    const out = clean(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><style>.a{fill:#b24be0}</style><rect class="a" width="10" height="10"/></svg>`
    );
    expect(out).toContain('.a{fill:#b24be0}');
  });

  it('supprime un attribut style qui pointe dehors, garde url(#…)', () => {
    const out = clean(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect style="fill:url(https://evil.test/a.png)" width="10" height="10"/><circle style="fill:url(#g)" r="2"/></svg>`
    );
    expect(out).not.toContain('evil.test');
    expect(out).toContain('fill:url(#g)');
  });
});

describe('sanitizeSvg — logo légitime', () => {
  const logo = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 120 40" width="120" height="40">
  <title>LVN EMBERS</title>
  <defs>
    <linearGradient id="grad" x1="0" y1="0" x2="1" y2="1" gradientUnits="objectBoundingBox">
      <stop offset="0" stop-color="#b24be0"/>
      <stop offset="1" stop-color="#7ddc6b"/>
    </linearGradient>
    <clipPath id="cut"><rect x="0" y="0" width="120" height="40" rx="6"/></clipPath>
  </defs>
  <g clip-path="url(#cut)" filter="url(#blur)">
    <path d="M0 0 H120 V40 H0 Z" fill="url(#grad)" fill-rule="evenodd"/>
    <text x="12" y="26" font-family="Inter" font-size="18" font-weight="700" fill="#fff">LVN</text>
  </g>
  <filter id="blur"><feGaussianBlur stdDeviation="0.4"/></filter>
</svg>`;

  it('traverse le nettoyage sans rien perdre d’utile', () => {
    const out = clean(logo);
    expect(out).toContain('viewBox="0 0 120 40"');
    expect(out).toContain('linearGradient');
    expect(out).toContain('stop-color="#b24be0"');
    expect(out).toContain('clipPath');
    expect(out).toContain('clip-path="url(#cut)"');
    expect(out).toContain('feGaussianBlur');
    expect(out).toContain('fill-rule="evenodd"');
    expect(out).toContain('font-weight="700"');
    expect(out).toContain('<text');
  });

  it('est idempotent (renettoyer ne change rien)', () => {
    const once = clean(logo);
    expect(clean(once)).toBe(once);
  });

  it('force le namespace SVG sur la racine', () => {
    const out = clean(
      '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>'
    );
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
  });
});
