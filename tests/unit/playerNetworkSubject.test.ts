// Réseau joueuse : la décision « non suivi par `?as=` » est DÉCLARÉE — lot
// P15 (docs/PLAN-industrialisation-joueur.md).
//
// Découverte, suivis, face-à-face, fiche sociale, dossier d'adversaire et
// onboarding réseau sont des données personnelles et cross-tenant (opt-in
// RGPD) : le staff ne les inspecte pas. Avant P15, `withAuthRoute` IGNORAIT
// `?as=` — le staff lisait alors SES propres données en croyant inspecter.
// Désormais chaque méthode est `subject: 'self'` et `?as=<autre>` est refusé
// en 403 `subject_unsupported`, avant toute lecture.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetSupabaseMock, setAuthUser } from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import type { SubjectRouteHandler } from '../../utils/player/defineSubjectRoute';

const CALLER = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';

const NETWORK_ROUTES: Record<string, () => Promise<{ default: unknown }>> = {
  'discovery (carte)': () => import('../../pages/api/player/discovery/index'),
  'discovery/search (annuaire)': () =>
    import('../../pages/api/player/discovery/search'),
  'discovery/profile (fiche sociale)': () =>
    import('../../pages/api/player/discovery/profile'),
  'discovery/head-to-head': () =>
    import('../../pages/api/player/discovery/head-to-head'),
  follows: () => import('../../pages/api/player/follows/index'),
  scouting: () => import('../../pages/api/player/scouting'),
  'network-status': () => import('../../pages/api/player/network-status'),
  // Consentement et appareil : jamais lus ni posés par le staff.
  'push/prefs': () => import('../../pages/api/player/push/prefs'),
  'push/subscribe': () => import('../../pages/api/player/push/subscribe'),
  'push/unsubscribe': () => import('../../pages/api/player/push/unsubscribe'),
  // Le fil d'une conversation (l'inspection s'arrête à la boîte).
  'messages/[conversationId]': () =>
    import('../../pages/api/player/messages/[conversationId]'),
};

let n = 0;
function makeReq(method: string, query: Record<string, string>): any {
  n += 1;
  return {
    method,
    url: '/api/player/network',
    headers: { host: 'h', authorization: `Bearer t-network-${n}` },
    cookies: {},
    query,
    body: { followeeId: OTHER },
    socket: { remoteAddress: '127.0.0.1' },
  };
}

function makeRes(): any {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  res.end = () => res;
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: CALLER });
});

describe('réseau, préférences, fil : ?as= refusé (403) sur toutes les méthodes', () => {
  for (const [name, load] of Object.entries(NETWORK_ROUTES)) {
    it(name, async () => {
      const route = (await load()).default as SubjectRouteHandler;
      const methods = Object.entries(route.subjectRoute.methods);
      expect(methods.length).toBeGreaterThan(0);
      for (const [method, meta] of methods) {
        expect(meta!.subject, `${name} ${method}`).toBe('self');
        expect(meta!.actAs, `${name} ${method}`).toBe(false);
        const res = makeRes();
        await route(makeReq(method, { as: OTHER, act: '1' }), res);
        expect(res.statusCode, `${name} ${method}`).toBe(403);
        expect(res.body?.code, `${name} ${method}`).toBe('subject_unsupported');
      }
    });
  }

  it('`?as=<moi>` reste permis (ce n’est pas une inspection)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const route = (await import('../../pages/api/player/discovery/index'))
      .default as SubjectRouteHandler;
    const res = makeRes();
    await route(makeReq('GET', { as: CALLER }), res);
    expect(res.statusCode).not.toBe(403);
    spy.mockRestore();
  });
});

describe('ce qui SUIT le sujet (inspection staff en lecture)', () => {
  it('compteurs de la cloche et boîte de réception : GET `follow`', async () => {
    for (const load of [
      () => import('../../pages/api/player/notifications'),
      () => import('../../pages/api/player/messages'),
    ]) {
      const route = (await load()).default as SubjectRouteHandler;
      expect(route.subjectRoute.methods.GET?.subject).toBe('follow');
    }
    const inbox = (await import('../../pages/api/player/messages'))
      .default as SubjectRouteHandler;
    // L'envoi n'est jamais fait au nom d'une autre.
    expect(inbox.subjectRoute.methods.POST?.subject).toBe('self');
  });
});
