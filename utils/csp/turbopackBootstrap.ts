// utils/csp/turbopackBootstrap.ts
//
// Sort de la page le script inline que Next ≥ 16.4 ajoute pour amorcer
// Turbopack, pour que notre CSP à nonce reste stricte.
//
// LE PROBLÈME. Depuis 16.4.0, `_document` (Head et NextScript, `getScripts`)
// écrit avant les chunks un `<script>` inline : une ou deux lignes
// `(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push({…});`,
// pour `/_app` et pour la page. Sur une page pré-rendue (statique, ISR), il
// n'y a pas de requête au moment du rendu, donc pas de nonce : la CSP posée
// par proxy.ts (`script-src 'self' 'nonce-…'`, sans 'unsafe-inline') le
// refuse, la file reste vide et aucun JS ne démarre. Vérifié le 2026-10-27 :
// 16.4.3 sans ce module → violation CSP, `window.next` absent.
//
// LA SOLUTION. Ce script ne contient que des DONNÉES (les paramètres de
// chunk groups, en JSON). On les passe en attributs à un petit fichier du site
// (public/turbopack-bootstrap.js, permis par 'self') qui fait le même `push`.
// Ni 'unsafe-inline', ni hash, ni réécriture HTML à la volée : la CSP reste
// identique et les pages restent pré-rendues.
//
// FAIL-FAST. Si Next change la forme de ce script, `parseTurbopackBootstrap`
// lève : le pré-rendu des pages échoue au BUILD au lieu de livrer un site sans
// JS. Le test turbopackBootstrap.test.ts génère le script avec la fonction
// même de Next installée : une montée de version qui change le format y
// casse d'abord.

import { createElement, type ReactElement } from 'react';

/** Clé React que Next donne au script inline (`getInlineBootstrapScript`). */
export const TURBOPACK_BOOTSTRAP_KEY = 'turbopack-bootstrap';

export const TURBOPACK_BOOTSTRAP_SRC = '/turbopack-bootstrap.js';

/**
 * Empreinte du chargeur (8 premiers caractères du SHA-256 de
 * public/turbopack-bootstrap.js) : sert à invalider le cache navigateur, le
 * fichier étant servi en `immutable` (cloudflare/_headers). Le test vérifie qu'elle
 * suit le fichier.
 */
export const TURBOPACK_BOOTSTRAP_VERSION = 'd4c4157c';

// `(globalThis["X"] || (globalThis["X"] = [])).push(<json>);` — une ligne par
// page. Le nom est une chaîne JSON, les paramètres un objet JSON.
const STATEMENT =
  /^\(globalThis\[("(?:[^"\\]|\\.)*")\] \|\| \(globalThis\[\1\] = \[\]\)\)\.push\((\{.*\})\);$/;

export type TurbopackBootstrap = {
  /** Nom de la file globale (`chunkLoadingGlobal`, « TURBOPACK »). */
  global: string;
  /** Paramètres poussés dans la file, dans l'ordre. */
  params: unknown[];
};

/**
 * Lit le code du script inline. Lève si sa forme n'est pas exactement celle
 * attendue : mieux vaut un build rouge qu'un site sans JS.
 */
export function parseTurbopackBootstrap(source: string): TurbopackBootstrap {
  let global: string | null = null;
  const params: unknown[] = [];
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = STATEMENT.exec(line);
    if (!m) {
      throw new Error(
        `[turbopackBootstrap] forme inattendue du script inline de Next : ${line.slice(0, 120)}`
      );
    }
    const name = JSON.parse(m[1]) as string;
    if (global !== null && name !== global) {
      throw new Error(
        `[turbopackBootstrap] deux files différentes : ${global} et ${name}`
      );
    }
    global = name;
    params.push(JSON.parse(m[2]));
  }
  if (global === null) {
    throw new Error('[turbopackBootstrap] script inline vide');
  }
  return { global, params };
}

type ScriptProps = {
  nonce?: string;
  crossOrigin?: string;
  defer?: boolean;
  dangerouslySetInnerHTML?: { __html?: unknown };
};

/**
 * Remplace, dans la liste rendue par `getScripts()`, le script inline par le
 * chargeur externe. Les autres éléments passent tels quels.
 *
 * Le chargeur reprend l'attribut `defer` des chunks voisins : les scripts
 * différés s'exécutent dans l'ordre du document, il passe donc avant le chunk
 * runtime qui vide la file — la seule contrainte d'ordre de l'original. Sans
 * chunks différés, il reste synchrone, comme l'original.
 */
export function externalizeTurbopackBootstrap(
  scripts: ReactElement[]
): ReactElement[] {
  const deferred = scripts.some(
    (el) =>
      el?.key !== TURBOPACK_BOOTSTRAP_KEY &&
      (el?.props as ScriptProps | undefined)?.defer === true
  );
  return scripts.map((el) => {
    if (el?.key !== TURBOPACK_BOOTSTRAP_KEY) return el;
    const props = el.props as ScriptProps;
    const html = props.dangerouslySetInnerHTML?.__html;
    if (typeof html !== 'string') {
      throw new Error('[turbopackBootstrap] script inline sans contenu');
    }
    const { global, params } = parseTurbopackBootstrap(html);
    return createElement('script', {
      key: TURBOPACK_BOOTSTRAP_KEY,
      src: `${TURBOPACK_BOOTSTRAP_SRC}?v=${TURBOPACK_BOOTSTRAP_VERSION}`,
      'data-global': global,
      'data-params': JSON.stringify(params),
      nonce: props.nonce,
      crossOrigin: props.crossOrigin,
      defer: deferred || undefined,
    });
  });
}
