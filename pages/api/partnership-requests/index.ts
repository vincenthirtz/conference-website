import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import {
  partnershipRequestSchema,
  formatZodError,
} from '@/utils/validation';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Service Supabase indisponible.' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validation
  const parsed = partnershipRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: formatZodError(parsed.error) });
  }
  const body = parsed.data;

  // Get IP and user agent for spam detection
  const forwarded = req.headers['x-forwarded-for'];
  const ipAddress = typeof forwarded === 'string'
    ? forwarded.split(',')[0].trim()
    : req.socket?.remoteAddress ?? null;
  const userAgent = req.headers['user-agent'] ?? null;

  const insertPayload = {
    company_name: body.companyName,
    contact_name: body.contactName,
    email: body.email,
    phone: body.phone?.trim() || null,
    website: body.website?.trim() || null,
    category: body.category,
    message: body.message,
    budget_range: body.budgetRange?.trim() || null,
    status: 'new',
    ip_address: ipAddress,
    user_agent: userAgent,
  };

  const { data, error } = await supabaseAdmin
    .from('partnership_requests')
    .insert(insertPayload)
    .select('id')
    .single();

  if (error) {
    console.error('[api/partnership-requests] insert error', error);
    return res
      .status(500)
      .json({ error: 'Impossible d\'envoyer la demande. Veuillez réessayer.' });
  }

  return res.status(201).json({
    success: true,
    message: 'Votre demande de partenariat a bien été envoyée. Nous vous recontacterons rapidement.'
  });
}
