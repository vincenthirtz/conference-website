// pages/api/contact.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import nodemailer from 'nodemailer';

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
  SMTP_TO,
} = process.env;

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT || 465),
  secure: String(SMTP_SECURE || 'true') === 'true',
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST')
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  try {
    const { name, email, message, check } = req.body as {
      name?: string;
      email?: string;
      message?: string;
      check?: string;
    };

    // Petit honeypot anti-bots
    if (check) return res.status(200).json({ ok: true });

    if (!name || !email || !message) {
      return res.status(400).json({ ok: false, error: 'Champs manquants' });
    }

    // Validation simple
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: 'Email invalide' });
    }

    const html = `
      <h2>Nouveau message depuis le formulaire OW Women’s Cup</h2>
      <p><strong>Nom :</strong> ${escapeHtml(name)}</p>
      <p><strong>Email :</strong> ${escapeHtml(email)}</p>
      <p><strong>Message :</strong></p>
      <p>${escapeHtml(message).replace(/\n/g, '<br/>')}</p>
    `;

    await transporter.sendMail({
      from: SMTP_FROM,
      to: SMTP_TO,
      replyTo: email, // pratique pour répondre directement
      subject: `Contact site — ${name}`,
      html,
    });

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error('CONTACT_API_ERROR', err);
    return res.status(500).json({ ok: false, error: 'Erreur serveur' });
  }
}

// Petite utilité pour éviter l'injection HTML
function escapeHtml(str: string) {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
