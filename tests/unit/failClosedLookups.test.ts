// Lectures qui échouent FERMÉ plutôt que de décider à l'aveugle.
// Targets: utils/tenant.ts, utils/botEvents.ts
//
// CE QUE CES TESTS PROTÈGENT — audit du 2026-09-12, dans la foulée de
// l'incident du miroir social. Trois lectures rendaient la même valeur pour
// « pas trouvé » et pour « pas pu lire », et l'appelant appliquait un repli par
// défaut dans les deux cas — c'est-à-dire qu'il DÉCIDAIT sur une ignorance :
//
//   - guilde → tenant : l'échec faisait retomber sur l'en-tête `x-tenant-id`,
//     inversant la précédence posée par le code (la guilde, donnée que nous
//     possédons, l'emporte sur une affirmation du client) ;
//   - hôte → tenant : l'échec finissait sur `DEFAULT_TENANT_ID`, donc servait
//     les données de l'association à la requête d'un autre espace ;
//   - écriture outbox : l'échec était silencieux, alors que l'outbox est le
//     canal de livraison réel (le push direct échoue en 401 sur ce
//     déploiement). L'événement disparaissait sans trace.
//
// Le mock Supabase partagé ne sait pas produire d'erreur de lecture : d'où ce
// mock local, dont on pilote chaque réponse.
//
// ⚠️ Fabriques EN LIGNE et dupliquées à dessein : `vi.mock` est hissé, et les
// deux orthographes du module (`@/utils/supabase` et le chemin relatif) sont
// résolues séparément par la configuration de test.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db } = vi.hoisted(() => ({
  db: {
    // Réponse rendue pour chaque table interrogée.
    byTable: {} as Record<string, { data: unknown; error: unknown }>,
    calls: [] as string[],
  },
}));

function buildClient() {
  const chain = (table: string) => {
    db.calls.push(table);
    const result = () => db.byTable[table] ?? { data: null, error: null };
    const api: Record<string, unknown> = {
      select: () => api,
      eq: () => api,
      not: () => api,
      insert: () => api,
      maybeSingle: () => Promise.resolve(result()),
      // Rend la chaîne « awaitable » : `resolveTenantByHostResult` termine sur
      // `.not(...)` sans `.maybeSingle()`.
      then: (
        onFulfilled: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown
      ) => Promise.resolve(result()).then(onFulfilled, onRejected),
    };
    return api;
  };
  return { supabaseAdmin: { from: chain }, getServerClient: () => ({}) };
}

vi.mock('@/utils/supabase', () => buildClient());
vi.mock('../../utils/supabase', () => buildClient());

import {
  __resetTenantLookupCachesForTests,
  resolveGuildTenant,
  resolveTenantByHostResult,
} from '../../utils/tenant';
import { emitBotEvent } from '../../utils/botEvents';

const GUILD = '1486719313116401755';
const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const TIMEOUT = { message: 'canceling statement due to statement timeout' };

/** Hôte unique par test : les résolutions par hôte sont mises en cache 60 s. */
let hostSeq = 0;
const nextHost = () => `club-${++hostSeq}.exemple.test`;

beforeEach(() => {
  db.byTable = {};
  db.calls = [];
  __resetTenantLookupCachesForTests();
});

describe('resolveGuildTenant', () => {
  it('rend le tenant propriétaire quand la lecture aboutit', async () => {
    db.byTable.discord_guilds = { data: { tenant_id: TENANT }, error: null };
    expect(await resolveGuildTenant(GUILD)).toEqual({
      ok: true,
      tenantId: TENANT,
    });
  });

  it('distingue « guilde non liée » — succès, sans tenant', async () => {
    db.byTable.discord_guilds = { data: null, error: null };
    expect(await resolveGuildTenant(GUILD)).toEqual({
      ok: true,
      tenantId: null,
    });
  });

  it('signale un ÉCHEC DE LECTURE au lieu de le faire passer pour non liée', async () => {
    // C'est ce `ok: false` qui empêche l'appelant de retomber sur
    // `x-tenant-id`, donc d'agir pour le mauvais espace.
    db.byTable.discord_guilds = { data: null, error: TIMEOUT };
    expect(await resolveGuildTenant(GUILD)).toEqual({
      ok: false,
      error: TIMEOUT.message,
    });
  });
});

describe('resolveTenantByHostResult', () => {
  it("n'interroge PAS la base pour un hôte de la plateforme", async () => {
    // C'est ce qui rend le chemin d'échec très étroit : le trafic normal et les
    // previews Netlify ne lisent jamais la table.
    for (const host of [
      'owwomenscup.fr',
      'work--owwomenscup.netlify.app',
      'localhost',
    ]) {
      expect(await resolveTenantByHostResult(host)).toEqual({
        ok: true,
        tenantId: null,
      });
    }
    expect(db.calls.filter((t) => t === 'tenants')).toHaveLength(0);
  });

  it('rend `ok` sans tenant pour un hôte étranger inconnu', async () => {
    db.byTable.tenants = { data: [], error: null };
    expect(await resolveTenantByHostResult(nextHost())).toEqual({
      ok: true,
      tenantId: null,
    });
  });

  it('signale un ÉCHEC DE LECTURE plutôt que de rendre « inconnu »', async () => {
    // Rendre « inconnu » ferait finir la cascade sur DEFAULT_TENANT_ID : la
    // requête d'un espace serait servie avec les données de l'association.
    db.byTable.tenants = { data: null, error: TIMEOUT };
    expect(await resolveTenantByHostResult(nextHost())).toEqual({
      ok: false,
      error: TIMEOUT.message,
    });
  });
});

describe('emitBotEvent — écriture outbox impossible', () => {
  it('signale un événement PERDU quand ni l’outbox ni le push n’aboutissent', async () => {
    // Sans URL de webhook, le push ne part pas ; l'outbox est donc le seul
    // canal, et son échec signifie la perte de l'événement.
    vi.stubEnv('BOT_WEBHOOK_URL', '');
    db.byTable.bot_event_outbox = { data: null, error: TIMEOUT };

    const res = await emitBotEvent('social.mirror', { hello: 'world' }, TENANT);

    expect(res.delivered).toBe(false);
    expect(res.error).toMatch(/^event_lost:/);
    vi.unstubAllEnvs();
  });

  it('traite une violation d’unicité comme un succès, pas comme une perte', async () => {
    // 23505 = la tentative précédente avait bien écrit malgré son erreur (un
    // 504 est un timeout de passerelle, pas forcément un échec de commit). La
    // ligne existe, l'événement n'est pas perdu.
    vi.stubEnv('BOT_WEBHOOK_URL', '');
    db.byTable.bot_event_outbox = {
      data: null,
      error: { code: '23505', message: 'duplicate key' },
    };

    const res = await emitBotEvent('social.mirror', { hello: 'world' }, TENANT);

    expect(res.error).not.toMatch(/^event_lost:/);
    vi.unstubAllEnvs();
  });
});
