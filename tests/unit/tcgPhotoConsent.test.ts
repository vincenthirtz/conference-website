// tests/unit/tcgPhotoConsent.test.ts
//
// LES TROIS GARDE-FOUS DE CONSENTEMENT DU TCG, épinglés.
//
// Le TCG met la photo d'une personne réelle sur un objet que d'autres
// collectionnent, dans un milieu où les joueuses subissent du harcèlement. Trois
// promesses ont été faites dans le code, et jusqu'ici aucune n'était vérifiée :
//
//   1. OPT-IN : pas de ligne, pas de photo — rien n'entre par défaut.
//   2. MODÉRATION AVANT PUBLICATION : une photo `pending` n'est servie à
//      personne, y compris en remplacement d'une photo déjà approuvée.
//   3. RETRAIT RÉTROACTIF : un retrait atteint les cartes DÉJÀ distribuées, et
//      le fichier quitte le bucket PUBLIC.
//
// CE QUE CES TESTS VÉRIFIENT VRAIMENT. Le point sensible n'est pas la ligne en
// base, c'est ce qu'un tiers peut OBTENIR. Chaque cas d'écriture se termine donc
// par une relecture via `readPlayerFaces` — le lecteur public réel — plutôt que
// par une assertion sur une colonne. Une régression qui laisserait la colonne
// correcte mais la photo joignable passerait autrement au vert.
//
// De même, la suppression du fichier est affirmée sur `storageRemovals` : une
// photo refusée qui resterait atteignable par son URL rendrait le refus
// décoratif, et la base ne dit rien de cela.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});
vi.mock('@/utils/staffLogs', () => ({
  logStaffAction: vi.fn().mockResolvedValue(undefined),
}));

import {
  store,
  resetSupabaseMock,
  setAuthUser,
  storageRemovals,
  storageUploads,
  supabaseAdmin,
  setStorageRemoveResult,
  setTableWriteError,
} from './__helpers__/supabaseMock';
import { invalidateStaffCache } from '../../utils/staff';
import { DEFAULT_TENANT_ID } from '../../utils/tenant';
import { readPlayerFaces } from '../../utils/tcg/readCardFaces';

import photoHandler from '../../pages/api/player/tcg/photo';
import moderationHandler from '../../pages/api/admin/tcg/photos';

// UUID BIEN FORMÉS, pas seulement « en forme de UUID » : la route de
// modération valide `userId` avec `z.string().uuid()`, qui exige le nibble de
// version ([1-5]) et celui de variante ([89ab]) de la RFC 4122. Des répétitions
// naïves (`1111-1111-…`) sont rejetées en 400 — et le test échouait alors avant
// même d'atteindre ce qu'il prétendait vérifier.
const PLAYER = '11111111-1111-4111-8111-111111111111';
const STAFF_ROW = '55555555-5555-4555-8555-555555555555';
const STAFF_AUTH = '66666666-6666-4666-8666-666666666666';

const PHOTO_PATH = 'tcg/11111111-abcdef.png';
const AVATAR = 'https://cdn.test/avatar.png';

/** PNG 1×1 valide — magic bytes compris (cf. utils/uploads/imageBytes.ts). */
const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk' +
  'YPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

let _token = 0;
function freshToken() {
  _token += 1;
  return `t-${Date.now()}-${_token}`;
}

function makeReq(over: Partial<Record<string, unknown>> = {}): any {
  return {
    method: 'GET',
    headers: { host: 'h', authorization: `Bearer ${freshToken()}` },
    cookies: {},
    query: {},
    body: {},
    ...over,
  };
}

function makeRes(): any {
  const res: any = {
    statusCode: 200,
    body: undefined as unknown,
    headers: {} as Record<string, unknown>,
    // `res.revalidate` n'existe que dans le runtime Next. On le double ici
    // parce que c'est LUI qui rend le retrait immédiat sur la fiche publique :
    // sans lui, la photo resterait affichée jusqu'à cinq minutes (ISR 300 s).
    revalidated: [] as string[],
  };
  res.status = (c: number) => ((res.statusCode = c), res);
  res.json = (b: unknown) => ((res.body = b), res);
  res.end = () => res;
  res.setHeader = (k: string, v: unknown) => {
    res.headers[k] = v;
  };
  res.revalidate = (path: string) => {
    res.revalidated.push(path);
    return Promise.resolve();
  };
  return res;
}

/** La joueuse existe au classement — source du nom et de l'avatar de repli. */
function seedPlayer(avatarUrl: string | null = AVATAR) {
  store.player_ratings = [
    {
      user_id: PLAYER,
      tenant_id: DEFAULT_TENANT_ID,
      display_name: 'Nova',
      avatar_url: avatarUrl,
    },
  ] as any;
}

/** Une ligne `tcg_player_cards`, approuvée par défaut. */
function seedCard(over: Record<string, unknown> = {}) {
  store.tcg_player_cards = [
    {
      tenant_id: DEFAULT_TENANT_ID,
      user_id: PLAYER,
      opted_in_at: '2026-01-01T00:00:00.000Z',
      revoked_at: null,
      photo_path: PHOTO_PATH,
      photo_status: 'approved',
      photo_reviewed_by: null,
      photo_reviewed_at: null,
      photo_rejected_reason: null,
      updated_at: '2026-01-01T00:00:00.000Z',
      ...over,
    },
  ] as any;
}

/** Le staff qui relit les photos (`manage_tcg`). */
function seedStaff() {
  store.staff = [
    {
      id: STAFF_ROW,
      auth_user_id: STAFF_AUTH,
      email: 'staff@example.com',
      role: 'owner',
      display_name: null,
      avatar_url: null,
      created_at: '2026-01-01T00:00:00.000Z',
      is_pole_admin: false,
    },
  ] as any;
  store.tenant_staff = [
    {
      tenant_id: DEFAULT_TENANT_ID,
      staff_id: STAFF_ROW,
      role: 'admin',
      created_at: '2026-01-01',
    },
  ] as any;
  setAuthUser({ id: STAFF_AUTH });
  invalidateStaffCache();
}

/** La ligne en base, telle qu'elle est après l'appel. */
const cardRow = () => (store.tcg_player_cards?.[0] ?? null) as any;

/** Ce qu'un TIERS obtient réellement — le seul point de vue qui compte ici. */
async function publicFace() {
  const faces = await readPlayerFaces(DEFAULT_TENANT_ID, [PLAYER]);
  return faces.get(PLAYER)!;
}

beforeEach(() => {
  resetSupabaseMock();
  invalidateStaffCache();
  setAuthUser({ id: PLAYER });
});

afterEach(() => {
  // Les espions de course (`vi.spyOn(supabaseAdmin, 'from')`) s'empileraient
  // d'un test à l'autre et finiraient par s'appeler eux-mêmes.
  vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */
/* Le lecteur public : ce qui est servi, et ce qui ne l'est pas                */
/* -------------------------------------------------------------------------- */

describe('readPlayerFaces — le filtre de consentement', () => {
  it('sert une photo approuvée et non révoquée', async () => {
    seedPlayer();
    seedCard();

    const face = await publicFace();

    expect(face.hasTcgPhoto).toBe(true);
    expect(face.imageUrl).toContain(PHOTO_PATH);
  });

  it('ne sert PAS une photo en attente de relecture', async () => {
    // Garde-fou 2. Sans ce filtre, il suffirait de déposer n'importe quoi pour
    // le voir apparaître sur les cartes avant qu'une personne l'ait regardé.
    seedPlayer();
    seedCard({ photo_status: 'pending' });

    const face = await publicFace();

    expect(face.hasTcgPhoto).toBe(false);
    expect(face.imageUrl).toBe(AVATAR);
  });

  it('ne sert PAS une photo refusée', async () => {
    seedPlayer();
    seedCard({ photo_status: 'rejected', photo_path: null });

    const face = await publicFace();

    expect(face.hasTcgPhoto).toBe(false);
  });

  it("ne sert PAS une photo approuvée dont l'accord a été retiré", async () => {
    // Garde-fou 3, côté lecture : `approved` ne suffit pas, il faut aussi que
    // `revoked_at` soit vide. Les deux conditions sont indépendantes — une
    // seule des deux laisserait passer un cas réel.
    seedPlayer();
    seedCard({ revoked_at: '2026-02-01T00:00:00.000Z' });

    const face = await publicFace();

    expect(face.hasTcgPhoto).toBe(false);
    expect(face.imageUrl).toBe(AVATAR);
  });

  it('ne sert aucune photo quand la joueuse n’a jamais donné son accord', async () => {
    // Garde-fou 1 : l'absence de ligne est l'état par défaut de toutes celles
    // qui n'ont rien demandé.
    seedPlayer();
    store.tcg_player_cards = [] as any;

    const face = await publicFace();

    expect(face.hasTcgPhoto).toBe(false);
    expect(face.imageUrl).toBe(AVATAR);
  });

  it('rend une face utilisable même sans avatar : jamais d’image inventée', async () => {
    seedPlayer(null);
    store.tcg_player_cards = [] as any;

    const face = await publicFace();

    expect(face.hasTcgPhoto).toBe(false);
    expect(face.imageUrl).toBeNull();
    expect(face.displayName).toBe('Nova');
  });
});

/* -------------------------------------------------------------------------- */
/* Le retrait par la joueuse                                                   */
/* -------------------------------------------------------------------------- */

describe('DELETE /api/player/tcg/photo — retrait de l’accord', () => {
  it('retire la photo des cartes DÉJÀ distribuées', async () => {
    seedPlayer();
    seedCard();
    // Elle est bien servie avant le retrait : sinon le test passerait au vert
    // pour une raison qui n'a rien à voir.
    expect((await publicFace()).hasTcgPhoto).toBe(true);

    const res = makeRes();
    await photoHandler(makeReq({ method: 'DELETE' }), res);

    expect(res.statusCode).toBe(200);
    // LA vérification qui compte : ce qu'un tiers obtient maintenant.
    const face = await publicFace();
    expect(face.hasTcgPhoto).toBe(false);
    expect(face.imageUrl).toBe(AVATAR);
  });

  it('supprime le fichier du bucket public', async () => {
    seedPlayer();
    seedCard();

    await photoHandler(makeReq({ method: 'DELETE' }), makeRes());

    // Le bucket est public : vider la colonne sans supprimer l'objet
    // laisserait la photo joignable par son URL, indéfiniment.
    expect(storageRemovals).toHaveLength(1);
    expect(storageRemovals[0].paths).toEqual([PHOTO_PATH]);
  });

  it('met le chemin en file AVANT de couper le pointeur', async () => {
    seedPlayer();
    seedCard();
    // Le bucket refuse : c'est le mode d'échec qui laissait, avant la file,
    // une photo publique dont plus personne ne connaissait le chemin.
    setStorageRemoveResult({ data: null, error: { message: 'storage down' } });

    const res = makeRes();
    await photoHandler(makeReq({ method: 'DELETE' }), res);

    // Le retrait est acquis pour la joueuse : la base ne référence plus rien.
    expect(res.statusCode).toBe(200);
    expect(cardRow().photo_path).toBeNull();
    // Et le chemin n'est pas perdu : le balayage horaire pourra reprendre.
    const queued = (store.tcg_photo_purges ?? []) as Array<{
      storage_path: string;
      reason: string;
    }>;
    expect(queued).toHaveLength(1);
    expect(queued[0].storage_path).toBe(PHOTO_PATH);
    expect(queued[0].reason).toBe('revoked');
  });

  it('vide la file quand le fichier est bien parti', async () => {
    seedPlayer();
    seedCard();

    await photoHandler(makeReq({ method: 'DELETE' }), makeRes());

    // Une ligne de file est une DETTE, pas un journal : elle n'existe que
    // tant que le fichier existe.
    expect(store.tcg_photo_purges ?? []).toHaveLength(0);
  });

  it('REFUSE de couper le pointeur si la file n’a pas pu être écrite', async () => {
    seedPlayer();
    seedCard();
    setTableWriteError('tcg_photo_purges', { message: 'file indisponible' });

    const res = makeRes();
    await photoHandler(makeReq({ method: 'DELETE' }), res);

    // L'INVARIANT DU LOT. Couper `photo_path` sans avoir mis le chemin à
    // l'abri, c'est accepter de le perdre — et laisser la photo joignable
    // pour toujours. Mieux vaut un retrait à recommencer : la joueuse voit
    // une erreur, sa photo est encore là, et elle peut réessayer.
    expect(res.statusCode).toBe(500);
    expect(cardRow().photo_path).toBe(PHOTO_PATH);
    expect(storageRemovals).toHaveLength(0);
  });

  it('conserve la trace de l’accord, et ne supprime pas la ligne', async () => {
    seedPlayer();
    seedCard();

    await photoHandler(makeReq({ method: 'DELETE' }), makeRes());

    const row = cardRow();
    expect(row).not.toBeNull();
    // `opted_in_at` atteste qu'il y a EU accord ; `revoked_at` qu'il a été
    // retiré. Effacer la ligne effacerait cette histoire.
    expect(row.opted_in_at).toBe('2026-01-01T00:00:00.000Z');
    expect(row.revoked_at).toBeTruthy();
    expect(row.photo_path).toBeNull();
    expect(row.photo_status).toBe('none');
  });

  it('régénère la fiche publique immédiatement', async () => {
    // Sans cela, la photo resterait affichée sur `/player/[userId]` jusqu'à
    // cinq minutes après le retrait (ISR à 300 s) — et « retrait rétroactif »
    // ne serait qu'une formule.
    seedPlayer();
    seedCard();

    const res = makeRes();
    await photoHandler(makeReq({ method: 'DELETE' }), res);

    expect(res.revalidated).toContain(`/player/${PLAYER}`);
  });
});

/* -------------------------------------------------------------------------- */
/* Le dépôt d'une nouvelle photo                                               */
/* -------------------------------------------------------------------------- */

describe('POST /api/player/tcg/photo — dépôt et remplacement', () => {
  it('remet en attente une photo déjà approuvée, donc la retire du public', async () => {
    // Sans ce retour à `pending`, il suffirait de remplacer un cliché approuvé
    // par n'importe quoi pour contourner la relecture.
    seedPlayer();
    seedCard();

    const res = makeRes();
    await photoHandler(
      makeReq({
        method: 'POST',
        body: { data: PNG_1PX, mimeType: 'image/png' },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(cardRow().photo_status).toBe('pending');
    // Conséquence publique : plus aucune photo servie le temps de la relecture.
    expect((await publicFace()).hasTcgPhoto).toBe(false);
  });

  it('refuse un fichier qui n’est pas l’image qu’il prétend être', async () => {
    seedPlayer();

    const res = makeRes();
    await photoHandler(
      makeReq({
        method: 'POST',
        // Base64 valide, contenu qui n'est pas un PNG : le bucket est public,
        // le type déclaré par le client ne fait pas foi.
        body: {
          data: Buffer.from('pas une image').toString('base64'),
          mimeType: 'image/png',
        },
      }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('content_mismatch');
    expect(store.tcg_player_cards ?? []).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* La modération                                                                */
/* -------------------------------------------------------------------------- */

describe('PATCH /api/admin/tcg/photos — relecture', () => {
  it('publie la photo à l’approbation, et garde le fichier', async () => {
    seedPlayer();
    seedCard({ photo_status: 'pending' });
    seedStaff();

    const res = makeRes();
    await moderationHandler(
      makeReq({
        method: 'PATCH',
        body: { userId: PLAYER, decision: 'approve', photoPath: PHOTO_PATH },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(storageRemovals).toHaveLength(0);
    expect((await publicFace()).hasTcgPhoto).toBe(true);
  });

  it('supprime du bucket la photo refusée', async () => {
    // Une photo est refusée PRÉCISÉMENT parce qu'elle pose problème : la
    // marquer sans la supprimer la laisserait atteignable par son URL.
    seedPlayer();
    seedCard({ photo_status: 'pending' });
    seedStaff();

    const res = makeRes();
    await moderationHandler(
      makeReq({
        method: 'PATCH',
        body: {
          userId: PLAYER,
          decision: 'reject',
          reason: 'hors sujet',
          photoPath: PHOTO_PATH,
        },
      }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(storageRemovals).toHaveLength(1);
    expect(storageRemovals[0].paths).toEqual([PHOTO_PATH]);
    expect(cardRow().photo_path).toBeNull();
    expect((await publicFace()).hasTcgPhoto).toBe(false);
  });

  it('régénère la fiche publique après la décision', async () => {
    seedPlayer();
    seedCard({ photo_status: 'pending' });
    seedStaff();

    const res = makeRes();
    await moderationHandler(
      makeReq({
        method: 'PATCH',
        body: { userId: PLAYER, decision: 'approve', photoPath: PHOTO_PATH },
      }),
      res
    );

    expect(res.revalidated).toContain(`/player/${PLAYER}`);
  });

  it('refuse de décider sur une photo qui n’est plus en attente', async () => {
    // Le cas réel : la joueuse a retiré son accord pendant que la relectrice
    // avait la file ouverte. Sa décision à elle prime.
    seedPlayer();
    seedCard({
      photo_status: 'none',
      photo_path: null,
      revoked_at: '2026-02-01',
    });
    seedStaff();

    const res = makeRes();
    await moderationHandler(
      makeReq({
        method: 'PATCH',
        body: { userId: PLAYER, decision: 'approve', photoPath: PHOTO_PATH },
      }),
      res
    );

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('NOT_PENDING');
  });
});

/* -------------------------------------------------------------------------- */
/* On n'approuve que la photo qu'on a vue (audit du 2026-09-15)                 */
/* -------------------------------------------------------------------------- */

describe('PATCH /api/admin/tcg/photos — la décision porte sur la photo AFFICHÉE', () => {
  const PHOTO_B = 'tcg/11111111-remplacee.png';

  /** Remplace la photo par B au moment où la route relit la ligne. */
  function replaceAfterRead(nthRead: number, over: Record<string, unknown>) {
    const real = supabaseAdmin.from.bind(supabaseAdmin);
    let reads = 0;
    vi.spyOn(supabaseAdmin, 'from').mockImplementation((table: string) => {
      const builder: any = real(table);
      if (table === 'tcg_player_cards') {
        const original = builder.maybeSingle.bind(builder);
        builder.maybeSingle = async () => {
          const result = await original();
          reads += 1;
          if (reads === nthRead) Object.assign(cardRow(), over);
          return result;
        };
      }
      return builder;
    });
  }

  async function decide(body: Record<string, unknown>) {
    const res = makeRes();
    await moderationHandler(makeReq({ method: 'PATCH', body }), res);
    return res;
  }

  it('le GET rend `photoPath`, que le panneau renvoie tel quel', async () => {
    seedPlayer();
    seedCard({ photo_status: 'pending' });
    seedStaff();
    const res = makeRes();
    await moderationHandler(makeReq({ method: 'GET' }), res);
    expect(res.body.photos[0]).toMatchObject({
      userId: PLAYER,
      photoPath: PHOTO_PATH,
    });
  });

  it('400 sans `photoPath` : une décision doit désigner un fichier', async () => {
    seedPlayer();
    seedCard({ photo_status: 'pending' });
    seedStaff();
    const res = await decide({ userId: PLAYER, decision: 'approve' });
    expect(res.statusCode).toBe(400);
    expect(cardRow().photo_status).toBe('pending');
  });

  it('SCÉNARIO D’ATTAQUE : A affichée, remplacée par B, « approuver » → 409 PHOTO_CHANGED, B jamais publiée', async () => {
    // AVANT : la décision ne citait que la joueuse → B, jamais vue, approuvée.
    seedPlayer();
    seedCard({ photo_status: 'pending', photo_path: PHOTO_B });
    seedStaff();

    const res = await decide({
      userId: PLAYER,
      decision: 'approve',
      photoPath: PHOTO_PATH,
    });

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('PHOTO_CHANGED');
    expect(cardRow()).toMatchObject({
      photo_status: 'pending',
      photo_path: PHOTO_B,
    });
    expect((await publicFace()).hasTcgPhoto).toBe(false);
    expect(storageRemovals).toHaveLength(0);
  });

  it('course : remplacement ENTRE la relecture et l’écriture → rien n’est approuvé', async () => {
    seedPlayer();
    seedCard({ photo_status: 'pending' });
    seedStaff();
    // La relecture voit A ; B arrive juste après.
    replaceAfterRead(1, { photo_path: PHOTO_B, photo_status: 'pending' });

    const res = await decide({
      userId: PLAYER,
      decision: 'approve',
      photoPath: PHOTO_PATH,
    });

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('PHOTO_CHANGED');
    expect(cardRow()).toMatchObject({
      photo_status: 'pending',
      photo_path: PHOTO_B,
    });
    expect((await publicFace()).hasTcgPhoto).toBe(false);
  });

  it('refus concurrent : B arrivée pendant le refus de A n’est ni déréférencée ni orpheline', async () => {
    // AVANT : l'update vidait `photo_path` (celui de B) et supprimait A — B
    // restait dans le bucket PUBLIC sans ligne pour la désigner.
    seedPlayer();
    seedCard({ photo_status: 'pending' });
    seedStaff();
    replaceAfterRead(1, { photo_path: PHOTO_B, photo_status: 'pending' });

    const res = await decide({
      userId: PLAYER,
      decision: 'reject',
      reason: 'hors sujet',
      photoPath: PHOTO_PATH,
    });

    expect(res.statusCode).toBe(409);
    expect(cardRow().photo_path).toBe(PHOTO_B);
    // Aucune suppression : A a déjà été retirée par le dépôt de B, et B attend
    // sa relecture.
    expect(storageRemovals).toHaveLength(0);
  });

  it('un refus supprime EXACTEMENT le fichier confirmé par l’écriture', async () => {
    seedPlayer();
    seedCard({ photo_status: 'pending' });
    seedStaff();
    const res = await decide({
      userId: PLAYER,
      decision: 'reject',
      photoPath: PHOTO_PATH,
    });
    expect(res.statusCode).toBe(200);
    expect(storageRemovals).toEqual([
      { bucket: 'teams-images', paths: [PHOTO_PATH] },
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* Erreurs de lecture côté joueuse (audit du 2026-09-15)                        */
/* -------------------------------------------------------------------------- */

describe('POST/DELETE /api/player/tcg/photo — une lecture ratée ne crée pas d’orpheline', () => {
  function failCardReads(times: number) {
    const real = supabaseAdmin.from.bind(supabaseAdmin);
    let failures = 0;
    vi.spyOn(supabaseAdmin, 'from').mockImplementation((table: string) => {
      const builder: any = real(table);
      if (table === 'tcg_player_cards' && failures < times) {
        builder.maybeSingle = async () => {
          failures += 1;
          return { data: null, error: { message: '504 upstream' } };
        };
      }
      return builder;
    });
  }

  it('DELETE : lecture en échec → 500, la base garde le chemin, le fichier n’est pas perdu', async () => {
    // AVANT : l'erreur était ignorée, `path` valait null, la base était vidée
    // et le fichier restait dans le bucket public sans aucune référence.
    seedPlayer();
    seedCard();
    failCardReads(1);

    const res = makeRes();
    await photoHandler(makeReq({ method: 'DELETE' }), res);

    expect(res.statusCode).toBe(500);
    expect(cardRow().photo_path).toBe(PHOTO_PATH);
    expect(storageRemovals).toHaveLength(0);
    vi.restoreAllMocks();
    // Rejouer le retrait fonctionne et supprime bien le fichier.
    const retry = makeRes();
    await photoHandler(makeReq({ method: 'DELETE' }), retry);
    expect(retry.statusCode).toBe(200);
    expect(storageRemovals[0].paths).toEqual([PHOTO_PATH]);
  });

  it('DELETE : un dépôt intercalé est relu, et c’est SON fichier qui part', async () => {
    const PHOTO_B = 'tcg/11111111-intercalee.png';
    seedPlayer();
    seedCard();
    const real = supabaseAdmin.from.bind(supabaseAdmin);
    let reads = 0;
    vi.spyOn(supabaseAdmin, 'from').mockImplementation((table: string) => {
      const builder: any = real(table);
      if (table === 'tcg_player_cards') {
        const original = builder.maybeSingle.bind(builder);
        builder.maybeSingle = async () => {
          const result = await original();
          reads += 1;
          if (reads === 1) {
            Object.assign(cardRow(), {
              photo_path: PHOTO_B,
              photo_status: 'pending',
            });
          }
          return result;
        };
      }
      return builder;
    });

    const res = makeRes();
    await photoHandler(makeReq({ method: 'DELETE' }), res);

    expect(res.statusCode).toBe(200);
    expect(cardRow().photo_path).toBeNull();
    expect(storageRemovals.map((r) => r.paths)).toEqual([[PHOTO_B]]);
  });

  it('POST : lecture de l’ancienne photo en échec → 500 AVANT tout envoi au bucket', async () => {
    seedPlayer();
    seedCard();
    failCardReads(1);

    const res = makeRes();
    await photoHandler(
      makeReq({
        method: 'POST',
        body: { data: PNG_1PX, mimeType: 'image/png' },
      }),
      res
    );

    expect(res.statusCode).toBe(500);
    expect(storageUploads).toHaveLength(0);
    expect(cardRow().photo_path).toBe(PHOTO_PATH);
  });
});

/* -------------------------------------------------------------------------- */
/* Pas de photo sans carte (cas réel du 2026-09-23)                             */
/* -------------------------------------------------------------------------- */

describe('photo d’un compte sans profil joueuse', () => {
  // Une joueuse connectée avec un compte e-mail, à côté du compte Discord de
  // son équipe : sa photo validée n'allait sur aucune carte.

  it('POST : refusé avec un code dédié, rien n’est enregistré', async () => {
    // Pas de seedPlayer : aucun profil joueuse pour ce compte.
    const res = makeRes();
    await photoHandler(
      makeReq({
        method: 'POST',
        body: { data: PNG_1PX, mimeType: 'image/png' },
      }),
      res
    );
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('no_player_profile');
    expect(store.tcg_player_cards ?? []).toHaveLength(0);
  });

  it('GET : l’écran joueuse le sait avant l’envoi', async () => {
    const res = makeRes();
    await photoHandler(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.hasPlayerProfile).toBe(false);

    seedPlayer();
    const res2 = makeRes();
    await photoHandler(makeReq({ method: 'GET' }), res2);
    expect(res2.body.hasPlayerProfile).toBe(true);
  });

  it('file de relecture : le staff voit qu’aucune carte n’affichera la photo', async () => {
    // Photo déjà en attente (déposée avant le garde-fou), compte sans profil.
    seedCard({ photo_status: 'pending' });
    seedStaff();
    const res = makeRes();
    await moderationHandler(makeReq({ method: 'GET' }), res);
    expect(res.body.photos[0]).toMatchObject({
      userId: PLAYER,
      hasPlayerProfile: false,
    });
  });
});
