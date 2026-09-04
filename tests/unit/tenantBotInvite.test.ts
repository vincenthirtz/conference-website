// tests/unit/tenantBotInvite.test.ts
//
// Le lien d'invitation du bot, porteur de l'espace.
//
// Avant : une URL identique pour tous. On l'ouvrait, on choisissait un serveur
// sur Discord, puis il fallait revenir, rafraîchir la file d'attente,
// reconnaître le bon serveur et le rattacher au bon espace — trois occasions de
// se tromper pour un geste qui se pense comme un seul.
//
// Ce que ces tests tiennent :
//   - un state forgé, altéré ou périmé ne rattache RIEN (c'est la seule preuve
//     que le retour vient d'un lien que nous avons émis) ;
//   - sans redirection configurée, on retombe proprement sur le lien générique
//     plutôt que de promettre un retour automatique qui n'aura pas lieu ;
//   - le retour de Discord rattache sur l'espace du state, pas sur un autre.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return {
    supabaseAdmin: m.supabaseAdmin,
    getServerClient: m.getServerClient,
  };
});
vi.mock('../../utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return {
    supabaseAdmin: m.supabaseAdmin,
    getServerClient: m.getServerClient,
  };
});

import {
  store,
  resetSupabaseMock,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import {
  buildTenantBotInvite,
  signInviteState,
  verifyInviteState,
  INVITE_STATE_MAX_AGE_MS,
} from '../../utils/tenants/botInvite';
import callbackHandler from '../../pages/api/onboard/discord-callback';

const TENANT = CONFERENCE_TENANT_ID;
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const GUILD = '111111111111111111';

const ENV = { ...process.env };

function makeRes(): any {
  const res: any = { statusCode: 200, body: undefined, headers: {} };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  return res;
}
const req = (query: Record<string, string>): any => ({
  method: 'GET',
  headers: { host: 'h' },
  query,
});

beforeEach(() => {
  resetSupabaseMock();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  process.env.DISCORD_CLIENT_ID = '123456789';
  process.env.DISCORD_CLIENT_SECRET = 'secret-de-test';
  delete process.env.DISCORD_OAUTH_REDIRECT_URI;

  store.tenants = [
    {
      id: TENANT,
      slug: 'conf',
      name: 'Conf',
      is_active: true,
      kind: 'organizer',
    },
    {
      id: OTHER,
      slug: 'autre',
      name: 'Autre',
      is_active: true,
      kind: 'organizer',
    },
  ] as any;
  store.discord_guilds = [] as any;
  store.tenant_discord_config = [] as any;
  store.pending_guild_links = [] as any;
  store.staff = [
    {
      id: 'staff-1',
      auth_user_id: 'u1',
      email: 'a@a.com',
      role: 'owner',
      is_active: true,
      deleted_at: null,
    },
  ] as any;
});

afterEach(() => {
  process.env = { ...ENV };
});

describe('construction du lien', () => {
  it('sans redirection configurée : lien générique, mode manuel', () => {
    const invite = buildTenantBotInvite({
      tenantId: TENANT,
      staffId: 'staff-1',
    });
    expect(invite.mode).toBe('manual');
    // Promettre un retour automatique sans URI déclarée chez Discord, c'est
    // envoyer l'opérateur sur un écran d'erreur.
    expect(invite.url).not.toContain('redirect_uri');
    expect(invite.url).toContain('client_id=123456789');
  });

  it('avec redirection : lien porteur de l’espace, mode direct', () => {
    process.env.DISCORD_OAUTH_REDIRECT_URI =
      'https://owwomenscup.fr/api/onboard/discord-callback';
    const invite = buildTenantBotInvite({
      tenantId: TENANT,
      staffId: 'staff-1',
    });
    expect(invite.mode).toBe('direct');
    expect(invite.url).toContain('response_type=code');
    expect(invite.state).toBeTruthy();
    expect(verifyInviteState(invite.state)?.tenantId).toBe(TENANT);
  });

  it('un serveur pré-sélectionné verrouille le choix', () => {
    const invite = buildTenantBotInvite({
      tenantId: TENANT,
      staffId: 'staff-1',
      guildId: GUILD,
    });
    expect(invite.url).toContain(`guild_id=${GUILD}`);
    expect(invite.url).toContain('disable_guild_select=true');
  });

  it('une URI de retour non https est ignorée', () => {
    process.env.DISCORD_OAUTH_REDIRECT_URI = 'http://exemple.fr/callback';
    expect(
      buildTenantBotInvite({ tenantId: TENANT, staffId: 'staff-1' }).mode
    ).toBe('manual');
  });

  it('sans client id, pas de lien du tout', () => {
    delete process.env.DISCORD_CLIENT_ID;
    expect(
      buildTenantBotInvite({ tenantId: TENANT, staffId: 'staff-1' }).url
    ).toBeNull();
  });
});

describe('vérification du state', () => {
  it('refuse une signature altérée', () => {
    const state = signInviteState({ tenantId: TENANT, staffId: 'staff-1' });
    expect(verifyInviteState(`${state}x`)).toBeNull();
  });

  it('refuse un corps réécrit', () => {
    // Le cas qui compte : rejouer un state en changeant l'espace visé.
    const state = signInviteState({ tenantId: TENANT, staffId: 'staff-1' });
    const [, sig] = state.split('.');
    const forged = Buffer.from(
      JSON.stringify({
        tenantId: OTHER,
        staffId: 'staff-1',
        nonce: 'x',
        issuedAt: Date.now(),
      })
    ).toString('base64url');
    expect(verifyInviteState(`${forged}.${sig}`)).toBeNull();
  });

  it('refuse un state périmé', () => {
    const state = signInviteState({
      tenantId: TENANT,
      staffId: 'staff-1',
      issuedAt: Date.now() - INVITE_STATE_MAX_AGE_MS - 1000,
    });
    expect(verifyInviteState(state)).toBeNull();
  });

  it('refuse un state daté du futur', () => {
    const state = signInviteState({
      tenantId: TENANT,
      staffId: 'staff-1',
      issuedAt: Date.now() + 10 * 60_000,
    });
    expect(verifyInviteState(state)).toBeNull();
  });
});

describe('retour de Discord', () => {
  it('rattache sur l’espace du state', async () => {
    const state = signInviteState({ tenantId: TENANT, staffId: 'staff-1' });
    const res = makeRes();
    await callbackHandler(req({ state, guild_id: GUILD }), res);

    expect(res.statusCode).toBe(302);
    expect(String(res.headers.Location)).toContain(`/admin/tenants/${TENANT}`);
    expect(String(res.headers.Location)).toContain('botInvite=linked');

    const link = (store.discord_guilds as any[])[0];
    expect(link.tenant_id).toBe(TENANT);
    expect(link.guild_id).toBe(GUILD);
    // Premier serveur de l'espace : c'est le principal.
    expect(link.is_primary).toBe(true);
  });

  it('ne rattache RIEN sans state valide', async () => {
    const res = makeRes();
    await callbackHandler(req({ state: 'nawak', guild_id: GUILD }), res);
    expect(String(res.headers.Location)).toContain('botInvite=invalid_state');
    expect(store.discord_guilds as any[]).toHaveLength(0);
  });

  it('traite l’abandon sur Discord comme un renoncement, pas une erreur', async () => {
    const state = signInviteState({ tenantId: TENANT, staffId: 'staff-1' });
    const res = makeRes();
    await callbackHandler(req({ state }), res);
    expect(String(res.headers.Location)).toContain('botInvite=cancelled');
    expect(store.discord_guilds as any[]).toHaveLength(0);
  });

  it('refuse un serveur déjà rattaché ailleurs', async () => {
    store.discord_guilds = [
      { guild_id: GUILD, tenant_id: OTHER, is_primary: true },
    ] as any;
    const state = signInviteState({ tenantId: TENANT, staffId: 'staff-1' });
    const res = makeRes();
    await callbackHandler(req({ state, guild_id: GUILD }), res);

    expect(String(res.headers.Location)).toContain('botInvite=failed');
    expect(String(res.headers.Location)).toContain('GUILD_TAKEN');
    // Le déplacer silencieusement couperait le bot de l'espace d'origine.
    expect((store.discord_guilds as any[])[0].tenant_id).toBe(OTHER);
  });

  it('une réinstallation sur un serveur déjà rattaché n’est pas un échec', async () => {
    store.discord_guilds = [
      { guild_id: GUILD, tenant_id: TENANT, is_primary: true },
    ] as any;
    const state = signInviteState({ tenantId: TENANT, staffId: 'staff-1' });
    const res = makeRes();
    await callbackHandler(req({ state, guild_id: GUILD }), res);
    expect(String(res.headers.Location)).toContain('botInvite=already_linked');
  });
});
