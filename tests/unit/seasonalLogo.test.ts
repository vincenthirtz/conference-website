// Tests pour les logos d'événement (Octobre rose, Noël…) :
//   - utils/seasonalLogo.ts : validation, date de Paris, choix du logo actif
//   - /api/admin/site-settings/seasonal-logos : GET / PUT / 405
//   - /api/seasonal-logo : le seul logo du jour, jamais le calendrier

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

const { logStaffActionMock } = vi.hoisted(() => ({
  logStaffActionMock: vi.fn(async () => undefined),
}));
vi.mock('@/utils/staffLogs', () => ({
  logStaffAction: logStaffActionMock,
}));

import {
  store,
  resetSupabaseMock,
  CONFERENCE_TENANT_ID,
  setAuthUser,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import {
  type SeasonalLogo,
  SEASONAL_LOGOS_SETTING_KEY,
  SeasonalLogoListSchema,
  parseSeasonalLogos,
  pickActiveSeasonalLogo,
  seasonalLogoStatus,
  todayInParis,
} from '../../utils/seasonalLogo';

import adminHandler from '../../pages/api/admin/site-settings/seasonal-logos';
import publicHandler from '../../pages/api/seasonal-logo';

function logo(over: Partial<SeasonalLogo> = {}): SeasonalLogo {
  return {
    id: 'pink',
    name: 'Octobre rose',
    url: 'https://x.supabase.co/storage/v1/object/public/teams-images/rose.png',
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    enabled: true,
    ...over,
  };
}

describe('todayInParis', () => {
  it('uses the Paris calendar day, not UTC', () => {
    // 23:30 UTC le 31 octobre = 00:30 le 1er novembre à Paris (UTC+1).
    expect(todayInParis(new Date('2026-10-31T23:30:00Z'))).toBe('2026-11-01');
    // 21:30 UTC le 31 = 22:30 à Paris : encore le 31.
    expect(todayInParis(new Date('2026-10-31T21:30:00Z'))).toBe('2026-10-31');
  });
});

describe('seasonalLogoStatus / pickActiveSeasonalLogo', () => {
  it('bounds are inclusive', () => {
    expect(seasonalLogoStatus(logo(), '2026-09-30')).toBe('scheduled');
    expect(seasonalLogoStatus(logo(), '2026-10-01')).toBe('active');
    expect(seasonalLogoStatus(logo(), '2026-10-31')).toBe('active');
    expect(seasonalLogoStatus(logo(), '2026-11-01')).toBe('ended');
  });

  it('a disabled logo is never active, even within its dates', () => {
    expect(seasonalLogoStatus(logo({ enabled: false }), '2026-10-15')).toBe(
      'disabled'
    );
    expect(
      pickActiveSeasonalLogo([logo({ enabled: false })], '2026-10-15')
    ).toBeNull();
  });

  it('returns null outside every range (default logo comes back)', () => {
    expect(pickActiveSeasonalLogo([logo()], '2026-11-02')).toBeNull();
    expect(pickActiveSeasonalLogo([], '2026-10-15')).toBeNull();
  });

  it('on overlap, the most recently started logo wins', () => {
    const halloween = logo({
      id: 'hw',
      name: 'Halloween',
      startDate: '2026-10-25',
      endDate: '2026-11-01',
    });
    expect(pickActiveSeasonalLogo([logo(), halloween], '2026-10-20')?.id).toBe(
      'pink'
    );
    expect(pickActiveSeasonalLogo([halloween, logo()], '2026-10-28')?.id).toBe(
      'hw'
    );
    expect(pickActiveSeasonalLogo([logo(), halloween], '2026-11-01')?.id).toBe(
      'hw'
    );
  });
});

describe('SeasonalLogoListSchema / parseSeasonalLogos', () => {
  it('rejects an end date before the start date', () => {
    expect(
      SeasonalLogoListSchema.safeParse([
        logo({ startDate: '2026-10-31', endDate: '2026-10-01' }),
      ]).success
    ).toBe(false);
  });

  it('rejects unsafe URLs and accepts https or site paths', () => {
    for (const url of [
      'http://evil.test/a.png',
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
      '//evil.test/a.png',
    ]) {
      expect(SeasonalLogoListSchema.safeParse([logo({ url })]).success).toBe(
        false
      );
    }
    expect(
      SeasonalLogoListSchema.safeParse([logo({ url: '/img/logos/rose.png' })])
        .success
    ).toBe(true);
  });

  it('rejects duplicate ids', () => {
    expect(SeasonalLogoListSchema.safeParse([logo(), logo()]).success).toBe(
      false
    );
  });

  it('a corrupt stored value yields an empty list, never a throw', () => {
    expect(parseSeasonalLogos(null)).toEqual([]);
    expect(parseSeasonalLogos('not-json')).toEqual([]);
    expect(parseSeasonalLogos(JSON.stringify([{ id: 'x' }]))).toEqual([]);
    expect(parseSeasonalLogos(JSON.stringify([logo()]))).toEqual([logo()]);
  });
});

// --- Routes -----------------------------------------------------------------

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

let tokenCounter = 0;
function makeReq(over: Partial<any> = {}): any {
  tokenCounter += 1;
  return {
    method: 'GET',
    headers: {
      host: 'h',
      authorization: `Bearer t-${Date.now()}-${tokenCounter}`,
    },
    query: {},
    body: {},
    socket: { remoteAddress: `10.0.0.${tokenCounter % 250}` },
    ...over,
  };
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
  };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  res.end = () => res;
  return res;
}

function storeLogos(logos: SeasonalLogo[]) {
  store.site_settings = [
    {
      tenant_id: CONFERENCE_TENANT_ID,
      key: SEASONAL_LOGOS_SETTING_KEY,
      value: JSON.stringify(logos),
      description: null,
    },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  logStaffActionMock.mockClear();
  setAuthUser({ id: 'user-1' });
  store.staff = [makeStaffRow()] as any;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-15T10:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/admin/site-settings/seasonal-logos', () => {
  it('returns an empty calendar when nothing is stored', async () => {
    const res = makeRes();
    await adminHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      logos: [],
      activeId: null,
      today: '2026-10-15',
    });
  });

  it('returns the calendar and the id live today', async () => {
    storeLogos([
      logo(),
      logo({ id: 'xmas', startDate: '2026-12-01', endDate: '2026-12-31' }),
    ]);
    const res = makeRes();
    await adminHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).logos).toHaveLength(2);
    expect((res.body as any).activeId).toBe('pink');
  });
});

describe('PUT /api/admin/site-settings/seasonal-logos', () => {
  it('400 on an invalid list, nothing written', async () => {
    const res = makeRes();
    await adminHandler(
      makeReq({
        method: 'PUT',
        body: { logos: [logo({ endDate: '2026-09-01' })] },
      }),
      res
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as any).code).toBe('invalid_body');
    expect(logStaffActionMock).not.toHaveBeenCalled();
  });

  it('persists the list for the tenant and logs it', async () => {
    const res = makeRes();
    await adminHandler(
      makeReq({ method: 'PUT', body: { logos: [logo()] } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).activeId).toBe('pink');

    const row = (store.site_settings as any[]).find(
      (r) => r.key === SEASONAL_LOGOS_SETTING_KEY
    );
    expect(row.tenant_id).toBe(CONFERENCE_TENANT_ID);
    expect(JSON.parse(row.value)).toEqual([logo()]);
    expect(logStaffActionMock).toHaveBeenCalledTimes(1);
  });

  it('an empty list is valid (back to the default logo)', async () => {
    storeLogos([logo()]);
    const res = makeRes();
    await adminHandler(makeReq({ method: 'PUT', body: { logos: [] } }), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).activeId).toBeNull();
  });

  it('405 on other methods', async () => {
    const res = makeRes();
    await adminHandler(makeReq({ method: 'DELETE' }), res);
    expect(res.statusCode).toBe(405);
  });
});

describe('GET /api/seasonal-logo', () => {
  it('returns only the logo live today, CDN-cacheable', async () => {
    storeLogos([
      logo(),
      logo({
        id: 'xmas',
        name: 'Noël',
        startDate: '2026-12-01',
        endDate: '2026-12-31',
      }),
    ]);
    const res = makeRes();
    await publicHandler(makeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      logo: { url: logo().url, name: 'Octobre rose' },
    });
    expect(String(res.headers['Cache-Control'])).toContain('s-maxage=300');
  });

  it('returns null once the event is over', async () => {
    storeLogos([logo()]);
    vi.setSystemTime(new Date('2026-11-01T08:00:00Z'));
    const res = makeRes();
    await publicHandler(makeReq(), res);
    expect(res.body).toEqual({ logo: null });
  });

  it('405 on POST', async () => {
    const res = makeRes();
    await publicHandler(makeReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });
});
