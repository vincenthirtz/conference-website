import type { NextApiRequest, NextApiResponse } from 'next';
import { withStaffRoute } from '../../../utils/staff';

import { logger } from '../../../utils/logger';
type BrevoEvent = {
  email: string;
  date: string;
  messageId: string;
  event: string;
  subject: string;
  tag: string;
  from: string;
  templateId: number | null;
};

type BrevoResponse = {
  events: BrevoEvent[];
};

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'BREVO_API_KEY not configured' });
  }

  const {
    limit = '50',
    offset = '0',
    email,
    event,
    startDate,
    endDate,
  } = req.query;

  const params = new URLSearchParams();
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  params.set('sort', 'desc');
  if (email && typeof email === 'string') params.set('email', email);
  if (event && typeof event === 'string') params.set('event', event);
  if (startDate && typeof startDate === 'string')
    params.set('startDate', startDate);
  if (endDate && typeof endDate === 'string') params.set('endDate', endDate);

  try {
    const response = await fetch(
      `https://api.brevo.com/v3/smtp/statistics/events?${params.toString()}`,
      {
        headers: {
          'api-key': apiKey,
          Accept: 'application/json',
        },
      }
    );

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      return res.status(response.status).json({
        error: data?.message || `Brevo API error: ${response.status}`,
      });
    }

    const data: BrevoResponse = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    logger.error('[email-logs] fetch error:', err);
    return res.status(502).json({ error: 'Failed to reach Brevo API' });
  }
}

export default withStaffRoute(handler, 'admin');
