import type { NextApiRequest, NextApiResponse } from 'next';
import { applyRateLimit } from '@/utils/rateLimit';
import { createCheckoutIntent } from '@/utils/helloasso';
import { z } from 'zod';
import { formatZodError } from '@/utils/validation';

const checkoutSchema = z.object({
  amount: z
    .number()
    .int()
    .min(100, 'Le montant minimum est 1 €')
    .max(100_000_00, 'Montant trop élevé'),
  firstName: z
    .string()
    .trim()
    .min(1, 'Prénom requis')
    .max(100),
  lastName: z
    .string()
    .trim()
    .min(1, 'Nom requis')
    .max(100),
  email: z
    .string()
    .trim()
    .email('Email invalide')
    .max(254),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 10 checkout attempts per IP per hour
  if (applyRateLimit(req, res, { max: 10, windowMs: 60 * 60 * 1000 }, 'helloasso-checkout')) {
    return;
  }

  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: formatZodError(parsed.error) });
  }

  const { amount, firstName, lastName, email } = parsed.data;

  // Build absolute callback URLs from the request origin
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers.host;
  const origin = `${proto}://${host}`;

  try {
    const checkout = await createCheckoutIntent({
      totalAmount: amount,
      payer: { firstName, lastName, email },
      returnUrl: `${origin}/don?status=success`,
      errorUrl: `${origin}/don?status=error`,
      itemName: 'Don pour l\'association',
    });

    return res.status(200).json({ redirectUrl: checkout.redirectUrl });
  } catch (err) {
    console.error('[api/helloasso/checkout]', err);
    return res.status(502).json({
      error: 'Impossible de créer la session de paiement. Réessayez plus tard.',
    });
  }
}
