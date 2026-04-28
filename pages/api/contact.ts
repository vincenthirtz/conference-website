import type { NextApiRequest, NextApiResponse } from 'next';
import { contactSchema, formatZodError } from '@/utils/validation';
import { sendContactStaffEmail } from '@/utils/email';
import { applyRateLimit } from '@/utils/rateLimit';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (applyRateLimit(req, res, { max: 5, windowMs: 60 * 60 * 1000 }, 'contact'))
    return;

  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: formatZodError(parsed.error) });
  }
  const { name, email, subject, message } = parsed.data;

  const result = await sendContactStaffEmail({ name, email, subject, message });

  if (!result.success) {
    console.error('[api/contact] email send error:', result.error);
    return res
      .status(500)
      .json({ error: "Erreur lors de l'envoi du message." });
  }

  return res.status(201).json({
    ok: true,
    message: 'Message envoyé avec succès.',
  });
}
