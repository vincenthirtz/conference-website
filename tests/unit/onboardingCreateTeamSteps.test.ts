// tests/unit/onboardingCreateTeamSteps.test.ts — les étapes PURES de la
// création d'équipe anonyme (lot P11, features/player/onboarding) : elles
// refusent AVANT toute création de compte, avec les codes que le wizard
// /team/create traduit.

import { describe, it, expect } from 'vitest';
import { CreateTeamBody } from '../../features/player/onboarding/schemas';
import { readTeamFields } from '../../features/player/onboarding/service/teamFields';
import { readDeclaredRoster } from '../../features/player/onboarding/service/roster';
import { maskEmail } from '../../features/player/onboarding/service/access';
import { MAX_ROSTER_ROWS, MAX_TEAM_PLAYERS } from '../../utils/constants';

const body = (b: Record<string, unknown>) => CreateTeamBody.parse(b);

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    return (err as { legacyCode?: string }).legacyCode;
  }
  return undefined;
}

describe('schéma de structure', () => {
  it('accepte ce que la route acceptait (nombres convertis, members hors tableau ignorés)', () => {
    const parsed = body({ name: 'Nova', short_name: 7, members: 'x' });
    expect(parsed.short_name).toBe('7');
    expect(parsed.members).toEqual([]);
  });

  it('refuse un nom non textuel (la route plantait en 500)', () => {
    expect(CreateTeamBody.safeParse({ name: 12 }).success).toBe(false);
  });
});

describe('étape 1 — identité de l’équipe', () => {
  it.each([
    [{}, 'NAME_REQUIRED'],
    [{ name: 'A' }, 'NAME_TOO_SHORT'],
    [{ name: 'a'.repeat(101) }, 'NAME_TOO_LONG'],
    [{ name: 'Nova', description: 'd'.repeat(2001) }, 'DESCRIPTION_TOO_LONG'],
    [{ name: 'Nova', logo_url: 'javascript:alert(1)' }, 'INVALID_URL'],
  ])('%j → %s', (input, code) => {
    expect(codeOf(() => readTeamFields(body(input)))).toBe(code);
  });

  it('prépare la ligne `teams`, ouverte au recrutement', () => {
    const { row } = readTeamFields(
      body({ name: ' Nova ', website: 'https://nova.gg', country: ' FR ' })
    );
    expect(row).toMatchObject({
      name: 'Nova',
      website: 'https://nova.gg',
      country: 'FR',
      is_joinable: true,
    });
  });
});

describe('étape 2 — roster déclaré', () => {
  const player = (i: number, role = 'player') => ({
    email: `p${i}@x.fr`,
    role,
  });

  it('plafonne les JOUEUSES, pas l’encadrement', () => {
    const full = Array.from({ length: MAX_TEAM_PLAYERS }, (_, i) => player(i));
    expect(() =>
      readDeclaredRoster(body({ members: [...full, player(99, 'coach')] }))
    ).not.toThrow();
    expect(
      codeOf(() => readDeclaredRoster(body({ members: [...full, player(98)] })))
    ).toBe('TOO_MANY_MEMBERS');
  });

  it('plafond absolu de lignes', () => {
    const coaches = Array.from({ length: MAX_ROSTER_ROWS + 1 }, (_, i) =>
      player(i, 'coach')
    );
    expect(codeOf(() => readDeclaredRoster(body({ members: coaches })))).toBe(
      'TOO_MANY_MEMBERS'
    );
  });

  it('manager : e-mail valide et absent du roster', () => {
    expect(
      codeOf(() => readDeclaredRoster(body({ manager_email: 'pas-un-mail' })))
    ).toBe('MANAGER_EMAIL_INVALID');
    expect(
      codeOf(() =>
        readDeclaredRoster(
          body({ manager_email: 'P1@x.fr', members: [player(1)] })
        )
      )
    ).toBe('MANAGER_DUPLICATE');
  });

  it('capitaine demandée sans membre', () => {
    expect(codeOf(() => readDeclaredRoster(body({ set_captain: true })))).toBe(
      'CAPTAIN_REQUIRED'
    );
  });

  it('normalise les lignes et écarte les vides', () => {
    const roster = readDeclaredRoster(
      body({ members: [{ email: ' A@X.FR ', set_captain: 1 }, {}] })
    );
    expect(roster.lines).toEqual([
      {
        email: 'a@x.fr',
        user_id: '',
        role: '',
        set_captain: true,
        battle_tag: '',
        specialty: '',
      },
    ]);
    expect(roster.wantsMember).toBe(true);
  });
});

describe('pont magic-link', () => {
  it('ne renvoie jamais que l’e-mail masqué', () => {
    expect(maskEmail('alice@domain.com')).toBe('a***@domain.com');
    expect(maskEmail('nope')).toBe('***');
  });
});
