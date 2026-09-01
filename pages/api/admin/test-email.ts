import type { NextApiRequest, NextApiResponse } from 'next';
import { withStaffRoute } from '../../../utils/staff';
import { sendTestEmail } from '../../../utils/email';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { to } = req.body || {};
  if (!to || typeof to !== 'string') {
    return res.status(400).json({ error: 'Missing "to" email address' });
  }

  const result = await sendTestEmail(to);

  return res.status(result.success ? 200 : 502).json(result);
}

export default withStaffRoute(handler, { permission: 'manage_communications' });
