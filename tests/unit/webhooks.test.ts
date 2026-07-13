// tests/unit/webhooks.test.ts
//
// Pure-helper coverage for utils/webhooks.ts (no DB):
//   - isWebhookableEvent / eventMatchesSubscription (incl. '*' + non-webhookable
//     never leaks)
//   - parseWebhookEventTypes (valid / wildcard / invalid / empty)
//   - signWebhookBody (deterministic HMAC) + buildWebhookHeaders
//   - generateWebhookSecret shape

import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

import {
  isWebhookableEvent,
  eventMatchesSubscription,
  parseWebhookEventTypes,
  signWebhookBody,
  buildWebhookHeaders,
  generateWebhookSecret,
  WEBHOOK_EVENT_TYPES,
} from '../../utils/webhooks';

describe('isWebhookableEvent', () => {
  it('accepts allowlisted events, rejects internal ones', () => {
    expect(isWebhookableEvent('match.finished')).toBe(true);
    expect(isWebhookableEvent('tournament.finalized')).toBe(true);
    // internal Discord-ops events are NOT webhookable
    expect(isWebhookableEvent('team.member.added')).toBe(false);
    expect(isWebhookableEvent('cast.assigned')).toBe(false);
    expect(isWebhookableEvent('nonsense')).toBe(false);
  });
});

describe('eventMatchesSubscription', () => {
  it('matches by exact name', () => {
    expect(eventMatchesSubscription('match.finished', ['match.finished'])).toBe(true);
    expect(eventMatchesSubscription('match.finished', ['news.published'])).toBe(false);
  });

  it("'*' matches any webhookable event but never a non-webhookable one", () => {
    expect(eventMatchesSubscription('match.finished', ['*'])).toBe(true);
    expect(eventMatchesSubscription('tournament.finalized', ['*'])).toBe(true);
    // '*' must not leak internal events
    expect(eventMatchesSubscription('team.member.added', ['*'])).toBe(false);
  });
});

describe('parseWebhookEventTypes', () => {
  it('accepts a valid subset', () => {
    const r = parseWebhookEventTypes(['match.finished', 'news.published', 'match.finished']);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.types).toEqual(['match.finished', 'news.published']); // deduped
  });

  it("accepts the '*' wildcard alone", () => {
    const r = parseWebhookEventTypes(['*']);
    expect(r).toEqual({ ok: true, types: ['*'] });
  });

  it('rejects unknown events and empty input', () => {
    const bad = parseWebhookEventTypes(['match.finished', 'not.a.real.event']);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.invalid).toContain('not.a.real.event');
    expect(parseWebhookEventTypes([]).ok).toBe(false);
    expect(parseWebhookEventTypes('nope').ok).toBe(false);
  });
});

describe('signWebhookBody + buildWebhookHeaders', () => {
  it('produces a deterministic HMAC-SHA256 hex matching crypto', () => {
    const secret = 'whsec_test';
    const body = '{"a":1}';
    const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
    expect(signWebhookBody(secret, body)).toBe(expected);
  });

  it('builds signed headers with the sha256= prefix', () => {
    const headers = buildWebhookHeaders({
      secret: 'whsec_test',
      rawBody: '{"a":1}',
      eventName: 'match.finished',
      eventId: 'evt-1',
      tenantId: 'tnt-1',
    });
    expect(headers['X-Webhook-Event']).toBe('match.finished');
    expect(headers['X-Webhook-Id']).toBe('evt-1');
    expect(headers['X-Tenant-Id']).toBe('tnt-1');
    expect(headers['X-Webhook-Signature']).toMatch(/^sha256=[0-9a-f]{64}$/);
  });
});

describe('generateWebhookSecret', () => {
  it('is prefixed and unguessable', () => {
    const a = generateWebhookSecret();
    const b = generateWebhookSecret();
    expect(a).toMatch(/^whsec_[0-9a-f]{48}$/);
    expect(a).not.toBe(b);
  });
});

describe('WEBHOOK_EVENT_TYPES', () => {
  it('does not include internal Discord-ops events', () => {
    for (const internal of ['team.member.added', 'cast.assigned', 'staff.role.changed']) {
      expect(WEBHOOK_EVENT_TYPES).not.toContain(internal as never);
    }
  });
});
