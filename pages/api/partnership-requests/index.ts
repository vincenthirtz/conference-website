import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';

type PartnershipRequestPayload = {
  companyName: string;
  contactName: string;
  email: string;
  phone?: string;
  website?: string;
  category: 'super' | 'major' | 'cultural' | 'other';
  message: string;
  budgetRange?: string;
};

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

  const body = req.body as PartnershipRequestPayload;

  // Validation
  if (!body.companyName?.trim()) {
    return res.status(400).json({ error: 'Le nom de l\'entreprise est requis.' });
  }
  if (!body.contactName?.trim()) {
    return res.status(400).json({ error: 'Le nom du contact est requis.' });
  }
  if (!body.email?.trim()) {
    return res.status(400).json({ error: 'L\'email est requis.' });
  }
  if (!body.category) {
    return res.status(400).json({ error: 'La catégorie est requise.' });
  }
  if (!body.message?.trim()) {
    return res.status(400).json({ error: 'Le message est requis.' });
  }

  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(body.email)) {
    return res.status(400).json({ error: 'L\'email est invalide.' });
  }

  const validCategories = ['super', 'major', 'cultural', 'other'];
  if (!validCategories.includes(body.category)) {
    return res.status(400).json({ error: 'Catégorie invalide.' });
  }

  // Get IP and user agent for spam detection
  const forwarded = req.headers['x-forwarded-for'];
  const ipAddress = typeof forwarded === 'string'
    ? forwarded.split(',')[0].trim()
    : req.socket?.remoteAddress ?? null;
  const userAgent = req.headers['user-agent'] ?? null;

  const insertPayload = {
    company_name: body.companyName.trim(),
    contact_name: body.contactName.trim(),
    email: body.email.trim().toLowerCase(),
    phone: body.phone?.trim() || null,
    website: body.website?.trim() || null,
    category: body.category,
    message: body.message.trim(),
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
