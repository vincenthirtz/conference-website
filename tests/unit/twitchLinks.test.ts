// Pont d'identité Twitch → compte du site.
// Target: utils/auth/twitchLinks.ts
//
// CE QUE CES CAS PROTÈGENT.
//
//   1. ON NE VOLE JAMAIS UN LIEN. Si un compte Twitch appartient déjà à
//      quelqu'un d'autre, le rattachement échoue. Sans cette garde, il
//      suffirait de lier le compte Twitch d'une joueuse au sien pour capter ses
//      drops — l'identité décide d'un gain, donc elle se protège comme telle.
//
//   2. « ERREUR DE LECTURE » N'EST PAS « AUCUN LIEN ». `findAuthUserIdByTwitchUserId`
//      rend `undefined` quand la lecture échoue et `null` quand il n'y a rien.
//      Les confondre ferait perdre des drops en silence pendant une panne.
//
//   3. L'OVERLAY NE PEUT RENDRE QU'UN PSEUDO TWITCH. `readTwitchLoginsByUserIds`
//      est le seul chemin par lequel un nom sort vers une URL publique : il ne
//      doit jamais rendre autre chose, ni inventer un nom pour un compte non
//      rattaché.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import {
  upsertTwitchLink,
  getTwitchLinkStatus,
  findAuthUserIdByTwitchUserId,
  deleteTwitchLink,
  readTwitchLoginsByUserIds,
} from '../../utils/auth/twitchLinks';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BEA = '22222222-2222-4222-8222-222222222222';
const TWITCH_ID = 'tw-12345';

beforeEach(() => {
  resetSupabaseMock();
});

const rows = () => (store.user_twitch_links ?? []) as any[];

describe('upsertTwitchLink', () => {
  it('crée le lien', async () => {
    const res = await upsertTwitchLink(ALICE, {
      twitchUserId: TWITCH_ID,
      twitchLogin: 'kirisu',
    });
    expect(res.ok).toBe(true);
    expect(rows()).toHaveLength(1);
    expect(rows()[0].twitch_user_id).toBe(TWITCH_ID);
  });

  it('REFUSE de voler un compte Twitch déjà rattaché', async () => {
    // La garde anti-usurpation : sans elle, capter les drops d'une autre se
    // réduit à relier son compte Twitch au sien.
    await upsertTwitchLink(ALICE, {
      twitchUserId: TWITCH_ID,
      twitchLogin: 'kirisu',
    });

    const res = await upsertTwitchLink(BEA, {
      twitchUserId: TWITCH_ID,
      twitchLogin: 'kirisu',
    });

    expect(res).toEqual({ ok: false, code: 'ALREADY_LINKED_TO_OTHER' });
    // Et le lien d'origine est INTACT.
    expect(rows()).toHaveLength(1);
    expect(rows()[0].auth_user_id).toBe(ALICE);
  });

  it('est idempotent pour la même personne et rafraîchit le pseudo', async () => {
    // Un pseudo Twitch se renomme : le relier à nouveau doit mettre à jour
    // l'affichage sans créer de doublon.
    await upsertTwitchLink(ALICE, {
      twitchUserId: TWITCH_ID,
      twitchLogin: 'ancien',
    });
    const res = await upsertTwitchLink(ALICE, {
      twitchUserId: TWITCH_ID,
      twitchLogin: 'nouveau',
    });

    expect(res.ok).toBe(true);
    expect(rows()).toHaveLength(1);
    expect(rows()[0].twitch_login).toBe('nouveau');
  });

  it('refuse un identifiant vide', async () => {
    const res = await upsertTwitchLink(ALICE, {
      twitchUserId: '   ',
      twitchLogin: null,
    });
    expect(res.ok).toBe(false);
    expect(rows()).toHaveLength(0);
  });
});

describe('findAuthUserIdByTwitchUserId', () => {
  it('rend le compte quand le lien existe', async () => {
    await upsertTwitchLink(ALICE, {
      twitchUserId: TWITCH_ID,
      twitchLogin: 'kirisu',
    });
    await expect(findAuthUserIdByTwitchUserId(TWITCH_ID)).resolves.toBe(ALICE);
  });

  it('rend `null` — et non `undefined` — quand aucun lien n’existe', async () => {
    // La distinction porte tout le comportement du webhook : `null` s'acquitte,
    // `undefined` se réessaie.
    await expect(
      findAuthUserIdByTwitchUserId('tw-inconnu')
    ).resolves.toBeNull();
  });
});

describe('getTwitchLinkStatus', () => {
  it('rend un état « non lié » plutôt qu’une erreur', async () => {
    await expect(getTwitchLinkStatus(ALICE)).resolves.toEqual({
      linked: false,
      twitchLogin: null,
      linkedAt: null,
    });
  });

  it('rend le pseudo une fois lié', async () => {
    await upsertTwitchLink(ALICE, {
      twitchUserId: TWITCH_ID,
      twitchLogin: 'kirisu',
    });
    const status = await getTwitchLinkStatus(ALICE);
    expect(status.linked).toBe(true);
    expect(status.twitchLogin).toBe('kirisu');
  });
});

describe('deleteTwitchLink', () => {
  it('retire le lien, et délier deux fois réussit', async () => {
    await upsertTwitchLink(ALICE, {
      twitchUserId: TWITCH_ID,
      twitchLogin: 'kirisu',
    });
    await expect(deleteTwitchLink(ALICE)).resolves.toBe(true);
    expect(rows()).toHaveLength(0);
    await expect(deleteTwitchLink(ALICE)).resolves.toBe(true);
  });
});

describe('readTwitchLoginsByUserIds', () => {
  it('ne rend QUE des pseudos Twitch, et rien pour un compte non rattaché', async () => {
    // Seul chemin par lequel un nom sort vers l'URL publique de l'overlay :
    // une absence doit rester une absence, pas un repli sur un autre nom.
    await upsertTwitchLink(ALICE, {
      twitchUserId: TWITCH_ID,
      twitchLogin: 'kirisu',
    });

    const map = await readTwitchLoginsByUserIds([ALICE, BEA]);
    expect(map.get(ALICE)).toBe('kirisu');
    expect(map.has(BEA)).toBe(false);
  });

  it('ignore un lien sans pseudo plutôt que de rendre une chaîne vide', async () => {
    await upsertTwitchLink(ALICE, {
      twitchUserId: TWITCH_ID,
      twitchLogin: null,
    });
    const map = await readTwitchLoginsByUserIds([ALICE]);
    expect(map.has(ALICE)).toBe(false);
  });

  it('rend une carte vide sans requête pour une liste vide', async () => {
    await expect(readTwitchLoginsByUserIds([])).resolves.toEqual(new Map());
  });
});
