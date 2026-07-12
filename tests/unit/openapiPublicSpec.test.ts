// tests/unit/openapiPublicSpec.test.ts
//
// Coverage for the public OpenAPI derivation:
//   - filterPublicSpec (pure): keeps only /api/public/* paths + transitively
//     referenced components, drops internal (bot/admin) paths & schemas.
//   - buildPublicSpec (real docs/openapi.yaml): no internal path/scheme leaks.
//   - GET /api/public/openapi: 200 JSON + CORS, 405 on POST.

import { describe, it, expect } from 'vitest';

import {
  filterPublicSpec,
  buildPublicSpec,
  __resetPublicSpecCache,
} from '../../utils/openapi/publicSpec';
import openapiHandler from '../../pages/api/public/openapi';

// --- synthetic fixture : deterministic ref-closure -----------------------
const FIXTURE = {
  openapi: '3.1.0',
  info: { title: 'x', version: '9.9.9' },
  servers: [{ url: 'https://example.test' }],
  tags: [{ name: 'public/v1' }, { name: 'admin/matches' }],
  security: [{ BotApiKey: [] }],
  paths: {
    '/api/public/v1/things': {
      get: {
        tags: ['public/v1'],
        security: [],
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/PublicThing' },
              },
            },
          },
          '429': { $ref: '#/components/responses/RateLimited' },
        },
      },
    },
    '/api/public/v1/write': {
      post: {
        tags: ['public/v1'],
        security: [{ PublicApiToken: [] }],
        responses: { '200': { description: 'ok' } },
      },
    },
    '/api/admin/secret': {
      get: {
        tags: ['admin/matches'],
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/InternalOnly' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      // PublicThing references Nested → Nested must be pulled in transitively.
      PublicThing: {
        type: 'object',
        properties: { nested: { $ref: '#/components/schemas/Nested' } },
      },
      Nested: { type: 'object', properties: { id: { type: 'string' } } },
      InternalOnly: { type: 'object' },
    },
    responses: {
      RateLimited: { description: 'Too many requests' },
    },
    securitySchemes: {
      BotApiKey: { type: 'apiKey', in: 'header', name: 'x-api-key' },
      PublicApiToken: { type: 'http', scheme: 'bearer' },
    },
  },
};

function makeRes() {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.send = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => ((res.headers[k.toLowerCase()] = v), res);
  res.end = () => res;
  return res;
}

function makeReq(method = 'GET', query: Record<string, unknown> = {}): any {
  return {
    method,
    query,
    headers: { host: 'h' },
    socket: { remoteAddress: `127.0.0.${Math.floor(Math.random() * 200) + 1}` },
  };
}

describe('filterPublicSpec (pure)', () => {
  const out = filterPublicSpec(FIXTURE) as any;

  it('ne garde que les paths /api/public/*', () => {
    const keys = Object.keys(out.paths);
    expect(keys).toContain('/api/public/v1/things');
    expect(keys).toContain('/api/public/v1/write');
    expect(keys.every((k) => k.startsWith('/api/public/'))).toBe(true);
    expect(keys).not.toContain('/api/admin/secret');
  });

  it('tire les schémas référencés transitivement, écarte les internes', () => {
    expect(out.components.schemas.PublicThing).toBeDefined();
    expect(out.components.schemas.Nested).toBeDefined(); // transitive
    expect(out.components.schemas.InternalOnly).toBeUndefined();
    expect(out.components.responses.RateLimited).toBeDefined();
  });

  it('ne garde que les securitySchemes utilisés par un endpoint public', () => {
    expect(out.components.securitySchemes.PublicApiToken).toBeDefined();
    expect(out.components.securitySchemes.BotApiKey).toBeUndefined();
  });

  it('neutralise la security globale et ne garde que les tags utilisés', () => {
    expect(out.security).toEqual([]);
    const tagNames = (out.tags as any[]).map((t) => t.name);
    expect(tagNames).toContain('public/v1');
    expect(tagNames).not.toContain('admin/matches');
  });
});

describe('buildPublicSpec (docs/openapi.yaml réel)', () => {
  __resetPublicSpecCache();
  const spec = buildPublicSpec() as any;

  it('ne contient aucun path bot/admin/cron', () => {
    const keys = Object.keys(spec.paths);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((k) => k.startsWith('/api/public/'))).toBe(true);
    expect(keys).toContain('/api/public/v1/tournaments');
    expect(keys).toContain('/api/public/v1/leaderboard');
  });

  it('ne fuite pas le securityScheme interne BotApiKey', () => {
    const schemes = spec.components?.securitySchemes ?? {};
    expect(schemes.BotApiKey).toBeUndefined();
    expect(schemes.PublicApiToken).toBeDefined();
  });

  it('expose les schémas publics attendus', () => {
    expect(spec.components?.schemas?.PublicV1TournamentSummary).toBeDefined();
  });
});

describe('GET /api/public/openapi', () => {
  it('200 + JSON + CORS *', () => {
    const res = makeRes();
    openapiHandler(makeReq('GET'), res);
    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect((res.body as any).openapi).toBeDefined();
    expect(Object.keys((res.body as any).paths).every((k: string) => k.startsWith('/api/public/'))).toBe(true);
  });

  it('405 sur POST', () => {
    const res = makeRes();
    openapiHandler(makeReq('POST'), res);
    expect(res.statusCode).toBe(405);
  });
});
