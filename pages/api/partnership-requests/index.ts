import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import {
  partnershipRequestSchema,
  formatZodError,
} from '@/utils/validation';
import { applyRateLimit } from '@/utils/rateLimit';
import { sanitizeUrl } from '@/utils/apiHelpers';
import {
  sendPartnershipStaffEmail,
  sendPartnershipConfirmationEmail,
} from '@/utils/email';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable.' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting: 5 requests per hour
  if (applyRateLimit(req, res, { max: 5, windowMs: 60 * 60 * 1000 }, 'partnership')) return;

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
    website: sanitizeUrl(body.website),
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
      .json({ error: 'Failed to send request. Please try again.' });
  }

  void sendPartnershipStaffEmail({
    companyName: body.companyName,
    contactName: body.contactName,
    email: body.email,
    phone: body.phone?.trim() || null,
    website: insertPayload.website,
    category: body.category,
    budgetRange: body.budgetRange?.trim() || null,
    message: body.message,
  }).catch((e) =>
    console.error('[api/partnership-requests] staff email error:', e)
  );

  void sendPartnershipConfirmationEmail({
    to: body.email,
    contactName: body.contactName,
    companyName: body.companyName,
  }).catch((e) =>
    console.error('[api/partnership-requests] confirmation email error:', e)
  );

  return res.status(201).json({
    success: true,
    requestId: data?.id ?? null,
    message: 'Votre demande de partenariat a bien été envoyée. Nous vous recontacterons rapidement.'
  });
}
