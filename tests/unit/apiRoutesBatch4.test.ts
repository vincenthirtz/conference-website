import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StaffMember } from '../../types/staff';

const { sendAccountDeletedEmail } = vi.hoisted(() => ({
  sendAccountDeletedEmail: vi.fn(async () => undefined),
}));
vi.mock('@/utils/email', () => ({ sendAccountDeletedEmail }));

const { logStaffActionMock } = vi.hoisted(() => ({
  logStaffActionMock: vi.fn(async () => undefined),
}));
// The handlers under test only use `logStaffAction`; stub the module minimally
// so we don't trigger the real one.
vi.mock('@/utils/staffLogs', () => ({
  logStaffAction: logStaffActionMock,
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  supabaseAdmin,
} from './__helpers__/supabaseMock';

import { invalidateStaffCache } from '../../utils/staff';

import siteSettingsKeyHandler from '../../pages/api/admin/site-settings/[key]';
import adminNewsHandler from '../../pages/api/admin/news/index';
import deleteAccountHandler from '../../pages/api/player/delete-account';
import updateProfileHandler from '../../pages/api/player/update-profile';
import teamsMembersHandler from '../../pages/api/teams/[teamId]/members';

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

function makeStaffRow(
  role: 'owner' | 'admin' | 'caster' = 'admin'
): StaffMember {
  return {
    id: 'staff-1',
    auth_user_id: 'user-1',
    email: 'a@a.com',
    role,
    display_name: null,
    avatar_url: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

let _tokenCounter = 0;
function freshBearer() {
  _tokenCounter += 1;
  return `Bearer t-${Date.now()}-${_tokenCounter}`;
}

function makeReq(over: Partial<any> = {}, includeAuth = false): any {
  const headers: Record<string, string> = { host: 'h' };
  if (includeAuth) headers.authorization = freshBearer();
  return {
    method: 'GET',
    headers,
    query: {},
    body: {},
    ...over,
  };
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
    ended: false,
  };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => ((res.ended = true), res);
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  sendAccountDeletedEmail.mockClear();
  logStaffActionMock.mockClear();
});

/* -----------------------------------------------------------
 * /api/admin/site-settings/[key]
 * ---------------------------------------------------------*/

describe('/api/admin/site-settings/[key]', () => {
  beforeEach(() => {
    setAuthUser({ id: 'user-1' });
    store.staff = [makeStaffRow('admin')] as any;
  });

  it('returns 400 when key is missing', async () => {
    const res = makeRes();
    await siteSettingsKeyHandler(
      makeReq({ method: 'GET', query: {} }, true),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('GET 200 returns the matching setting', async () => {
    store.site_settings = [
      { key: 'maintenance', value: false, description: null },
    ] as any;
    const res = makeRes();
    await siteSettingsKeyHandler(
      makeReq({ method: 'GET', query: { key: 'maintenance' } }, true),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((res.body as any).key).toBe('maintenance');
  });

  it('GET 404 when key does not exist', async () => {
    store.site_settings = [];
    const res = makeRes();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await siteSettingsKeyHandler(
      makeReq({ method: 'GET', query: { key: 'unknown' } }, true),
      res
    );
    consoleSpy.mockRestore();
    expect(res.statusCode).toBe(404);
  });

  it('PATCH 400 when value is undefined', async () => {
    store.site_settings = [{ key: 'maintenance', value: false }] as any;
    const res = makeRes();
    await siteSettingsKeyHandler(
      makeReq(
        { method: 'PATCH', query: { key: 'maintenance' }, body: {} },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('PATCH 200 updates the value and logs the action', async () => {
    store.site_settings = [
      { key: 'maintenance', value: false, description: null },
    ] as any;
    const res = makeRes();
    await siteSettingsKeyHandler(
      makeReq(
        {
          method: 'PATCH',
          query: { key: 'maintenance' },
          body: { value: true, description: '  on  ' },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(200);
    expect((store.site_settings as any)[0].value).toBe(true);
    expect((store.site_settings as any)[0].description).toBe('on');
    expect(logStaffActionMock).toHaveBeenCalledOnce();
  });

  it('DELETE 204 removes the row and logs', async () => {
    store.site_settings = [{ key: 'k1', value: 1 }] as any;
    const res = makeRes();
    await siteSettingsKeyHandler(
      makeReq({ method: 'DELETE', query: { key: 'k1' } }, true),
      res
    );
    expect(res.statusCode).toBe(204);
    expect(store.site_settings.length).toBe(0);
    expect(logStaffActionMock).toHaveBeenCalledOnce();
  });

  it('returns 405 on unsupported method', async () => {
    const res = makeRes();
    await siteSettingsKeyHandler(
      makeReq({ method: 'POST', query: { key: 'k1' } }, true),
      res
    );
    expect(res.statusCode).toBe(405);
  });
});

/* -----------------------------------------------------------
 * /api/admin/news (GET + POST)
 * ---------------------------------------------------------*/

describe('/api/admin/news', () => {
  beforeEach(() => {
    setAuthUser({ id: 'user-1' });
    store.staff = [makeStaffRow('admin')] as any;
  });

  it('GET 200 returns articles', async () => {
    store.news = [
      { id: 'n1', title: 'Hello', status: 'published', tag: 'general' },
      { id: 'n2', title: 'Draft', status: 'draft', tag: 'general' },
    ] as any;
    const res = makeRes();
    await adminNewsHandler(makeReq({ method: 'GET' }, true), res);
    expect(res.statusCode).toBe(200);
    expect((res.body as any).items).toHaveLength(2);
  });

  it('GET ?status=published filters by status', async () => {
    store.news = [
      { id: 'n1', status: 'published', tag: 'general' },
      { id: 'n2', status: 'draft', tag: 'general' },
    ] as any;
    const res = makeRes();
    await adminNewsHandler(
      makeReq({ method: 'GET', query: { status: 'published' } }, true),
      res
    );
    expect((res.body as any).items.map((i: any) => i.id)).toEqual(['n1']);
  });

  it('GET ?tag=foo normalizes the tag and filters', async () => {
    store.news = [
      { id: 'n1', tag: 'esport-news' },
      { id: 'n2', tag: 'general' },
    ] as any;
    const res = makeRes();
    await adminNewsHandler(
      makeReq({ method: 'GET', query: { tag: 'Esport News' } }, true),
      res
    );
    expect((res.body as any).items.map((i: any) => i.id)).toEqual(['n1']);
  });

  it('POST 400 when title or content is missing', async () => {
    const res = makeRes();
    await adminNewsHandler(
      makeReq({ method: 'POST', body: { title: 'Only title' } }, true),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('POST 201 creates an article and slugifies the title', async () => {
    const res = makeRes();
    await adminNewsHandler(
      makeReq(
        {
          method: 'POST',
          body: {
            title: 'Hello World!',
            content: 'Body',
            status: 'published',
          },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(201);
    const inserted = (store.news as any)[0];
    expect(inserted.slug).toBe('hello-world');
    expect(inserted.published_at).toBeTruthy();
    expect(inserted.tag).toBe('general'); // default
  });

  it('POST keeps published_at=null for draft status', async () => {
    const res = makeRes();
    await adminNewsHandler(
      makeReq(
        {
          method: 'POST',
          body: { title: 'Draft', content: 'Body', status: 'draft' },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(201);
    expect((store.news as any)[0].published_at).toBeNull();
  });

  it('returns 405 on unsupported method', async () => {
    const res = makeRes();
    await adminNewsHandler(makeReq({ method: 'PATCH' }, true), res);
    expect(res.statusCode).toBe(405);
  });
});

/* -----------------------------------------------------------
 * /api/player/delete-account
 * ---------------------------------------------------------*/

describe('DELETE /api/player/delete-account', () => {
  it('returns 405 on non-DELETE', async () => {
    setAuthUser({ id: 'user-1' });
    const res = makeRes();
    await deleteAccountHandler(makeReq({ method: 'POST' }, true), res);
    expect(res.statusCode).toBe(405);
  });

  it('returns 401 with no token', async () => {
    const res = makeRes();
    await deleteAccountHandler(makeReq({ method: 'DELETE' }), res);
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when token does not resolve', async () => {
    setAuthUser(null);
    const res = makeRes();
    await deleteAccountHandler(makeReq({ method: 'DELETE' }, true), res);
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 for owner accounts', async () => {
    setAuthUser({ id: 'user-1', email: 'owner@a.com' });
    store.staff = [makeStaffRow('owner')] as any;
    const res = makeRes();
    await deleteAccountHandler(makeReq({ method: 'DELETE' }, true), res);
    expect(res.statusCode).toBe(403);
  });

  it('200 removes staff/team_members/demandes and calls auth deleteUser', async () => {
    setAuthUser({ id: 'user-1', email: 'me@a.com' });
    store.staff = [makeStaffRow('admin')] as any;
    store.team_members = [
      { id: 'tm1', user_id: 'user-1', team_id: 't1' },
      { id: 'tm2', user_id: 'user-2', team_id: 't1' },
    ] as any;
    store.demandes = [{ id: 'd1', user_id: 'user-1' }] as any;

    const deleteUserSpy = vi.spyOn(supabaseAdmin.auth.admin, 'deleteUser');
    const res = makeRes();
    await deleteAccountHandler(makeReq({ method: 'DELETE' }, true), res);

    expect(res.statusCode).toBe(200);
    expect(store.staff.length).toBe(0);
    expect(store.team_members.length).toBe(1); // user-2 remains
    expect(store.demandes.length).toBe(0);
    expect(deleteUserSpy).toHaveBeenCalledWith('user-1');
    deleteUserSpy.mockRestore();
  });

  it('500 when auth deleteUser fails', async () => {
    setAuthUser({ id: 'user-1', email: 'me@a.com' });
    store.staff = [];
    store.team_members = [];
    store.demandes = [];

    const deleteUserSpy = vi
      .spyOn(supabaseAdmin.auth.admin, 'deleteUser')
      .mockResolvedValueOnce({
        data: null as any,
        error: { message: 'boom' } as any,
      });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = makeRes();
    await deleteAccountHandler(makeReq({ method: 'DELETE' }, true), res);

    consoleSpy.mockRestore();
    deleteUserSpy.mockRestore();
    expect(res.statusCode).toBe(500);
  });
});

/* -----------------------------------------------------------
 * /api/player/update-profile
 * ---------------------------------------------------------*/

describe('PATCH /api/player/update-profile', () => {
  it('returns 405 on non-PATCH', async () => {
    setAuthUser({ id: 'user-1' });
    const res = makeRes();
    await updateProfileHandler(makeReq({ method: 'POST' }, true), res);
    expect(res.statusCode).toBe(405);
  });

  it('returns 401 with no token', async () => {
    const res = makeRes();
    await updateProfileHandler(makeReq({ method: 'PATCH' }), res);
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when display_name exceeds 50 chars', async () => {
    setAuthUser({ id: 'user-1', user_metadata: {} });
    const res = makeRes();
    await updateProfileHandler(
      makeReq(
        { method: 'PATCH', body: { display_name: 'x'.repeat(51) } },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when battle_tag has invalid format', async () => {
    setAuthUser({ id: 'user-1', user_metadata: {} });
    const res = makeRes();
    await updateProfileHandler(
      makeReq({ method: 'PATCH', body: { battle_tag: 'no-hash' } }, true),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when no field to update', async () => {
    setAuthUser({ id: 'user-1', user_metadata: {} });
    const res = makeRes();
    await updateProfileHandler(
      makeReq({ method: 'PATCH', body: {} }, true),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('200 calls updateUserById with merged metadata', async () => {
    setAuthUser({ id: 'user-1', user_metadata: { existing: 'old' } });
    const updateSpy = vi.spyOn(supabaseAdmin.auth.admin, 'updateUserById');

    const res = makeRes();
    await updateProfileHandler(
      makeReq(
        {
          method: 'PATCH',
          body: { display_name: 'New', battle_tag: 'Player#1234' },
        },
        true
      ),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(updateSpy).toHaveBeenCalledOnce();
    const args = updateSpy.mock.calls[0][1] as any;
    expect(args.user_metadata.existing).toBe('old');
    expect(args.user_metadata.display_name).toBe('New');
    expect(args.user_metadata.battle_tag).toBe('Player#1234');
    updateSpy.mockRestore();
  });

  it('200 accepts a valid avatar_url and writes it to user_metadata', async () => {
    setAuthUser({ id: 'user-1', user_metadata: { existing: 'old' } });
    const updateSpy = vi.spyOn(supabaseAdmin.auth.admin, 'updateUserById');

    const res = makeRes();
    await updateProfileHandler(
      makeReq(
        {
          method: 'PATCH',
          body: { avatar_url: 'https://cdn.example.com/a.png' },
        },
        true
      ),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(updateSpy).toHaveBeenCalledOnce();
    const args = updateSpy.mock.calls[0][1] as any;
    expect(args.user_metadata.existing).toBe('old');
    expect(args.user_metadata.avatar_url).toBe(
      'https://cdn.example.com/a.png'
    );
    expect((res.body as any).avatar_url).toBe('https://cdn.example.com/a.png');
    updateSpy.mockRestore();
  });

  it('200 clears avatar_url when given an empty string (stored as null)', async () => {
    setAuthUser({
      id: 'user-1',
      user_metadata: { avatar_url: 'https://old.example.com/x.png' },
    });
    const updateSpy = vi.spyOn(supabaseAdmin.auth.admin, 'updateUserById');

    const res = makeRes();
    await updateProfileHandler(
      makeReq({ method: 'PATCH', body: { avatar_url: '   ' } }, true),
      res
    );

    expect(res.statusCode).toBe(200);
    const args = updateSpy.mock.calls[0][1] as any;
    expect(args.user_metadata.avatar_url).toBeNull();
    expect((res.body as any).avatar_url).toBeNull();
    updateSpy.mockRestore();
  });

  it('returns 400 when avatar_url is not an http(s) URL', async () => {
    setAuthUser({ id: 'user-1', user_metadata: {} });
    const res = makeRes();
    await updateProfileHandler(
      makeReq(
        { method: 'PATCH', body: { avatar_url: 'javascript:alert(1)' } },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when avatar_url exceeds 2048 chars', async () => {
    setAuthUser({ id: 'user-1', user_metadata: {} });
    const res = makeRes();
    await updateProfileHandler(
      makeReq(
        {
          method: 'PATCH',
          body: { avatar_url: 'https://e.com/' + 'a'.repeat(2048) },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('200 propagates battle_tag to team_members rows', async () => {
    setAuthUser({ id: 'user-1', user_metadata: {} });
    store.team_members = [
      { id: 'tm1', user_id: 'user-1', battle_tag: 'Old#1234' },
      { id: 'tm2', user_id: 'user-2', battle_tag: 'Other#5678' },
    ] as any;

    const res = makeRes();
    await updateProfileHandler(
      makeReq({ method: 'PATCH', body: { battle_tag: 'New#9999' } }, true),
      res
    );

    expect(res.statusCode).toBe(200);
    expect((store.team_members as any)[0].battle_tag).toBe('New#9999');
    expect((store.team_members as any)[1].battle_tag).toBe('Other#5678');
  });

  // Une joueuse doit pouvoir annoncer son niveau sans passer par sa capitaine :
  // c'est SA donnée. Et il doit atterrir sur la FICHE de roster, pas seulement
  // dans les métadonnées du compte — c'est la fiche qui alimente la moyenne
  // d'équipe et l'annuaire des adversaires.
  it('200 propage le SR de la joueuse sur sa fiche de roster', async () => {
    setAuthUser({ id: 'user-1', user_metadata: {} });
    store.team_members = [
      { id: 'tm1', user_id: 'user-1', skill_rating: null },
      { id: 'tm2', user_id: 'user-2', skill_rating: 2000 },
    ] as any;

    const res = makeRes();
    await updateProfileHandler(
      makeReq({ method: 'PATCH', body: { skill_rating: 3200 } }, true),
      res
    );

    expect(res.statusCode).toBe(200);
    expect((store.team_members as any)[0].skill_rating).toBe(3200);
    // La fiche d'une autre joueuse n'est jamais touchée.
    expect((store.team_members as any)[1].skill_rating).toBe(2000);
  });

  it('accepte la chaîne du formulaire et écrit un nombre', async () => {
    setAuthUser({ id: 'user-1', user_metadata: {} });
    store.team_members = [
      { id: 'tm1', user_id: 'user-1', skill_rating: null },
    ] as any;

    const res = makeRes();
    await updateProfileHandler(
      makeReq({ method: 'PATCH', body: { skill_rating: '2750' } }, true),
      res
    );

    expect(res.statusCode).toBe(200);
    expect((store.team_members as any)[0].skill_rating).toBe(2750);
  });

  it('efface le SR sur null comme sur chaîne vide', async () => {
    for (const vide of [null, '']) {
      setAuthUser({ id: 'user-1', user_metadata: {} });
      store.team_members = [
        { id: 'tm1', user_id: 'user-1', skill_rating: 3000 },
      ] as any;

      const res = makeRes();
      await updateProfileHandler(
        makeReq({ method: 'PATCH', body: { skill_rating: vide } }, true),
        res
      );

      expect(res.statusCode).toBe(200);
      expect((store.team_members as any)[0].skill_rating).toBeNull();
    }
  });

  it('refuse un SR hors bornes sans rien écrire', async () => {
    for (const mauvais of [5001, -1, 3500.5, 'beaucoup']) {
      setAuthUser({ id: 'user-1', user_metadata: {} });
      store.team_members = [
        { id: 'tm1', user_id: 'user-1', skill_rating: 3000 },
      ] as any;

      const res = makeRes();
      await updateProfileHandler(
        makeReq({ method: 'PATCH', body: { skill_rating: mauvais } }, true),
        res
      );

      expect(res.statusCode).toBe(400);
      expect((res.body as any).code).toBe('SKILL_RATING_INVALID');
      expect((store.team_members as any)[0].skill_rating).toBe(3000);
    }
  });

  it('modifier le seul pseudo ne touche pas au SR de la fiche', async () => {
    setAuthUser({ id: 'user-1', user_metadata: {} });
    store.team_members = [
      { id: 'tm1', user_id: 'user-1', skill_rating: 3000 },
    ] as any;

    const res = makeRes();
    await updateProfileHandler(
      makeReq({ method: 'PATCH', body: { display_name: 'Nouvelle' } }, true),
      res
    );

    expect(res.statusCode).toBe(200);
    expect((store.team_members as any)[0].skill_rating).toBe(3000);
  });
});

/* -----------------------------------------------------------
 * /api/teams/[id]/members — captain removes a member
 * ---------------------------------------------------------*/

describe('DELETE /api/teams/[id]/members', () => {
  const teamUuid = '550e8400-e29b-41d4-a716-446655440100';
  const memberUuid = '550e8400-e29b-41d4-a716-446655440200';

  it('returns 405 on non-DELETE', async () => {
    setAuthUser({ id: 'user-1' });
    const res = makeRes();
    await teamsMembersHandler(
      makeReq({ method: 'GET', query: { teamId: teamUuid } }, true),
      res
    );
    expect(res.statusCode).toBe(405);
  });

  it('returns 400 when teamId is invalid', async () => {
    setAuthUser({ id: 'user-1' });
    const res = makeRes();
    await teamsMembersHandler(
      makeReq({ method: 'DELETE', query: { teamId: 'bogus' } }, true),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns 401 with no Bearer token', async () => {
    const res = makeRes();
    await teamsMembersHandler(
      makeReq({ method: 'DELETE', query: { teamId: teamUuid } }),
      res
    );
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when team does not exist', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [];
    const res = makeRes();
    await teamsMembersHandler(
      makeReq(
        {
          method: 'DELETE',
          query: { teamId: teamUuid },
          body: { memberId: memberUuid },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when user is not captain of the team', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [{ id: teamUuid, captain_id: 'someone-else' }] as any;
    const res = makeRes();
    await teamsMembersHandler(
      makeReq(
        {
          method: 'DELETE',
          query: { teamId: teamUuid },
          body: { memberId: memberUuid },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(403);
  });

  it('returns 400 when memberId is invalid', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [{ id: teamUuid, captain_id: 'user-1' }] as any;
    const res = makeRes();
    await teamsMembersHandler(
      makeReq(
        {
          method: 'DELETE',
          query: { teamId: teamUuid },
          body: { memberId: 'bogus' },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when member is not part of team', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [{ id: teamUuid, captain_id: 'user-1' }] as any;
    store.team_members = [];
    const res = makeRes();
    await teamsMembersHandler(
      makeReq(
        {
          method: 'DELETE',
          query: { teamId: teamUuid },
          body: { memberId: memberUuid },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 when captain tries to remove themselves', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [{ id: teamUuid, captain_id: 'user-1' }] as any;
    store.team_members = [
      { id: memberUuid, team_id: teamUuid, user_id: 'user-1' },
    ] as any;
    const res = makeRes();
    await teamsMembersHandler(
      makeReq(
        {
          method: 'DELETE',
          query: { teamId: teamUuid },
          body: { memberId: memberUuid },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('200 removes the member when captain', async () => {
    setAuthUser({ id: 'user-1' });
    store.teams = [{ id: teamUuid, captain_id: 'user-1' }] as any;
    store.team_members = [
      { id: memberUuid, team_id: teamUuid, user_id: 'other' },
    ] as any;
    const res = makeRes();
    await teamsMembersHandler(
      makeReq(
        {
          method: 'DELETE',
          query: { teamId: teamUuid },
          body: { memberId: memberUuid },
        },
        true
      ),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(store.team_members.length).toBe(0);
  });
});
