// tests/unit/turbopackBootstrap.test.ts
//
// Next ≥ 16.4 : le script inline qui amorce Turbopack sort du HTML pour que
// la CSP à nonce reste stricte (utils/csp/turbopackBootstrap.ts,
// public/turbopack-bootstrap.js, pages/_document.tsx).
//   * le script que génère LA fonction de Next installée est reconnu : une
//     montée de version qui en change la forme casse ici, pas en prod ;
//   * une forme inconnue lève : le pré-rendu échoue au build ;
//   * le chargeur pousse dans la file exactement ce que poussait l'original ;
//   * l'élément rendu garde nonce et `defer`, et ne touche à rien d'autre ;
//   * l'empreinte suit le fichier, et _document utilise bien les sous-classes.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement, type ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { getTurbopackChunkGroupBootstrap } from 'next/dist/server/get-page-files';
import { htmlEscapeJsonString } from 'next/dist/shared/lib/htmlescape';
import {
  TURBOPACK_BOOTSTRAP_KEY,
  TURBOPACK_BOOTSTRAP_SRC,
  TURBOPACK_BOOTSTRAP_VERSION,
  externalizeTurbopackBootstrap,
  parseTurbopackBootstrap,
} from '@/utils/csp/turbopackBootstrap';

const ROOT = join(__dirname, '../..');
const read = (p: string) =>
  readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

// Forme des paramètres d'un chunk group ; une chaîne avec `</script>` et `&`
// vérifie au passage l'échappement HTML de Next.
const PARAMS: Record<string, object> = {
  '/_app': {
    otherChunks: ['static/chunks/0abc.js', 'static/chunks/1def.js'],
    runtimeModuleIds: [12, 34],
  },
  '/team/[slug]': {
    otherChunks: ['static/chunks/2ghi.js'],
    runtimeModuleIds: [56],
    note: '</script><b>&amp;',
  },
};

/** Le script inline tel que Next ≥ 16.4 l'écrit pour une page. */
function nextInlineScript(page: string): string {
  const js = getTurbopackChunkGroupBootstrap(PARAMS, 'TURBOPACK', [
    '/_app',
    page,
  ]);
  if (!js) throw new Error('Next n’a rien généré');
  return htmlEscapeJsonString(js);
}

/** Exécute un code dans un « globalThis » isolé et rend sa file. */
function runWithGlobal(code: string, extra: Record<string, unknown> = {}) {
  const sandbox: Record<string, unknown> = { TURBOPACK: [['déjà là']] };
  new Function('globalThis', ...Object.keys(extra), code)(
    sandbox,
    ...Object.values(extra)
  );
  return sandbox.TURBOPACK;
}

describe('parseTurbopackBootstrap', () => {
  it('reconnaît le script généré par la fonction de Next installée', () => {
    const parsed = parseTurbopackBootstrap(nextInlineScript('/team/[slug]'));
    expect(parsed.global).toBe('TURBOPACK');
    expect(parsed.params).toEqual([PARAMS['/_app'], PARAMS['/team/[slug]']]);
  });

  it.each([
    ['du code arbitraire', 'alert(1)'],
    [
      'un push qui appelle une fonction',
      '(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(evil());',
    ],
    [
      'deux files différentes',
      '(globalThis["A"] || (globalThis["A"] = [])).push({});\n(globalThis["B"] || (globalThis["B"] = [])).push({});',
    ],
    ['un script vide', '  \n '],
  ])('lève sur %s', (_label, source) => {
    expect(() => parseTurbopackBootstrap(source)).toThrow(/turbopackBootstrap/);
  });
});

describe('public/turbopack-bootstrap.js', () => {
  const loader = read('public/turbopack-bootstrap.js');

  it('pousse dans la file exactement ce que poussait le script inline', () => {
    const inline = nextInlineScript('/team/[slug]');
    const { global, params } = parseTurbopackBootstrap(inline);
    const attrs: Record<string, string> = {
      'data-global': global,
      'data-params': JSON.stringify(params),
    };
    const fakeDocument = {
      currentScript: { getAttribute: (name: string) => attrs[name] ?? null },
    };
    expect(runWithGlobal(loader, { document: fakeDocument })).toEqual(
      runWithGlobal(inline)
    );
  });

  it('ne fait rien sans currentScript (script chargé hors d’une balise)', () => {
    expect(
      runWithGlobal(loader, { document: { currentScript: null } })
    ).toEqual([['déjà là']]);
  });

  it('a l’empreinte déclarée par TURBOPACK_BOOTSTRAP_VERSION', () => {
    const hash = createHash('sha256').update(loader).digest('hex').slice(0, 8);
    expect(hash, 'mettre à jour TURBOPACK_BOOTSTRAP_VERSION').toBe(
      TURBOPACK_BOOTSTRAP_VERSION
    );
  });

  it('est servi en immutable (netlify.toml), l’URL changeant avec l’empreinte', () => {
    const toml = read('netlify.toml');
    const block = toml.slice(toml.indexOf('for = "/turbopack-bootstrap.js"'));
    expect(block).toMatch(
      /Cache-Control = "public, max-age=31536000, immutable"/
    );
  });
});

describe('externalizeTurbopackBootstrap', () => {
  const inlineEl = (nonce = 'n0nce') =>
    createElement('script', {
      key: TURBOPACK_BOOTSTRAP_KEY,
      nonce,
      crossOrigin: 'anonymous',
      dangerouslySetInnerHTML: { __html: nextInlineScript('/team/[slug]') },
    });
  const chunk = (defer: boolean) =>
    createElement('script', {
      key: 'static/chunks/0abc.js',
      src: '/_next/static/chunks/0abc.js',
      defer,
    });

  it('remplace le script inline par le chargeur, données en attributs', () => {
    const next = chunk(true);
    const [boot, rest] = externalizeTurbopackBootstrap([inlineEl(), next]);
    const props = boot.props as Record<string, unknown>;
    expect(boot.key).toBe(TURBOPACK_BOOTSTRAP_KEY);
    expect(props.src).toBe(
      `${TURBOPACK_BOOTSTRAP_SRC}?v=${TURBOPACK_BOOTSTRAP_VERSION}`
    );
    expect(props.dangerouslySetInnerHTML).toBeUndefined();
    expect(props['data-global']).toBe('TURBOPACK');
    expect(JSON.parse(props['data-params'] as string)).toEqual([
      PARAMS['/_app'],
      PARAMS['/team/[slug]'],
    ]);
    expect(props.nonce).toBe('n0nce');
    expect(props.crossOrigin).toBe('anonymous');
    // Différé comme les chunks : il reste avant eux dans l'ordre d'exécution.
    expect(props.defer).toBe(true);
    expect(rest).toBe(next);
  });

  it('reste synchrone si aucun chunk n’est différé (comme l’original)', () => {
    const [boot] = externalizeTurbopackBootstrap([inlineEl(), chunk(false)]);
    expect((boot.props as Record<string, unknown>).defer).toBeUndefined();
  });

  it('laisse intacte une liste sans script inline (dev, webpack)', () => {
    const list: ReactElement[] = [chunk(true), chunk(false)];
    const out = externalizeTurbopackBootstrap(list);
    expect(out[0]).toBe(list[0]);
    expect(out[1]).toBe(list[1]);
  });

  it('lève sur un script inline de forme inconnue', () => {
    const bad = createElement('script', {
      key: TURBOPACK_BOOTSTRAP_KEY,
      dangerouslySetInnerHTML: { __html: 'alert(1)' },
    });
    expect(() => externalizeTurbopackBootstrap([bad])).toThrow(
      /forme inattendue/
    );
  });
});

describe('pages/_document.tsx', () => {
  const doc = read('pages/_document.tsx');

  it('rend Head et NextScript à travers les sous-classes qui sortent le script', () => {
    expect(doc).toMatch(/class Head extends BaseHead/);
    expect(doc).toMatch(/class NextScript extends BaseNextScript/);
    expect(
      doc.match(/externalizeTurbopackBootstrap\(super\.getScripts\(files\)\)/g)
    ).toHaveLength(2);
    // Ni l'un ni l'autre n'est importé tel quel de next/document.
    expect(doc).toMatch(/Head as BaseHead/);
    expect(doc).toMatch(/NextScript as BaseNextScript/);
  });
});
