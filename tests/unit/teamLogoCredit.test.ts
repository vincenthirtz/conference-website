// Crédit d'artiste du logo d'une équipe (`teams.logo_credit_*`).
//
// Ce qui est promis, et vérifié ici :
//   - la face équipe TCG EXPOSE le crédit, déjà nettoyé ;
//   - la carte ne le rend que si elle montre réellement le LOGO : une
//     illustration TCG dédiée n'est pas l'œuvre de l'artiste du logo ;
//   - un lien qui n'est pas `https://` n'est jamais rendu comme lien (défense
//     en profondeur : la contrainte SQL l'interdit, mais une ligne écrite à la
//     main ou avant la contrainte passerait) ;
//   - pas de nom, pas de crédit — même avec un lien ;
//   - une carte cliquable n'imbrique pas de `<a>` dans son `<a>` ;
//   - la route staff applique les bornes de la contrainte SQL (400, pas 500).
//
// Rendu SSR via react-dom/server (pas de jsdom dans ce repo).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import type { StaffMember } from '../../types/staff';

vi.mock('@/utils/botEvents', () => ({
  emitBotEvent: vi.fn(async () => ({ delivered: true, status: 200 })),
}));

import TcgCard, { type TcgCardProps } from '@/components/tcg/TcgCard';
import LogoCredit from '@/components/Team/LogoCredit';
import {
  displayableLogoCreditUrl,
  parseLogoCreditInput,
  resolveLogoCredit,
} from '@/utils/teams/logoCredit';
import { readTeamFaces } from '../../utils/tcg/readCardFaces';
import handler from '../../pages/api/admin/teams/[teamId]';

const TEAM_ID = '550e8400-e29b-41d4-a716-4466554400b2';
const TWITCH = 'https://www.twitch.tv/madamekuma';

const labels: TcgCardProps['labels'] = {
  rarity: {
    common: 'Commune',
    rare: 'Rare',
    epic: 'Epique',
    legendary: 'Legendaire',
  },
  foil: 'Brillante',
  copies: 'x{count}',
  logoCredit: 'Logo : {artist}',
};

type TeamSubject = Extract<TcgCardProps['subject'], { kind: 'team' }>;

function teamSubject(over: Partial<TeamSubject> = {}): TeamSubject {
  return {
    kind: 'team',
    teamId: TEAM_ID,
    name: 'Team Positivité',
    slug: 'team-positivite',
    logoUrl: 'https://cdn.example.test/logo.png',
    cardImageUrl: null,
    logoCredit: { name: 'madamekuma', url: TWITCH },
    ...over,
  };
}

function renderCard(
  subject: TeamSubject,
  extra: Partial<TcgCardProps> = {}
): string {
  return renderToString(
    createElement(TcgCard, { subject, rarity: 'rare', labels, ...extra })
  );
}

/* ---------------------------------------------------------------------------
 * Règles pures
 * ------------------------------------------------------------------------- */

describe('resolveLogoCredit / displayableLogoCreditUrl', () => {
  it('garde un lien https', () => {
    expect(resolveLogoCredit('madamekuma', TWITCH)).toEqual({
      name: 'madamekuma',
      url: TWITCH,
    });
  });

  it('refuse tout ce qui n’est pas https://', () => {
    for (const bad of [
      'http://www.twitch.tv/madamekuma',
      'javascript:alert(1)',
      'data:text/html,<b>x</b>',
      'HTTPS://www.twitch.tv/x',
      'www.twitch.tv/madamekuma',
      `https://x.test/${'a'.repeat(300)}`,
    ]) {
      expect(displayableLogoCreditUrl(bad)).toBeNull();
    }
  });

  it('pas de nom, pas de crédit — même avec un lien', () => {
    expect(resolveLogoCredit(null, TWITCH)).toBeNull();
    expect(resolveLogoCredit('   ', TWITCH)).toBeNull();
  });
});

describe('parseLogoCreditInput', () => {
  it('rogne le nom, efface sur vide ou null', () => {
    expect(parseLogoCreditInput({ logo_credit_name: '  madamekuma ' })).toEqual(
      { ok: true, patch: { logo_credit_name: 'madamekuma' } }
    );
    expect(
      parseLogoCreditInput({ logo_credit_name: '', logo_credit_url: null })
    ).toEqual({
      ok: true,
      patch: { logo_credit_name: null, logo_credit_url: null },
    });
  });

  it('une clé absente ne touche à rien', () => {
    expect(parseLogoCreditInput({})).toEqual({ ok: true, patch: {} });
  });

  it('refuse hors bornes et lien non https', () => {
    expect(parseLogoCreditInput({ logo_credit_name: 'a' }).ok).toBe(false);
    expect(parseLogoCreditInput({ logo_credit_name: 'a'.repeat(81) }).ok).toBe(
      false
    );
    expect(parseLogoCreditInput({ logo_credit_url: 'http://x.test' }).ok).toBe(
      false
    );
    expect(parseLogoCreditInput({ logo_credit_name: 42 }).ok).toBe(false);
  });
});

/* ---------------------------------------------------------------------------
 * Lecteur de faces
 * ------------------------------------------------------------------------- */

describe('readTeamFaces — crédit du logo', () => {
  beforeEach(() => {
    resetSupabaseMock();
  });

  function seed(over: Record<string, unknown>) {
    store.teams = [
      {
        id: TEAM_ID,
        tenant_id: CONFERENCE_TENANT_ID,
        name: 'Team Positivité',
        short_name: 'POS',
        slug: 'team-positivite',
        logo_url: 'https://cdn.example.test/logo.png',
        tcg_image_path: null,
        logo_credit_name: null,
        logo_credit_url: null,
        ...over,
      },
    ] as any;
  }

  it('expose le crédit', async () => {
    seed({ logo_credit_name: 'madamekuma', logo_credit_url: TWITCH });
    const face = (await readTeamFaces(CONFERENCE_TENANT_ID, [TEAM_ID])).get(
      TEAM_ID
    )!;
    expect(face.logoCredit).toEqual({ name: 'madamekuma', url: TWITCH });
  });

  it('rend null sans nom, et un lien non https devient null', async () => {
    seed({ logo_credit_name: null, logo_credit_url: TWITCH });
    let face = (await readTeamFaces(CONFERENCE_TENANT_ID, [TEAM_ID])).get(
      TEAM_ID
    )!;
    expect(face.logoCredit).toBeNull();

    seed({
      logo_credit_name: 'madamekuma',
      logo_credit_url: 'javascript:alert(1)',
    });
    face = (await readTeamFaces(CONFERENCE_TENANT_ID, [TEAM_ID])).get(TEAM_ID)!;
    expect(face.logoCredit).toEqual({ name: 'madamekuma', url: null });
  });
});

/* ---------------------------------------------------------------------------
 * Carte TCG
 * ------------------------------------------------------------------------- */

describe('TcgCard — crédit du logo', () => {
  it('le rend, en lien, quand la carte montre le logo (sans lien de carte)', () => {
    const html = renderCard(teamSubject(), { noLink: true });
    expect(html).toContain('madamekuma');
    expect(html).toContain(`href="${TWITCH}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('ne le rend PAS quand l’équipe a une illustration TCG dédiée', () => {
    const html = renderCard(
      teamSubject({ cardImageUrl: 'https://cdn.example.test/tcg.png' }),
      { noLink: true }
    );
    expect(html).not.toContain('madamekuma');
  });

  it('ne le rend pas sans logo (la carte montre une initiale)', () => {
    const html = renderCard(teamSubject({ logoUrl: null }), { noLink: true });
    expect(html).not.toContain('madamekuma');
  });

  it('carte cliquable : le nom, sans <a> imbriqué', () => {
    const html = renderCard(teamSubject());
    expect(html).toContain('madamekuma');
    expect(html).not.toContain(TWITCH);
    expect(html.match(/<a\b/g) ?? []).toHaveLength(1);
  });

  it('pas de libellé fourni ⇒ pas de crédit (aucun texte en dur)', () => {
    const { logoCredit: _omit, ...rest } = labels;
    const html = renderToString(
      createElement(TcgCard, {
        subject: teamSubject(),
        rarity: 'rare',
        labels: rest,
        noLink: true,
      })
    );
    expect(html).not.toContain('madamekuma');
  });
});

/* ---------------------------------------------------------------------------
 * Bloc de la fiche publique
 * ------------------------------------------------------------------------- */

describe('LogoCredit — bloc de la fiche', () => {
  const render = (name: string | null, url: string | null) =>
    renderToString(
      createElement(LogoCredit, { name, url, label: 'Logo : {artist}' })
    );

  it('« Logo : madamekuma », le nom en lien', () => {
    const html = render('madamekuma', TWITCH);
    expect(html).toContain('Logo : ');
    expect(html).toMatch(
      /<a href="https:\/\/www\.twitch\.tv\/madamekuma" target="_blank" rel="noopener noreferrer"[^>]*>madamekuma<\/a>/
    );
  });

  it('un lien non https n’est pas rendu comme lien', () => {
    for (const bad of [
      'http://www.twitch.tv/madamekuma',
      'javascript:alert(1)',
    ]) {
      const html = render('madamekuma', bad);
      expect(html).toContain('madamekuma');
      expect(html).not.toContain('<a');
    }
  });

  it('pas de nom ⇒ rien du tout', () => {
    expect(render(null, TWITCH)).toBe('');
    expect(render('  ', TWITCH)).toBe('');
  });

  it('respecte l’ordre des mots de la langue (« Logo by {artist} »)', () => {
    const html = renderToString(
      createElement(LogoCredit, {
        name: 'madamekuma',
        url: null,
        label: 'Logo by {artist}',
      })
    );
    expect(html).toMatch(/Logo by .*madamekuma/);
  });
});

/* ---------------------------------------------------------------------------
 * Route staff
 * ------------------------------------------------------------------------- */

describe('PATCH /api/admin/teams/[teamId] — crédit du logo', () => {
  function makeStaffRow(): StaffMember {
    return {
      id: 'staff-1',
      auth_user_id: 'user-1',
      email: 'a@a.com',
      role: 'admin',
      display_name: null,
      avatar_url: null,
      created_at: '2026-01-01T00:00:00.000Z',
    };
  }

  let n = 0;
  const makeReq = (body: Record<string, unknown>): any => {
    n += 1;
    return {
      method: 'PATCH',
      headers: { host: 'h', authorization: `Bearer lc-${Date.now()}-${n}` },
      query: { teamId: TEAM_ID },
      body,
    };
  };
  const makeRes = () => {
    const res: any = { statusCode: 200, body: undefined, headers: {} };
    res.status = (c: number) => ((res.statusCode = c), res);
    res.json = (b: unknown) => ((res.body = b), res);
    res.setHeader = (k: string, v: unknown) => {
      res.headers[k] = v;
    };
    return res;
  };
  const team = () => (store.teams as any[]).find((t) => t.id === TEAM_ID);

  beforeEach(() => {
    resetSupabaseMock();
    invalidateStaffCache();
    setAuthUser({ id: 'user-1' });
    store.staff = [makeStaffRow()] as any;
    store.teams = [
      {
        id: TEAM_ID,
        tenant_id: CONFERENCE_TENANT_ID,
        name: 'Team Positivité',
        slug: 'team-positivite',
        is_active: true,
        deleted_at: null,
        logo_credit_name: null,
        logo_credit_url: null,
      },
    ] as any;
  });

  it('le staff pose le crédit (nom rogné)', async () => {
    const res = makeRes();
    await handler(
      makeReq({ logo_credit_name: ' madamekuma ', logo_credit_url: TWITCH }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(team().logo_credit_name).toBe('madamekuma');
    expect(team().logo_credit_url).toBe(TWITCH);
  });

  it('refuse un lien http ou un nom trop court, sans rien écrire', async () => {
    for (const body of [
      { logo_credit_name: 'madamekuma', logo_credit_url: 'http://x.test' },
      { logo_credit_name: 'm' },
    ]) {
      const res = makeRes();
      await handler(makeReq(body), res);
      expect(res.statusCode).toBe(400);
      expect(team().logo_credit_name).toBeNull();
    }
  });

  it('efface sur chaîne vide', async () => {
    store.teams = [
      { ...team(), logo_credit_name: 'madamekuma', logo_credit_url: TWITCH },
    ] as any;
    const res = makeRes();
    await handler(makeReq({ logo_credit_name: '', logo_credit_url: '' }), res);
    expect(res.statusCode).toBe(200);
    expect(team().logo_credit_name).toBeNull();
    expect(team().logo_credit_url).toBeNull();
  });
});
