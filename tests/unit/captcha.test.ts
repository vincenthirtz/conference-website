// CAPTCHA maison — défi gardé côté serveur.
// Target: utils/captcha.ts (+ pages/api/captcha.ts)
//
// CE QUE CES CAS PROTÈGENT, par ordre d'importance :
//   1. LA RÉPONSE NE VOYAGE PLUS. Le jeton était un JSON base64url qui portait
//      `answer` en clair : un script qui le décodait répondait juste à tous les
//      coups. Le test le plus important de ce fichier est donc celui qui
//      cherche la réponse dans le jeton — et ne doit pas la trouver.
//   2. UN DÉFI RÉSOLU NE RESSERT PAS. Sans consommation, un seul captcha
//      validait toutes les soumissions pendant cinq minutes.
//   3. ON NE DEVINE PAS : trois tentatives par défi, comptées même quand la
//      réponse est fausse.
//   4. ÉCHEC FERMÉ : sans défi en base (purgé, inconnu, expiré), on refuse.

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import {
  MAX_ATTEMPTS,
  __resetCaptchaPurgeForTests,
  generateChallenge,
  verifyCaptcha,
} from '../../utils/captcha';
import captchaHandler from '../../pages/api/captcha';

function solve(question: string): number {
  const m = question.match(/^(\d+)\s+([+\-×])\s+(\d+)$/);
  if (!m) throw new Error(`question inattendue : ${question}`);
  const a = Number(m[1]);
  const b = Number(m[3]);
  if (m[2] === '+') return a + b;
  if (m[2] === '-') return a - b;
  return a * b;
}

async function challenge(): Promise<{
  token: string;
  question: string;
  answer: number;
}> {
  const ch = await generateChallenge();
  if (!ch) throw new Error('captcha indisponible');
  return { ...ch, answer: solve(ch.question) };
}

const rows = () => (store.captcha_challenges ?? []) as any[];

beforeEach(() => {
  resetSupabaseMock();
  __resetCaptchaPurgeForTests();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('le jeton ne dit pas la réponse', () => {
  it('ne transporte aucune charge utile : un nonce et sa signature', async () => {
    const { token } = await challenge();
    // Deux blocs hexadécimaux, et rien d'autre : il n'y a AUCUNE place pour
    // une réponse. (Chercher les chiffres de la réponse dans l'hexadécimal
    // n'aurait rien prouvé : ils s'y trouvent souvent par hasard.)
    expect(token).toMatch(/^[a-f0-9]{32}\.[a-f0-9]{32}$/);
    // L'ancien jeton se décodait en JSON et donnait la réponse. Plus rien à
    // décoder ici.
    const decoded = Buffer.from(token.split('.')[0], 'base64url').toString();
    expect(() => JSON.parse(decoded)).toThrow();
  });

  it('garde l’empreinte de la réponse, jamais la réponse', async () => {
    const { answer } = await challenge();
    expect(rows()).toHaveLength(1);
    const row = rows()[0];
    // Une empreinte, pas un nombre — et aucune colonne ne s'appelle `answer`.
    expect(String(row.answer_hash)).toMatch(/^[a-f0-9]{64}$/);
    expect(String(row.answer_hash)).not.toBe(String(answer));
    expect(Object.keys(row)).not.toContain('answer');
  });

  it('délivre une question lisible et un jeton par défi', async () => {
    const a = await challenge();
    const b = await challenge();
    expect(a.question).toMatch(/^\d+\s+[+\-×]\s+\d+$/);
    expect(a.token).not.toBe(b.token);
    expect(rows()).toHaveLength(2);
  });

  it('ne rend jamais de soustraction négative', async () => {
    for (let i = 0; i < 100; i++) {
      const ch = await generateChallenge();
      if (ch && ch.question.includes('-')) {
        expect(solve(ch.question)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('vérification', () => {
  it('accepte la bonne réponse, espaces compris', async () => {
    const { token, answer } = await challenge();
    expect(await verifyCaptcha(token, `  ${answer}  `)).toEqual({
      valid: true,
    });
  });

  it('refuse une mauvaise réponse, et compte la tentative', async () => {
    const { token, answer } = await challenge();
    const result = await verifyCaptcha(token, String(answer + 1));
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Mauvaise réponse/);
    expect(rows()[0].attempts).toBe(1);
  });

  it('épuise le défi après {MAX_ATTEMPTS} essais ratés', async () => {
    const { token, answer } = await challenge();
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await verifyCaptcha(token, String(answer + 1 + i));
    }
    // Même la BONNE réponse ne rattrape pas un défi épuisé : c'est ce qui
    // interdit de parcourir l'espace des réponses.
    const result = await verifyCaptcha(token, String(answer));
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/expiré/);
  });

  it('un défi résolu ne ressert pas', async () => {
    const { token, answer } = await challenge();
    expect((await verifyCaptcha(token, String(answer))).valid).toBe(true);
    const replay = await verifyCaptcha(token, String(answer));
    expect(replay.valid).toBe(false);
    expect(replay.error).toMatch(/expiré/);
  });

  it('refuse un jeton signé pour un autre nonce', async () => {
    const { token, answer } = await challenge();
    const [nonce, signature] = token.split('.');
    const other = `${'0'.repeat(nonce.length)}.${signature}`;
    const result = await verifyCaptcha(other, String(answer));
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/invalide/);
    // Rien n'a été lu ni consommé : la signature tranche avant la base.
    expect(rows()[0].attempts).toBe(0);
  });

  it('refuse un jeton inconnu de la base (purgé)', async () => {
    const { token, answer } = await challenge();
    store.captcha_challenges = [];
    const result = await verifyCaptcha(token, String(answer));
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/expiré/);
  });

  it('refuse un défi échu', async () => {
    const { token, answer } = await challenge();
    rows()[0].expires_at = new Date(Date.now() - 1000).toISOString();
    const result = await verifyCaptcha(token, String(answer));
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/expiré/);
  });

  it('refuse les entrées vides et les jetons mal formés', async () => {
    expect((await verifyCaptcha('', '5')).error).toMatch(/manquant/);
    expect((await verifyCaptcha('tok', '')).error).toMatch(/manquant/);
    expect((await verifyCaptcha('pas-un-jeton', '5')).error).toMatch(
      /invalide/
    );
  });
});

describe('GET /api/captcha', () => {
  function makeRes(): any {
    const res: any = { statusCode: 200, body: undefined, headers: {} };
    res.status = (c: number) => ((res.statusCode = c), res);
    res.json = (b: unknown) => ((res.body = b), res);
    res.setHeader = (k: string, v: unknown) => {
      res.headers[k] = v;
    };
    return res;
  }

  it('rend un défi enregistré, sans cache', async () => {
    const res = makeRes();
    await captchaHandler({ method: 'GET', headers: {} } as any, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.question).toMatch(/^\d+\s+[+\-×]\s+\d+$/);
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(rows()).toHaveLength(1);
  });
});
