import type { NextApiRequest, NextApiResponse } from 'next';
import { applyRateLimit } from '@/utils/rateLimit';

type CallbackResponse =
  | { ok: true; code: string; state?: string }
  | { ok: false; error: string };

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<CallbackResponse>
) {
  if (applyRateLimit(req, res, { max: 20, windowMs: 60_000 }, 'twitch-oauth'))
    return;
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const { code, state } = req.query;

  if (!code || typeof code !== 'string') {
    return res
      .status(400)
      .json({ ok: false, error: 'Missing authorization code' });
  }

  // At this stage we just expose the received code/state so it can be exchanged
  // server-side with the Twitch token endpoint. You can configure this URL as
  // the OAuth redirect in your Twitch developer console.
  return res.status(200).json({
    ok: true,
    code,
    state: typeof state === 'string' ? state : undefined,
  });
}
