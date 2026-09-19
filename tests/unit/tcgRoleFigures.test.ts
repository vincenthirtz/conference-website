// Figurines de rôle du TCG.
// Targets : utils/tcg/roleFigures.ts (pur),
//           pages/api/tcg/figure/[version]/[role]/[file].ts,
//           utils/tcg/readCardFaces.ts (figureRole / teamColor).
//
// CE QUE CES CAS PROTÈGENT, par ordre d'importance :
//   1. RIEN N'ENTRE DANS LE SVG SANS ÊTRE VALIDÉ. La couleur vient d'une URL ;
//      une valeur non `RRGGBB` doit être refusée avant le rendu, pas échappée
//      après.
//   2. ON N'ATTRIBUE PAS UN RÔLE AU HASARD. Sans héroïne choisie ni spécialité,
//      la carte n'a pas de figurine — même règle que `recommendCardHero`.
//   3. UNE HÉROÏNE DÉDUITE N'EST PAS NOMMÉE. La figurine porte le nom de
//      l'héroïne seulement si la joueuse l'a choisie (`heroSource: 'pick'`).
//   4. LE CACHE D'UN AN NE MENT PAS : la sortie ne dépend que du chemin, et une
//      version dépassée ne sert pas le modèle courant sous son ancienne URL.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import {
  FIGURE_ROLES,
  FIGURE_VERSION,
  buildRoleFigure,
  cardFigureOf,
  figureRoleFromHeroRole,
  figureUrl,
  normalizeFigureColor,
  renderRoleFigureSvg,
} from '../../utils/tcg/roleFigures';
import { readPlayerFaces } from '../../utils/tcg/readCardFaces';
import handler from '../../pages/api/tcg/figure/[version]/[role]/[file]';

const USER = 'aaaaaaaa-0000-4000-8000-000000000001';
const TEAM = 'bbbbbbbb-0000-4000-8000-000000000001';

function makeReq(query: Record<string, unknown>, method = 'GET'): any {
  return { method, headers: { host: 'h' }, cookies: {}, query, body: {} };
}

function makeRes(): any {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.send = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k.toLowerCase()] = v;
  };
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

/* ── Le cœur pur ───────────────────────────────────────────────────────── */

describe('couleur d’équipe', () => {
  it('n’accepte qu’un RRGGBB strict', () => {
    expect(normalizeFigureColor('#A62EDB')).toBe('#a62edb');
    expect(normalizeFigureColor('a62edb')).toBe('#a62edb');
    for (const bad of [
      'red',
      '#fff',
      '#a62edbzz',
      'a62edb"/><script>',
      '',
      null,
    ]) {
      expect(normalizeFigureColor(bad as string | null)).toBeNull();
    }
  });

  it('retombe sur le violet du logo sans couleur exploitable', () => {
    expect(figureUrl('tank', null)).toBe(
      `/api/tcg/figure/v${FIGURE_VERSION}/tank/a62edb.svg`
    );
    expect(figureUrl('support', 'pas-une-couleur')).toContain('/a62edb.svg');
  });
});

describe('rôle', () => {
  it('traduit le rôle du registre des héros', () => {
    expect(figureRoleFromHeroRole('Tank')).toBe('tank');
    expect(figureRoleFromHeroRole('Damage')).toBe('damage');
    expect(figureRoleFromHeroRole('Support')).toBe('support');
    expect(figureRoleFromHeroRole('Flex')).toBeNull();
    expect(figureRoleFromHeroRole(null)).toBeNull();
  });

  it('ne produit aucune figurine sans rôle connu', () => {
    expect(
      cardFigureOf({
        figureRole: null,
        teamColor: '#123456',
        heroName: null,
        heroSource: null,
      })
    ).toBeNull();
    expect(cardFigureOf(undefined)).toBeNull();
  });
});

describe('modèles', () => {
  it('produit trois figurines distinctes, chacune avec sa couleur d’équipe', () => {
    const svgs = FIGURE_ROLES.map((role) =>
      renderRoleFigureSvg(role, '#e63946')
    );
    expect(new Set(svgs).size).toBe(3);
    for (const svg of svgs) {
      expect(svg.startsWith('<svg')).toBe(true);
    }
  });

  it('est déterministe : même chemin, même dessin', () => {
    // C'est ce qui autorise le cache d'un an.
    expect(renderRoleFigureSvg('tank', '#2a9d8f')).toBe(
      renderRoleFigureSvg('tank', '#2a9d8f')
    );
  });

  it('porte la couleur d’équipe dans la palette', () => {
    expect(buildRoleFigure('support', '#2a9d8f').recipe.palette[2]).toBe(
      '#2a9d8f'
    );
  });
});

/* ── La route ──────────────────────────────────────────────────────────── */

describe('GET /api/tcg/figure/[version]/[role]/[file]', () => {
  const current = `v${FIGURE_VERSION}`;

  it('sert le SVG avec un cache d’un an et une CSP fermée', () => {
    const res = makeRes();
    handler(
      makeReq({ version: current, role: 'tank', file: 'a62edb.svg' }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('image/svg+xml');
    expect(res.headers['cache-control']).toContain('immutable');
    expect(res.headers['content-security-policy']).toContain(
      "default-src 'none'"
    );
    expect(String(res.body).startsWith('<svg')).toBe(true);
  });

  it('refuse une couleur mal formée avant tout rendu', () => {
    const res = makeRes();
    handler(
      makeReq({ version: current, role: 'tank', file: 'zzzzzz.svg' }),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('ne sert pas un rôle inconnu', () => {
    const res = makeRes();
    handler(
      makeReq({ version: current, role: 'mage', file: 'a62edb.svg' }),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('ne sert pas le modèle courant sous une version dépassée', () => {
    const res = makeRes();
    handler(makeReq({ version: 'v0', role: 'tank', file: 'a62edb.svg' }), res);
    expect(res.statusCode).toBe(404);
  });

  it('refuse les autres méthodes', () => {
    const res = makeRes();
    handler(
      makeReq({ version: current, role: 'tank', file: 'a62edb.svg' }, 'POST'),
      res
    );
    expect(res.statusCode).toBe(405);
  });
});

/* ── La face de carte ──────────────────────────────────────────────────── */

describe('readPlayerFaces — figurine et couleur d’équipe', () => {
  it('déduit la figurine de la spécialité et prend la couleur de son équipe', async () => {
    store.player_ratings = [
      {
        tenant_id: DEFAULT_TENANT_ID,
        user_id: USER,
        display_name: 'Nova',
        battle_tag: null,
        avatar_url: null,
      },
    ];
    store.team_members = [
      {
        tenant_id: DEFAULT_TENANT_ID,
        user_id: USER,
        specialty: 'tank',
        team_id: TEAM,
      },
    ];
    store.teams = [
      { id: TEAM, accent_color: '#E63946', secondary_color: null },
    ];

    const face = (await readPlayerFaces(DEFAULT_TENANT_ID, [USER])).get(USER)!;
    expect(face.figureRole).toBe('tank');
    expect(face.teamColor).toBe('#e63946');
    // Déduite du rôle : la carte ne doit pas la NOMMER.
    expect(face.heroSource).toBe('role');
  });

  it('n’en donne aucune sans rôle ni héroïne choisie', async () => {
    store.player_ratings = [
      {
        tenant_id: DEFAULT_TENANT_ID,
        user_id: USER,
        display_name: 'Nova',
        battle_tag: null,
        avatar_url: null,
      },
    ];
    const face = (await readPlayerFaces(DEFAULT_TENANT_ID, [USER])).get(USER)!;
    expect(face.figureRole).toBeNull();
    expect(cardFigureOf(face)).toBeNull();
  });

  it('ignore une couleur d’équipe illisible plutôt que de la faire passer', async () => {
    store.player_ratings = [
      {
        tenant_id: DEFAULT_TENANT_ID,
        user_id: USER,
        display_name: 'Nova',
        battle_tag: null,
        avatar_url: null,
      },
    ];
    store.team_members = [
      {
        tenant_id: DEFAULT_TENANT_ID,
        user_id: USER,
        specialty: 'support',
        team_id: TEAM,
      },
    ];
    store.teams = [
      { id: TEAM, accent_color: 'rose bonbon', secondary_color: null },
    ];

    const face = (await readPlayerFaces(DEFAULT_TENANT_ID, [USER])).get(USER)!;
    expect(face.figureRole).toBe('support');
    expect(face.teamColor).toBeNull();
  });
});
