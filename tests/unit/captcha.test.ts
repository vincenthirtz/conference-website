import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateChallenge, verifyCaptcha } from '../../utils/captcha';

afterEach(() => {
  vi.useRealTimers();
});

function solve(question: string): number {
  // Format is always "<a> <op> <b>" with op ∈ {+, -, ×}
  const m = question.match(/^(\d+)\s+([+\-×])\s+(\d+)$/);
  if (!m) throw new Error(`Unexpected question shape: ${question}`);
  const a = Number(m[1]);
  const b = Number(m[3]);
  switch (m[2]) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '×':
      return a * b;
    default:
      throw new Error('unknown op');
  }
}

describe('generateChallenge', () => {
  it('returns a base64url token and a non-empty question', () => {
    const { token, question } = generateChallenge();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(question).toMatch(/^\d+\s+[+\-×]\s+\d+$/);
  });

  it('only uses operations within the documented set', () => {
    for (let i = 0; i < 50; i++) {
      const { question } = generateChallenge();
      expect(question).toMatch(/[+\-×]/);
    }
  });

  it('subtraction never produces a negative answer', () => {
    for (let i = 0; i < 200; i++) {
      const { question } = generateChallenge();
      if (question.includes('-')) {
        expect(solve(question)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('produces different tokens on subsequent calls', () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 20; i++) tokens.add(generateChallenge().token);
    // With 4-byte randomness on multiple fields, dupes are astronomically unlikely.
    expect(tokens.size).toBeGreaterThan(15);
  });
});

describe('verifyCaptcha', () => {
  it('accepts the correct numeric answer', () => {
    const { token, question } = generateChallenge();
    const answer = solve(question);
    expect(verifyCaptcha(token, String(answer))).toEqual({ valid: true });
  });

  it('accepts a numeric answer with surrounding whitespace', () => {
    const { token, question } = generateChallenge();
    const answer = solve(question);
    expect(verifyCaptcha(token, `  ${answer}  `)).toEqual({ valid: true });
  });

  it('rejects a wrong answer', () => {
    const { token, question } = generateChallenge();
    const wrong = solve(question) + 1;
    const result = verifyCaptcha(token, String(wrong));
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Mauvaise réponse/);
  });

  it('rejects a non-numeric answer', () => {
    const { token } = generateChallenge();
    const result = verifyCaptcha(token, 'notanumber');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Mauvaise réponse/);
  });

  it('rejects empty inputs', () => {
    const result = verifyCaptcha('', '5');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/manquant/);
    expect(verifyCaptcha('tok', '').error).toMatch(/manquant/);
  });

  it('rejects an unparseable token', () => {
    expect(verifyCaptcha('not-base64', '5').error).toMatch(/invalide/);
  });

  it('rejects a tampered token (mutated answer)', () => {
    const { token, question } = generateChallenge();
    const answer = solve(question);
    // Decode, bump the answer, re-encode without recomputing the hmac.
    const decoded = JSON.parse(Buffer.from(token, 'base64url').toString()) as {
      answer: number;
      issuedAt: number;
      hmac: string;
    };
    decoded.answer = decoded.answer + 1;
    const tampered = Buffer.from(JSON.stringify(decoded)).toString('base64url');

    const result = verifyCaptcha(tampered, String(answer + 1));
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/falsifié/);
  });

  it('rejects expired tokens', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-01T12:00:00Z'));

    const { token, question } = generateChallenge();
    const answer = solve(question);

    // Move clock 6 minutes forward (> 5 min TTL)
    vi.setSystemTime(new Date('2026-04-01T12:06:00Z'));

    const result = verifyCaptcha(token, String(answer));
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/expiré/);
  });

  it('still accepts a token just under the TTL', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-01T12:00:00Z'));

    const { token, question } = generateChallenge();
    const answer = solve(question);

    // 4 min 30 s later — still inside the 5 min window
    vi.setSystemTime(new Date('2026-04-01T12:04:30Z'));

    expect(verifyCaptcha(token, String(answer))).toEqual({ valid: true });
  });
});
