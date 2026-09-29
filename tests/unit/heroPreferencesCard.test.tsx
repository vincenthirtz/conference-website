// @vitest-environment happy-dom
//
// Carte « Mes héros » — pilote de useSchemaForm (lot P6), rendue dans le
// harnais joueuse : erreur serveur sous la BONNE liste (focus dessus),
// erreur non rattachée traduite par son `code` (FR), succès → toast et
// formulaire propre ; en inspection (act-as ou non) aucune action n'est rendue
// et rien n'est lu (la route ne suit pas le sujet).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from '@testing-library/react';

vi.mock('@/utils/supabaseBrowser', () => ({
  supabaseClient: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 't' } } }),
    },
  },
}));
vi.mock('next/router', () => ({
  default: { asPath: '/player/profile', replace: vi.fn(async () => true) },
}));

import HeroPreferencesCard from '../../components/player/HeroPreferencesCard';
import { renderPlayer } from './__helpers__/playerHarness';

const SUBJECT = '4f1c2a7e-0b6d-4e3a-9c1f-2a3b4c5d6e7f';

type Reply = { status: number; body: unknown };
let calls: { url: string; method: string; body: unknown }[] = [];
let putReply: (body: { picks: string[]; bans: string[] }) => Reply;

beforeEach(() => {
  calls = [];
  putReply = (b) => ({ status: 200, body: { ...b, slots: 3 } });
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, method, body });
    const r =
      method === 'PUT'
        ? putReply(body)
        : { status: 200, body: { picks: ['Ana'], bans: [], slots: 3 } };
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
});
afterEach(cleanup);

async function loaded() {
  await screen.findByRole('group', { name: 'Héros préférés' });
}
async function addBan(hero: string) {
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Ajouter un héros évité'), {
      target: { value: hero },
    });
  });
}
async function save() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  });
}

describe('HeroPreferencesCard (useSchemaForm)', () => {
  it('lit les préférences et n’offre l’enregistrement qu’une fois modifiée', async () => {
    renderPlayer(<HeroPreferencesCard />);
    await loaded();
    expect(calls[0]).toMatchObject({
      url: '/api/player/hero-preferences',
      method: 'GET',
    });
    const saveBtn = screen.getByRole('button', { name: 'Enregistrer' });
    expect((saveBtn as HTMLButtonElement).disabled).toBe(true);
    await addBan('Mercy');
    expect((saveBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it('erreur serveur par champ : message sous « Héros évités », focus sur la liste', async () => {
    putReply = () => ({
      status: 400,
      body: {
        error: 'Validation échouée.',
        code: 'INVALID_BODY',
        fields: {
          bans: ['Un héros ne peut pas être à la fois préféré et banni.'],
        },
      },
    });
    renderPlayer(<HeroPreferencesCard />);
    await loaded();
    await addBan('Mercy');
    await save();
    const bans = screen.getByRole('group', { name: 'Héros évités' });
    await waitFor(() => expect(document.activeElement).toBe(bans));
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe(
      'Un héros ne peut pas être à la fois préféré et banni.'
    );
    expect(bans.contains(alert)).toBe(true);
    expect(bans.getAttribute('aria-describedby')).toContain(alert.id);
    expect(calls.at(-1)).toMatchObject({
      method: 'PUT',
      body: { picks: ['Ana'], bans: ['Mercy'] },
    });
  });

  it('erreur non rattachée : message traduit du code (FR) + référence', async () => {
    putReply = () => ({
      status: 429,
      body: {
        error: 'Too many requests',
        code: 'rate_limited',
        requestId: 'abcdef1234567890',
      },
    });
    renderPlayer(<HeroPreferencesCard />);
    await loaded();
    await addBan('Mercy');
    await save();
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Trop de tentatives, réessaie dans un instant. (réf. abcdef12)'
    );
  });

  it('code historique hors catalogue : le texte serveur reste en repli', async () => {
    putReply = () => ({
      status: 500,
      body: { error: 'Erreur serveur.' },
    });
    renderPlayer(<HeroPreferencesCard />);
    await loaded();
    await addBan('Mercy');
    await save();
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Erreur serveur.'
    );
  });

  it('succès : réaffiche la réponse du serveur, toast, formulaire propre', async () => {
    renderPlayer(<HeroPreferencesCard />);
    await loaded();
    await addBan('Mercy');
    await save();
    expect(await screen.findByText('Tes héros sont enregistrés')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Enregistrer' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    expect(screen.getByText('Mercy')).toBeTruthy();
  });

  it('inspection sans act-as : aucune action rendue, aucune lecture', async () => {
    renderPlayer(<HeroPreferencesCard />, { subjectId: SUBJECT });
    await act(async () => {});
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('combobox')).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it('act-as : toujours rien — la route ne suit pas le sujet (héros du staff)', async () => {
    renderPlayer(<HeroPreferencesCard />, { subjectId: SUBJECT, actAs: true });
    await act(async () => {});
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });
});
