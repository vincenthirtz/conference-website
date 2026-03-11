import { describe, it, expect } from 'vitest';
import {
  contactSchema,
  partnershipRequestSchema,
  captainRequestSchema,
  formatZodError,
} from '../../utils/validation';

describe('contactSchema', () => {
  it('validates a correct contact form', () => {
    const result = contactSchema.safeParse({
      name: 'Jean Dupont',
      email: 'jean@example.com',
      subject: 'Question',
      message: 'Bonjour, je voudrais savoir...',
    });
    expect(result.success).toBe(true);
  });

  it('trims and lowercases email', () => {
    const result = contactSchema.safeParse({
      name: 'Jean',
      email: '  JEAN@Example.COM  ',
      subject: 'Test',
      message: 'Message de test assez long',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('jean@example.com');
    }
  });

  it('rejects missing name', () => {
    const result = contactSchema.safeParse({
      name: '',
      email: 'jean@example.com',
      subject: 'Question',
      message: 'Bonjour, je voudrais savoir...',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const result = contactSchema.safeParse({
      name: 'Jean',
      email: 'not-an-email',
      subject: 'Question',
      message: 'Bonjour, je voudrais savoir...',
    });
    expect(result.success).toBe(false);
  });

  it('rejects message shorter than 10 chars', () => {
    const result = contactSchema.safeParse({
      name: 'Jean',
      email: 'jean@example.com',
      subject: 'Question',
      message: 'Court',
    });
    expect(result.success).toBe(false);
  });

  it('rejects message longer than 5000 chars', () => {
    const result = contactSchema.safeParse({
      name: 'Jean',
      email: 'jean@example.com',
      subject: 'Question',
      message: 'a'.repeat(5001),
    });
    expect(result.success).toBe(false);
  });

  it('trims whitespace from name', () => {
    const result = contactSchema.safeParse({
      name: '  Jean  ',
      email: 'jean@example.com',
      subject: 'Test',
      message: 'Message long assez ok ici',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Jean');
    }
  });
});

describe('partnershipRequestSchema', () => {
  it('validates a correct partnership request', () => {
    const result = partnershipRequestSchema.safeParse({
      companyName: 'Acme Corp',
      contactName: 'Jane Doe',
      email: 'jane@acme.com',
      category: 'major',
      message: 'Interested in sponsoring',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid category', () => {
    const result = partnershipRequestSchema.safeParse({
      companyName: 'Acme',
      contactName: 'Jane',
      email: 'jane@acme.com',
      category: 'invalid',
      message: 'Test',
    });
    expect(result.success).toBe(false);
  });

  it('accepts all valid categories', () => {
    for (const category of ['super', 'major', 'cultural', 'other']) {
      const result = partnershipRequestSchema.safeParse({
        companyName: 'Acme',
        contactName: 'Jane',
        email: 'jane@acme.com',
        category,
        message: 'Test message',
      });
      expect(result.success).toBe(true);
    }
  });

  it('allows optional phone and website', () => {
    const result = partnershipRequestSchema.safeParse({
      companyName: 'Acme',
      contactName: 'Jane',
      email: 'jane@acme.com',
      category: 'other',
      message: 'Test',
      phone: '+33 6 12 34 56 78',
      website: 'https://acme.com',
    });
    expect(result.success).toBe(true);
  });
});

describe('captainRequestSchema', () => {
  it('validates with existing team ID', () => {
    const result = captainRequestSchema.safeParse({
      existingTeamId: 'team-123',
      members: [],
    });
    expect(result.success).toBe(true);
  });

  it('validates with new team name', () => {
    const result = captainRequestSchema.safeParse({
      teamName: 'Les Champions',
      members: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects when neither existingTeamId nor teamName provided', () => {
    const result = captainRequestSchema.safeParse({
      members: [],
    });
    expect(result.success).toBe(false);
  });

  it('validates members with email', () => {
    const result = captainRequestSchema.safeParse({
      teamName: 'Team A',
      members: [
        { email: 'player1@example.com', battleTag: 'Player#1234' },
        { email: 'player2@example.com' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects more than 5 members', () => {
    const members = Array.from({ length: 6 }, (_, i) => ({
      email: `player${i}@example.com`,
    }));
    const result = captainRequestSchema.safeParse({
      teamName: 'Team A',
      members,
    });
    expect(result.success).toBe(false);
  });
});

describe('formatZodError', () => {
  it('returns the first issue message', () => {
    const result = contactSchema.safeParse({
      name: '',
      email: 'bad',
      subject: '',
      message: '',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = formatZodError(result.error);
      expect(typeof msg).toBe('string');
      expect(msg.length).toBeGreaterThan(0);
    }
  });

  it('falls back to field path when message is "Required"', () => {
    const result = contactSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = formatZodError(result.error);
      expect(typeof msg).toBe('string');
      expect(msg.length).toBeGreaterThan(0);
    }
  });
});
