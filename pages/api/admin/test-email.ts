import type { NextApiRequest, NextApiResponse } from 'next';
import { withStaffRoute } from '../../../utils/staff';
import { sendEmail } from '../../../utils/email';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { to } = req.body || {};
  if (!to || typeof to !== 'string') {
    return res.status(400).json({ error: 'Missing "to" email address' });
  }

  const result = await sendEmail({
    to,
    subject: '[Test] Email de test Brevo',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #222;">
        <h2 style="color: #6d28d9;">Test Brevo</h2>
        <p>Si vous recevez cet email, la configuration Brevo fonctionne correctement.</p>
        <p style="margin-top: 16px; font-size: 13px; color: #888;">
          Envoyé le ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}
        </p>
      </div>
    `,
  });

  return res.status(result.success ? 200 : 502).json(result);
}

export default withStaffRoute(handler, 'admin');
