import { describe, it, expect } from 'vitest';
import {
  validateFieldDefinitions,
  validateRegistrationAnswers,
  type RegistrationField,
} from '@/utils/registrationFields';

describe('validateFieldDefinitions', () => {
  it('accepts a valid set of definitions and cleans them', () => {
    const res = validateFieldDefinitions([
      {
        key: 'jersey_size',
        label: 'Taille',
        type: 'select',
        required: true,
        options: ['S', 'M', 'L'],
      },
      {
        key: 'bio',
        label: 'Bio',
        type: 'textarea',
        required: false,
        maxLength: 500,
        help: 'Facultatif',
      },
      {
        key: 'needs_pc',
        label: 'Besoin PC',
        type: 'checkbox',
        required: false,
      },
      { key: 'homepage', label: 'Site', type: 'url', required: false },
      { key: 'age', label: 'Âge', type: 'number', required: true },
    ]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.fields).toHaveLength(5);
    expect(res.fields[0].options).toEqual(['S', 'M', 'L']);
    expect(res.fields[1].maxLength).toBe(500);
    expect(res.fields[1].help).toBe('Facultatif');
  });

  it('treats null/undefined as an empty field set', () => {
    expect(validateFieldDefinitions(undefined)).toEqual({
      ok: true,
      fields: [],
    });
    expect(validateFieldDefinitions(null)).toEqual({ ok: true, fields: [] });
  });

  it('rejects duplicate keys', () => {
    const res = validateFieldDefinitions([
      { key: 'size', label: 'A', type: 'text', required: false },
      { key: 'size', label: 'B', type: 'text', required: false },
    ]);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/double/i);
  });

  it('rejects a bad key charset', () => {
    const res = validateFieldDefinitions([
      { key: 'Bad Key!', label: 'A', type: 'text', required: false },
    ]);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/clé/i);
  });

  it('rejects a select without options', () => {
    const res = validateFieldDefinitions([
      {
        key: 'size',
        label: 'Taille',
        type: 'select',
        required: true,
        options: [],
      },
    ]);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/option/i);
  });

  it('rejects an invalid type', () => {
    const res = validateFieldDefinitions([
      { key: 'x', label: 'X', type: 'date', required: false },
    ]);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/type/i);
  });

  it('rejects more than 20 fields', () => {
    const many = Array.from({ length: 21 }, (_, i) => ({
      key: `k${i}`,
      label: `L${i}`,
      type: 'text' as const,
      required: false,
    }));
    const res = validateFieldDefinitions(many);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toMatch(/20/);
  });

  it('strips options for non-select and maxLength for non-text types', () => {
    const res = validateFieldDefinitions([
      {
        key: 'flag',
        label: 'Flag',
        type: 'checkbox',
        required: false,
        options: ['a'],
        maxLength: 10,
      },
    ]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.fields[0].options).toBeUndefined();
    expect(res.fields[0].maxLength).toBeUndefined();
  });
});

describe('validateRegistrationAnswers', () => {
  const fields: RegistrationField[] = [
    {
      key: 'jersey',
      label: 'Taille',
      type: 'select',
      required: true,
      options: ['S', 'M', 'L'],
    },
    {
      key: 'bio',
      label: 'Bio',
      type: 'textarea',
      required: false,
      maxLength: 20,
    },
    { key: 'age', label: 'Âge', type: 'number', required: true },
    { key: 'site', label: 'Site', type: 'url', required: false },
    { key: 'needs_pc', label: 'PC', type: 'checkbox', required: false },
  ];

  it('errors on a missing required field', () => {
    const res = validateRegistrationAnswers(fields, { bio: 'hi' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.jersey).toBeDefined();
    expect(res.errors.age).toBeDefined();
  });

  it('coerces number and checkbox types', () => {
    const res = validateRegistrationAnswers(fields, {
      jersey: 'M',
      age: '25',
      needs_pc: 'true',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.values.age).toBe(25);
    expect(res.values.needs_pc).toBe(true);
    expect(res.values.jersey).toBe('M');
  });

  it('rejects a non-finite number', () => {
    const res = validateRegistrationAnswers(fields, {
      jersey: 'S',
      age: 'abc',
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.age).toMatch(/numérique/i);
  });

  it('rejects an invalid url', () => {
    const res = validateRegistrationAnswers(fields, {
      jersey: 'S',
      age: 1,
      site: 'javascript:alert(1)',
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.site).toMatch(/url/i);
  });

  it('accepts a valid http(s) url', () => {
    const res = validateRegistrationAnswers(fields, {
      jersey: 'S',
      age: 1,
      site: 'https://example.com',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.values.site).toBe('https://example.com');
  });

  it('rejects a select value not in options', () => {
    const res = validateRegistrationAnswers(fields, { jersey: 'XXL', age: 1 });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.jersey).toMatch(/autoris/i);
  });

  it('enforces textarea maxLength', () => {
    const res = validateRegistrationAnswers(fields, {
      jersey: 'S',
      age: 1,
      bio: 'x'.repeat(50),
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.errors.bio).toMatch(/Maximum/i);
  });

  it('strips keys not present in the field defs', () => {
    const res = validateRegistrationAnswers(fields, {
      jersey: 'S',
      age: 1,
      hacker: 'ignored',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect('hacker' in res.values).toBe(false);
  });

  it('trims text answers', () => {
    const res = validateRegistrationAnswers(fields, {
      jersey: 'S',
      age: 1,
      bio: '  hello  ',
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.values.bio).toBe('hello');
  });
});
