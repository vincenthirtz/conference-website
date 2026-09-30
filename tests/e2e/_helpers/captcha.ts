// Défi captcha résolu pour les specs qui appellent une route publique
// protégée (création d'équipe, demandes de scrim publiques…).
//
// Le défi est enregistré côté serveur (`captcha_challenges`) et le jeton est
// à usage unique : un défi neuf par requête. La question a la forme
// « a OP b » (OP ∈ + - ×) — cf. utils/captcha.

import { expect, type APIRequestContext } from '@playwright/test';

export async function solveCaptchaApi(
  request: APIRequestContext
): Promise<{ captchaToken: string; captchaAnswer: string }> {
  const res = await request.get('/api/captcha');
  expect(res.ok(), await res.text()).toBeTruthy();
  const { token, question } = (await res.json()) as {
    token: string;
    question: string;
  };
  const m = question.match(/(-?\d+)\s*([+\-×])\s*(-?\d+)/);
  if (!m) throw new Error(`Captcha illisible : « ${question} »`);
  const a = Number(m[1]);
  const b = Number(m[3]);
  const answer = m[2] === '+' ? a + b : m[2] === '-' ? a - b : a * b;
  return { captchaToken: token, captchaAnswer: String(answer) };
}
