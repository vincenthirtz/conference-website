// Aides des specs « Le Ruban » (tests/e2e/ruban-*.spec.ts).
//
// Ce qu'elles lisent est ce que le navigateur a RÉELLEMENT appliqué : styles
// calculés, jetons résolus sur `:root`, attributs posés par pages/_app.tsx
// (`data-surface`, via utils/layout/appChrome.ts). Aucune capture d'écran :
// leurs références ne seraient pas maîtrisées (polices, rendu du runner).

import { expect, type Locator, type Page } from '@playwright/test';

export const RUBAN_PASSWORD = 'TestPassw0rd!';

/**
 * Jetons « Le Ruban » comparés entre l'admin et l'espace joueuse
 * (styles/ruban-tokens.css + pont Tailwind des deux feuilles de surface).
 */
export const RUBAN_TOKENS = [
  '--canvas',
  '--s1',
  '--s2',
  '--s3',
  '--t1',
  '--t2',
  '--t3',
  '--t4',
  '--or',
  '--or-200',
  '--or-400',
  '--lf',
  '--ok',
  '--warn',
  '--err',
  '--line',
  '--line2',
  '--r-ctrl',
  '--r-card',
  '--sh2',
  '--glow-live',
  '--fd',
  '--fu',
] as const;

/**
 * Pont Tailwind : ces variables EXISTENT sur le public (thème Tailwind) ; sous
 * une surface Ruban elles sont détournées vers l'encre / l'orchidée. Valeurs
 * attendues sous Ruban.
 */
export const RUBAN_BRIDGE: Record<string, string> = {
  '--color-neutral-900': '#1d1520',
  '--color-gray-800': '#2f2732',
  '--color-purple-500': '#b467d1',
  '--color-violet-400': '#ca85e6',
  '--radius-3xl': '14px',
};

/** Valeurs attendues (planche « Du dessin au code »), pour les plus parlantes. */
export const RUBAN_EXPECTED: Record<string, string> = {
  '--canvas': '#07030a',
  '--s1': '#100812',
  '--t1': '#f4edf7',
  '--or': '#b467d1',
  '--ok': '#30d07e',
  '--warn': '#f5a524',
  '--err': '#ff6b6b',
  '--r-ctrl': '4px',
  '--r-card': '14px',
};

/** Jetons résolus sur `:root` (chaîne vide = non défini). */
export async function readRootTokens(
  page: Page,
  names: readonly string[] = [
    ...RUBAN_TOKENS,
    ...Object.keys(RUBAN_BRIDGE),
    '--target-min',
    '--body-size',
    '--admin-sidebar-w',
  ]
): Promise<Record<string, string>> {
  return page.evaluate((list) => {
    const cs = getComputedStyle(document.documentElement);
    const out: Record<string, string> = {};
    for (const n of list) out[n] = cs.getPropertyValue(n).trim();
    return out;
  }, names as string[]);
}

/** Valeurs de `data-surface` présentes dans le document (ordre DOM). */
export async function surfacesOf(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-surface]')).map(
      (el) => el.getAttribute('data-surface') ?? ''
    )
  );
}

export async function expectSurface(
  page: Page,
  surface: 'admin' | 'player' | null
) {
  if (surface === null) {
    await expect(page.locator('[data-surface]')).toHaveCount(0);
  } else {
    await expect(page.locator('[data-surface]')).toHaveCount(1);
    await expect(page.locator('[data-surface]')).toHaveAttribute(
      'data-surface',
      surface
    );
  }
}

/** Connexion staff par le vrai formulaire → atterrit sur /admin. */
export async function loginStaff(page: Page, email: string) {
  await page.goto('/login');
  await page.fill('input#email', email);
  await page.fill('input#password', RUBAN_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin(?!\/login)/, { timeout: 20000 });
}

/** Styles calculés qui font la « grammaire » d'une brique. */
export const GRAMMAR_PROPS = [
  'font-family',
  'font-weight',
  'font-stretch',
  'text-transform',
  'border-top-left-radius',
  'border-top-width',
  'border-top-style',
] as const;

export async function computed(
  locator: Locator,
  props: readonly string[]
): Promise<Record<string, string>> {
  return locator.evaluate((el, list) => {
    const cs = getComputedStyle(el);
    const out: Record<string, string> = {};
    for (const p of list) out[p] = cs.getPropertyValue(p);
    return out;
  }, props as string[]);
}

/** Pas de défilement horizontal de la page (375 px). */
export async function hasHorizontalOverflow(page: Page): Promise<{
  overflow: boolean;
  scrollWidth: number;
  clientWidth: number;
}> {
  return page.evaluate(() => {
    const el = document.documentElement;
    return {
      overflow: el.scrollWidth > el.clientWidth,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    };
  });
}

/**
 * Rapport de contraste WCAG entre la couleur du texte d'un élément et son fond
 * EFFECTIF (fonds translucides des ancêtres composés jusqu'au premier opaque).
 */
export async function contrastRatio(locator: Locator): Promise<number> {
  return locator.evaluate((el) => {
    type C = [number, number, number, number];
    const parse = (s: string): C | null => {
      let m = s.match(/^rgba?\(([^)]+)\)$/);
      if (m) {
        const p = m[1]
          .split(/[\s,/]+/)
          .filter(Boolean)
          .map(Number);
        return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
      }
      m = s.match(/^color\(srgb ([^)]+)\)$/);
      if (m) {
        const p = m[1]
          .split(/[\s/]+/)
          .filter(Boolean)
          .map(Number);
        return [p[0] * 255, p[1] * 255, p[2] * 255, p.length > 3 ? p[3] : 1];
      }
      return null;
    };
    const layers: C[] = [];
    let node: Element | null = el;
    while (node) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c && c[3] > 0) {
        layers.push(c);
        if (c[3] >= 1) break;
      }
      node = node.parentElement;
    }
    // Base : dernier calque opaque trouvé, sinon blanc (fond du navigateur).
    let bg: [number, number, number] = [255, 255, 255];
    for (let i = layers.length - 1; i >= 0; i -= 1) {
      const [r, g, b, a] = layers[i];
      bg = [
        r * a + bg[0] * (1 - a),
        g * a + bg[1] * (1 - a),
        b * a + bg[2] * (1 - a),
      ];
    }
    const fg = parse(getComputedStyle(el).color) ?? [0, 0, 0, 1];
    const fgRgb: [number, number, number] = [
      fg[0] * fg[3] + bg[0] * (1 - fg[3]),
      fg[1] * fg[3] + bg[1] * (1 - fg[3]),
      fg[2] * fg[3] + bg[2] * (1 - fg[3]),
    ];
    const lum = ([r, g, b]: [number, number, number]) => {
      const f = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const l1 = lum(fgRgb);
    const l2 = lum(bg);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  });
}

/** Met le focus CLAVIER (donc `:focus-visible`) sur une brique. */
export async function keyboardFocus(page: Page, locator: Locator) {
  await locator.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(locator).toBeFocused();
  expect(await locator.evaluate((el) => el.matches(':focus-visible'))).toBe(
    true
  );
  // `transition-colors` du kit anime aussi `outline-color` : on lit l'état
  // FINAL, pas une couleur intermédiaire.
  await locator.evaluate((el) => {
    for (const a of el.getAnimations()) a.finish();
  });
}

/** Réponses vides mais valides des API du tableau de bord joueuse. */
export async function mockPlayerDashboardApis(page: Page) {
  const json = (pathname: string, body: unknown) =>
    page.route(
      (url) => url.pathname === pathname,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(body),
        })
    );
  await json('/api/player/matches', { team: null, matches: [] });
  await json('/api/player/next-match', {
    match: null,
    team: null,
    opponent: null,
    tournament: null,
    checkin: null,
  });
  await json('/api/player/notifications', {
    hasTeam: false,
    isCaptain: false,
    isManager: false,
    captainTeamId: null,
    memberTeamId: null,
    unreadMessages: 0,
    pendingScrims: 0,
    pendingJoinRequests: 0,
    checkinPending: 0,
    total: 0,
  });
  await json('/api/player/push/prefs', { prefs: [] });
}

/**
 * Connexion joueuse par le vrai formulaire /login. La connexion n'est pas
 * l'objet de ces specs : attente plus longue que le helper commun (la
 * première connexion d'une tranche tombe sur un serveur froid), et, si la page
 * reste sur /login alors que la session est posée, on vérifie qu'elle ouvre
 * bien `next` plutôt que de ressaisir le formulaire (que /login démonte en
 * redirigeant une session active).
 */
export async function loginRubanPlayer(
  page: Page,
  email: string,
  next: string
) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  // Le formulaire de connexion seul (le pied de page a son propre submit).
  const form = page
    .locator('form')
    .filter({ has: page.locator('input#password') });
  await form.locator('input#email').fill(email);
  await form.locator('input#password').fill(RUBAN_PASSWORD);
  await form.locator('button[type="submit"]').click();
  const left = await page
    .waitForURL((url) => !url.pathname.startsWith('/login'), {
      timeout: 30000,
    })
    .then(() => true)
    .catch(() => false);
  if (left) return;
  await page.goto(next);
  expect(new URL(page.url()).pathname, 'session joueuse établie').not.toMatch(
    /^\/login/
  );
}
