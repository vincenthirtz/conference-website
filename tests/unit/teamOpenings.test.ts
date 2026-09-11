// Le marché miroir — « une équipe cherche une joueuse ».
//
// Ce que ces tests protègent, par ordre d'importance :
//   1. AUCUNE fuite de contact par la route publique. L'email est la
//      contrepartie du « sans compte » : le jour où un `select('*')` distrait le
//      fait sortir, rien ne casse à l'écran — d'où un test explicite.
//   2. Les NOMS DE COLONNES. Le mock Supabase de cette suite ne valide pas les
//      colonnes : un insert sur une colonne inexistante passe au vert ici et
//      casse en production (PostgREST 42703, endpoint 500). Chaque colonne
//      écrite ou sélectionnée est donc confrontée à l'instantané de schéma.
//   3. Le vocabulaire reste PARTAGÉ avec les fiches joueuses — deux listes de
//      postes qui divergent, et les deux marchés cessent de se répondre.
//   4. Les jetons de retrait des deux marchés ne sont pas interchangeables.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Captcha toujours valide : on teste le comportement métier, pas la crypto du
// challenge (couverte par ses propres tests).
vi.mock('@/utils/captcha', () => ({
  verifyCaptcha: vi.fn(() => ({ valid: true })),
}));

// Le push sortant vers le bot ne doit jamais partir en test. `vi.hoisted` est
// obligatoire : les factories de `vi.mock` sont remontées en tête de fichier.
const { emitBotEvent } = vi.hoisted(() => ({
  emitBotEvent: vi.fn(async () => ({ delivered: true, attempts: 1 })),
}));
vi.mock('@/utils/botEvents', () => ({
  emitBotEvent,
  BOT_EVENT_NAMES: [],
}));

vi.mock('@/utils/email', () => ({
  sendTeamOpeningPublishedEmail: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';

import {
  TEAM_OPENING_LEVELS,
  TEAM_OPENING_LIMITS,
  TEAM_OPENING_ROLES,
  TEAM_OPENING_SELECT,
  TEAM_OPENING_TTL_DAYS,
  computeTeamOpeningExpiresAt,
  isTeamOpeningActive,
  normalizeOpeningRoles,
  toContactTeamOpening,
  toPublicTeamOpening,
  type TeamOpeningRow,
} from '../../utils/teamOpenings';
import { FREE_PLAYER_ROLES, FREE_PLAYER_LEVELS } from '../../utils/freePlayers';
import {
  generateTeamOpeningRemovalToken,
  verifyTeamOpeningRemovalToken,
} from '../../utils/teamOpeningRemoval';
import {
  generateFreePlayerRemovalToken,
  verifyFreePlayerRemovalToken,
} from '../../utils/freePlayerRemoval';
import publicHandler from '../../pages/api/public/team-openings';
import removeHandler from '../../pages/api/public/team-openings/remove';
import contactHandler from '../../pages/api/team-openings/contact';

// --- schéma réel : la seule référence qui dise la vérité sur les colonnes ----
const SCHEMA: { tables: Record<string, string[]> } = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../database/schema-snapshot.json'),
    'utf8'
  )
);
const TEAM_OPENING_COLUMNS = new Set(SCHEMA.tables.team_openings ?? []);

let ipCounter = 0;
/** IP fraîche par requête : le bucket de rate-limit est partagé au process. */
function randomIp() {
  ipCounter += 1;
  return `10.7.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`;
}

let tokenCounter = 0;
function freshToken() {
  tokenCounter += 1;
  return `t-${Date.now()}-${tokenCounter}`;
}

function makeReq(over: Partial<any> = {}): any {
  return {
    method: 'POST',
    headers: { host: 'owwomenscup.fr', 'x-real-ip': randomIp() },
    query: {},
    body: {},
    ...over,
  };
}

function makeAuthedReq(over: Partial<any> = {}): any {
  return makeReq({
    method: 'GET',
    headers: {
      host: 'owwomenscup.fr',
      'x-real-ip': randomIp(),
      authorization: `Bearer ${freshToken()}`,
    },
    ...over,
  });
}

function makeRes(): any {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

const VALID_BODY = {
  teamName: 'Nova Esport',
  // Le nom de champ qu'envoie réellement le formulaire public.
  contactEmail: 'Capitaine@Gmail.com',
  roles: ['support', 'tank'],
  level: 'gold',
  availability: 'en semaine après 20h',
  note: 'on vise le prochain tournoi',
  contactDiscord: 'nova#1234',
  captchaToken: 'tok',
  captchaAnswer: '4',
};

function row(over: Partial<TeamOpeningRow> = {}): TeamOpeningRow {
  return {
    id: 'row-1',
    source: 'web',
    team_id: null,
    team_name: 'Nova Esport',
    roles: ['support'],
    level: 'gold',
    availability: 'le soir',
    note: null,
    contact_email: 'capitaine@gmail.com',
    contact_discord: 'nova#1234',
    marked_at: '2026-09-01T10:00:00.000Z',
    expires_at: null,
    ...over,
  };
}

beforeEach(() => {
  resetSupabaseMock();
  emitBotEvent.mockClear();
  setAuthUser(null);
});

// ---------------------------------------------------------------------------
// Vocabulaire : partagé, pas recopié
// ---------------------------------------------------------------------------

describe('vocabulaire', () => {
  it('réutilise EXACTEMENT les postes et niveaux des fiches joueuses', () => {
    // Identité de référence, et pas simple égalité de contenu : c'est ce qui
    // empêche une copie de diverger silencieusement plus tard.
    expect(TEAM_OPENING_ROLES).toBe(FREE_PLAYER_ROLES);
    expect(TEAM_OPENING_LEVELS).toBe(FREE_PLAYER_LEVELS);
    // L'échelle contient bien le rang ajouté après coup.
    expect(TEAM_OPENING_LEVELS).toContain('emerald');
  });

  it('borne la saisie', () => {
    expect(TEAM_OPENING_LIMITS.teamName).toBeGreaterThan(0);
    expect(TEAM_OPENING_TTL_DAYS).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// Colonnes : le garde-fou que le mock ne fournit pas
// ---------------------------------------------------------------------------

describe('colonnes réelles', () => {
  it('le SELECT partagé ne cite que des colonnes existantes', () => {
    expect(TEAM_OPENING_COLUMNS.size).toBeGreaterThan(0);
    const cited = TEAM_OPENING_SELECT.split(',').map((c) => c.trim());
    const inconnues = cited.filter((c) => !TEAM_OPENING_COLUMNS.has(c));
    expect(inconnues).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Projections
// ---------------------------------------------------------------------------

describe('toPublicTeamOpening', () => {
  it('ne laisse sortir AUCUN moyen de contact', () => {
    const projected = toPublicTeamOpening(row());
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain('capitaine@gmail.com');
    expect(serialized).not.toContain('nova#1234');
    expect(projected).not.toHaveProperty('contact');
    expect(projected).not.toHaveProperty('contact_email');
  });

  it('projette ce qui aide une joueuse à décider', () => {
    expect(toPublicTeamOpening(row())).toEqual({
      id: 'row-1',
      teamName: 'Nova Esport',
      roles: ['support'],
      level: 'gold',
      availability: 'le soir',
      note: null,
      since: '2026-09-01T10:00:00.000Z',
    });
  });

  it('écarte une annonce sans nom d’équipe affichable', () => {
    expect(toPublicTeamOpening(row({ team_name: null }))).toBeNull();
    expect(toPublicTeamOpening(row({ team_name: '   ' }))).toBeNull();
  });

  it('ignore un niveau inconnu plutôt que de le propager', () => {
    expect(toPublicTeamOpening(row({ level: 'radiant' }))?.level).toBeNull();
  });
});

describe('toContactTeamOpening', () => {
  it('ajoute les coordonnées — et elles seules', () => {
    expect(toContactTeamOpening(row({ team_id: 'team-9' }))).toEqual({
      id: 'row-1',
      teamName: 'Nova Esport',
      roles: ['support'],
      level: 'gold',
      availability: 'le soir',
      note: null,
      since: '2026-09-01T10:00:00.000Z',
      teamId: 'team-9',
      contact: { email: 'capitaine@gmail.com', discord: 'nova#1234' },
    });
  });
});

describe('normalizeOpeningRoles', () => {
  it('filtre l’inconnu, déduplique et impose l’ordre canonique', () => {
    expect(
      normalizeOpeningRoles(['support', 'jungle', 'tank', 'support'])
    ).toEqual(['tank', 'support']);
    expect(normalizeOpeningRoles(null)).toEqual([]);
  });
});

describe('péremption', () => {
  it('place la limite à 60 jours', () => {
    const from = new Date('2026-09-12T12:00:00.000Z');
    const diffDays =
      (new Date(computeTeamOpeningExpiresAt(from)).getTime() - from.getTime()) /
      86_400_000;
    expect(Math.round(diffDays)).toBe(TEAM_OPENING_TTL_DAYS);
  });

  it('une annonce dépassée est inactive', () => {
    const now = new Date('2026-09-12T12:00:00.000Z');
    expect(
      isTeamOpeningActive(row({ expires_at: '2026-09-11T12:00:00.000Z' }), now)
    ).toBe(false);
    expect(
      isTeamOpeningActive(row({ expires_at: '2026-09-13T12:00:00.000Z' }), now)
    ).toBe(true);
    expect(isTeamOpeningActive(row({ expires_at: null }), now)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Route publique
// ---------------------------------------------------------------------------

describe('GET /api/public/team-openings', () => {
  it('anonymise : ni email ni pseudo Discord dans la réponse', async () => {
    store.team_openings = [
      { ...row(), tenant_id: CONFERENCE_TENANT_ID },
    ] as any[];

    const res = makeRes();
    await publicHandler(makeReq({ method: 'GET' }), res);

    expect(res.statusCode).toBe(200);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('capitaine@gmail.com');
    expect(serialized).not.toContain('nova#1234');
    expect(res.body.openings).toHaveLength(1);
    expect(res.body.openings[0].teamName).toBe('Nova Esport');
    expect(res.body.count).toBe(1);
  });

  it('exclut les annonces périmées', async () => {
    store.team_openings = [
      {
        ...row({ id: 'old', expires_at: '2020-01-01T00:00:00.000Z' }),
        tenant_id: CONFERENCE_TENANT_ID,
      },
      { ...row({ id: 'fresh' }), tenant_id: CONFERENCE_TENANT_ID },
    ] as any[];

    const res = makeRes();
    await publicHandler(makeReq({ method: 'GET' }), res);
    expect(res.body.openings.map((o: any) => o.id)).toEqual(['fresh']);
  });

  it('se cache une minute au CDN', async () => {
    store.team_openings = [];
    const res = makeRes();
    await publicHandler(makeReq({ method: 'GET' }), res);
    expect(String(res.headers['Cache-Control'])).toContain('s-maxage=60');
  });

  it('405 sur une méthode non supportée', async () => {
    const res = makeRes();
    await publicHandler(makeReq({ method: 'DELETE' }), res);
    expect(res.statusCode).toBe(405);
  });
});

describe('POST /api/public/team-openings', () => {
  it('publie une annonce SANS compte et n’écrit que des colonnes réelles', async () => {
    store.team_openings = [];
    const res = makeRes();
    await publicHandler(makeReq({ body: { ...VALID_BODY } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true });

    const rows = store.team_openings as any[];
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('web');
    expect(rows[0].team_name).toBe('Nova Esport');
    // Email normalisé (la clé fonctionnelle de la re-publication).
    expect(rows[0].contact_email).toBe('capitaine@gmail.com');
    // Ordre canonique appliqué, pas l'ordre de saisie.
    expect(rows[0].roles).toEqual(['tank', 'support']);
    expect(rows[0].expires_at).toBeTruthy();
    // Annonce publiée sans compte : aucune équipe du site n'est liée.
    expect(rows[0].team_id ?? null).toBeNull();

    // LE test qui compte : le mock accepterait n'importe quel nom de colonne.
    const inconnues = Object.keys(rows[0]).filter(
      (c) => c !== 'id' && !TEAM_OPENING_COLUMNS.has(c)
    );
    expect(inconnues).toEqual([]);
  });

  it('prévient les joueuses via un event bot, sans coordonnées', async () => {
    store.team_openings = [];
    await publicHandler(makeReq({ body: { ...VALID_BODY } }), makeRes());

    expect(emitBotEvent).toHaveBeenCalledTimes(1);
    const [event, payload] = emitBotEvent.mock.calls[0] as any[];
    expect(event).toBe('team_opening.published');
    expect(payload.teamName).toBe('Nova Esport');
    expect(payload.roles).toEqual(['tank', 'support']);
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain('capitaine@gmail.com');
    expect(serialized).not.toContain('nova#1234');
  });

  it('rejette une annonce sans poste recherché', async () => {
    const res = makeRes();
    await publicHandler(makeReq({ body: { ...VALID_BODY, roles: [] } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('VALIDATION');
  });

  it('rejette un email jetable sans dire pourquoi', async () => {
    const res = makeRes();
    await publicHandler(
      makeReq({ body: { ...VALID_BODY, contactEmail: 'x@yopmail.com' } }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).not.toMatch(/jetable|disposable/i);
  });

  it('accepte aussi « email », le nom de champ des fiches joueuses', async () => {
    // Deux formulaires voisins, deux noms de champ : un client écrit en
    // recopiant celui de /rejoindre ne doit pas se faire refuser en silence.
    store.team_openings = [];
    const { contactEmail: _drop, ...sansContactEmail } = VALID_BODY;
    void _drop;

    const res = makeRes();
    await publicHandler(
      makeReq({ body: { ...sansContactEmail, email: 'Capitaine@Gmail.com' } }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect((store.team_openings as any[])[0].contact_email).toBe(
      'capitaine@gmail.com'
    );
  });

  it('refuse une annonce sans aucune adresse : ni contact ni porte de sortie', async () => {
    const { contactEmail: _drop, ...sansEmail } = VALID_BODY;
    void _drop;

    const res = makeRes();
    await publicHandler(makeReq({ body: sansEmail }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('VALIDATION');
  });

  it('avale silencieusement un honeypot rempli', async () => {
    store.team_openings = [];
    const res = makeRes();
    await publicHandler(
      makeReq({ body: { ...VALID_BODY, honeypot: 'bot' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(store.team_openings as any[]).toHaveLength(0);
    expect(emitBotEvent).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Retrait : la porte de sortie
// ---------------------------------------------------------------------------

describe('retrait autonome', () => {
  it('les jetons des deux marchés ne sont PAS interchangeables', () => {
    const opening = generateTeamOpeningRemovalToken('annonce-1');
    const player = generateFreePlayerRemovalToken('fiche-1');

    expect(verifyTeamOpeningRemovalToken(opening)).toBe('annonce-1');
    expect(verifyFreePlayerRemovalToken(player)).toBe('fiche-1');
    // Un lien de retrait de fiche joueuse ne doit pas pouvoir supprimer une
    // annonce d'équipe, ni l'inverse.
    expect(verifyTeamOpeningRemovalToken(player)).toBeNull();
    expect(verifyFreePlayerRemovalToken(opening)).toBeNull();
  });

  it('résiste à l’altération', () => {
    const good = generateTeamOpeningRemovalToken('annonce-1');
    const [payload, sig] = good.split('.');
    expect(verifyTeamOpeningRemovalToken(`${payload}.zzzz`)).toBeNull();

    const forged = Buffer.from(
      JSON.stringify({ o: 'annonce-2', v: 1 }),
      'utf8'
    ).toString('base64url');
    expect(verifyTeamOpeningRemovalToken(`${forged}.${sig}`)).toBeNull();

    for (const junk of ['', 'sans-point', '.', 'a.']) {
      expect(verifyTeamOpeningRemovalToken(junk)).toBeNull();
    }
  });

  it('GET décrit l’annonce sans rien supprimer', async () => {
    store.team_openings = [
      { ...row({ id: 'annonce-1' }), tenant_id: CONFERENCE_TENANT_ID },
    ] as any[];

    const res = makeRes();
    await removeHandler(
      makeReq({
        method: 'GET',
        query: { token: generateTeamOpeningRemovalToken('annonce-1') },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ teamName: 'Nova Esport' });
    // Les clients mail pré-visitent les liens : un GET ne doit JAMAIS supprimer.
    expect(store.team_openings as any[]).toHaveLength(1);
  });

  it('POST retire l’annonce', async () => {
    store.team_openings = [
      { ...row({ id: 'annonce-1' }), tenant_id: CONFERENCE_TENANT_ID },
      { ...row({ id: 'annonce-2' }), tenant_id: CONFERENCE_TENANT_ID },
    ] as any[];

    const res = makeRes();
    await removeHandler(
      makeReq({
        method: 'POST',
        body: { token: generateTeamOpeningRemovalToken('annonce-1') },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect((store.team_openings as any[]).map((r) => r.id)).toEqual([
      'annonce-2',
    ]);
  });

  it('refuse un token invalide sans révéler quoi que ce soit', async () => {
    store.team_openings = [
      { ...row({ id: 'annonce-1' }), tenant_id: CONFERENCE_TENANT_ID },
    ] as any[];

    const bad = makeRes();
    await removeHandler(
      makeReq({ method: 'POST', body: { token: 'nawak' } }),
      bad
    );
    expect(bad.statusCode).toBe(400);

    // Annonce inexistante : MÊME message qu'un token invalide, sinon la route
    // devient un oracle permettant de tester quels ids existent encore.
    const missing = makeRes();
    await removeHandler(
      makeReq({
        method: 'POST',
        body: { token: generateTeamOpeningRemovalToken('jamais-existe') },
      }),
      missing
    );
    expect(missing.statusCode).toBe(404);
    expect(missing.body.error).toBe(bad.body.error);

    expect(store.team_openings as any[]).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Coordonnées : derrière un compte, et rien d'autre
// ---------------------------------------------------------------------------

describe('GET /api/team-openings/contact', () => {
  const OPENING_ID = '11111111-2222-4333-8444-555555555555';

  function seedOpening(over: Partial<TeamOpeningRow> = {}) {
    store.team_openings = [
      {
        ...row({ id: OPENING_ID, ...over }),
        tenant_id: CONFERENCE_TENANT_ID,
      },
    ] as any[];
  }

  it('401 sans jeton : les coordonnées ne sont pas publiques', async () => {
    seedOpening();
    const res = makeRes();
    await contactHandler(
      makeReq({ method: 'GET', query: { id: OPENING_ID } }),
      res
    );
    expect(res.statusCode).toBe(401);
    expect(JSON.stringify(res.body)).not.toContain('capitaine@gmail.com');
  });

  it('livre les coordonnées à une personne connectée', async () => {
    seedOpening();
    setAuthUser({ id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' });

    const res = makeRes();
    await contactHandler(makeAuthedReq({ query: { id: OPENING_ID } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.opening.contact).toEqual({
      email: 'capitaine@gmail.com',
      discord: 'nova#1234',
    });
    // Et jamais de cache sur un corps qui contient des coordonnées.
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('404 sur une annonce périmée — comme sur une annonce inexistante', async () => {
    seedOpening({ expires_at: '2020-01-01T00:00:00.000Z' });
    setAuthUser({ id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' });

    const expired = makeRes();
    await contactHandler(makeAuthedReq({ query: { id: OPENING_ID } }), expired);
    expect(expired.statusCode).toBe(404);

    const missing = makeRes();
    await contactHandler(
      makeAuthedReq({
        query: { id: '99999999-8888-4777-8666-555555555555' },
      }),
      missing
    );
    expect(missing.statusCode).toBe(404);
    expect(missing.body.error).toBe(expired.body.error);
  });

  it('400 sur un identifiant qui n’est pas un uuid', async () => {
    seedOpening();
    setAuthUser({ id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' });

    const res = makeRes();
    await contactHandler(makeAuthedReq({ query: { id: 'nawak' } }), res);
    expect(res.statusCode).toBe(400);
  });

  it('405 sur autre chose qu’un GET', async () => {
    setAuthUser({ id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' });
    const res = makeRes();
    await contactHandler(
      makeAuthedReq({ method: 'POST', query: { id: OPENING_ID } }),
      res
    );
    expect(res.statusCode).toBe(405);
  });
});
