// Tâches planifiées du Worker Cloudflare (cloudflare/crons.ts).
//
// Depuis la bascule (2026-10-28), cloudflare/crons.ts est la seule source des
// tâches planifiées : les fonctions Netlify qu'elle reproduisait sont parties.
import { describe, expect, it, vi } from 'vitest';
import {
  CRON_JOBS,
  cronMatches,
  DEFAULT_CRON_API_BASE_URL,
  dueCronJobs,
  resolveCronApiBaseUrl,
  runCronJob,
} from '../../cloudflare/crons';

const at = (iso: string) => new Date(iso);

describe('cronMatches', () => {
  it('chaque minute', () => {
    expect(cronMatches('* * * * *', at('2026-10-28T13:37:00Z'))).toBe(true);
  });

  it('pas de */5 et */15', () => {
    expect(cronMatches('*/5 * * * *', at('2026-10-28T13:35:00Z'))).toBe(true);
    expect(cronMatches('*/5 * * * *', at('2026-10-28T13:36:00Z'))).toBe(false);
    expect(cronMatches('*/15 * * * *', at('2026-10-28T13:45:00Z'))).toBe(true);
    expect(cronMatches('*/15 * * * *', at('2026-10-28T13:50:00Z'))).toBe(false);
  });

  it('listes d’heures, en UTC', () => {
    expect(cronMatches('0 7,17 * * *', at('2026-10-28T07:00:00Z'))).toBe(true);
    expect(cronMatches('0 7,17 * * *', at('2026-10-28T17:00:00Z'))).toBe(true);
    // 08:00 à Paris (UTC+1 en hiver) = 07:00 UTC : seule l'heure UTC compte.
    expect(cronMatches('0 7,17 * * *', at('2026-10-28T08:00:00+01:00'))).toBe(
      true
    );
    expect(cronMatches('0 7,17 * * *', at('2026-10-28T08:00:00Z'))).toBe(false);
  });

  it('passages rapprochés dans une heure donnée (tâches découpées)', () => {
    expect(cronMatches('*/5 10 * * *', at('2026-10-28T10:00:00Z'))).toBe(true);
    expect(cronMatches('*/5 10 * * *', at('2026-10-28T10:35:00Z'))).toBe(true);
    expect(cronMatches('*/5 10 * * *', at('2026-10-28T10:36:00Z'))).toBe(false);
    expect(cronMatches('*/5 10 * * *', at('2026-10-28T11:00:00Z'))).toBe(false);
    expect(cronMatches('*/5 7,17 * * *', at('2026-10-28T17:55:00Z'))).toBe(
      true
    );
    expect(cronMatches('*/5 7,17 * * *', at('2026-10-28T08:00:00Z'))).toBe(
      false
    );
    expect(cronMatches('*/10 4 * * *', at('2026-10-28T04:50:00Z'))).toBe(true);
  });

  it('jour de semaine (lundi = 1, dimanche = 0 ou 7)', () => {
    // 2026-10-26 est un lundi, 2026-11-01 un dimanche.
    expect(cronMatches('30 7 * * 1', at('2026-10-26T07:30:00Z'))).toBe(true);
    expect(cronMatches('30 7 * * 1', at('2026-10-27T07:30:00Z'))).toBe(false);
    expect(cronMatches('0 9 * * 0', at('2026-11-01T09:00:00Z'))).toBe(true);
    expect(cronMatches('0 9 * * 7', at('2026-11-01T09:00:00Z'))).toBe(true);
  });

  it('plages, pas sur plage et départ décalé', () => {
    expect(cronMatches('10-20/5 * * * *', at('2026-10-28T13:15:00Z'))).toBe(
      true
    );
    expect(cronMatches('10-20/5 * * * *', at('2026-10-28T13:25:00Z'))).toBe(
      false
    );
    expect(cronMatches('5/15 * * * *', at('2026-10-28T13:50:00Z'))).toBe(true);
  });

  it('jour du mois ET jour de semaine restreints : l’un ou l’autre', () => {
    // Le 1er novembre 2026 est un dimanche ; le 2 est un lundi.
    expect(cronMatches('0 0 1 * 1', at('2026-11-01T00:00:00Z'))).toBe(true);
    expect(cronMatches('0 0 1 * 1', at('2026-11-02T00:00:00Z'))).toBe(true);
    expect(cronMatches('0 0 1 * 1', at('2026-11-03T00:00:00Z'))).toBe(false);
  });

  it('expression illisible : jamais déclenchée', () => {
    const t = at('2026-10-28T13:37:00Z');
    for (const bad of [
      '',
      '* * * *',
      '61 * * * *',
      'a * * * *',
      '*/0 * * * *',
      '5-1 * * * *',
    ]) {
      expect(cronMatches(bad, t)).toBe(false);
    }
  });
});

describe('dueCronJobs', () => {
  it('minute quelconque : seulement les tâches de chaque minute', () => {
    const names = dueCronJobs(at('2026-10-28T13:37:00Z')).map((j) => j.name);
    expect(names.sort()).toEqual([
      'draft-auto-pick-cron',
      'web-push-dispatcher-cron',
      'webhook-dispatcher-cron',
    ]);
  });

  it('lundi 09:00 UTC : récap hebdo + relances quotidiennes', () => {
    const names = dueCronJobs(at('2026-10-26T09:00:00Z')).map((j) => j.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'team-weekly-recap-cron',
        'team-roster-reminders-cron',
        'scrim-planning-reminders-cron',
        'outbox-maintenance-cron',
        'checkin-cron',
      ])
    );
  });

  it('chaque tâche tourne au moins une fois sur une semaine', () => {
    const seen = new Set<string>();
    const start = at('2026-10-26T00:00:00Z').getTime();
    for (let m = 0; m < 7 * 24 * 60; m++) {
      for (const job of dueCronJobs(new Date(start + m * 60_000))) {
        seen.add(job.name);
      }
    }
    expect(seen.size).toBe(CRON_JOBS.length);
  });
});

describe('resolveCronApiBaseUrl', () => {
  it('absente ou invalide : API de prod', () => {
    expect(resolveCronApiBaseUrl(undefined)).toBe(DEFAULT_CRON_API_BASE_URL);
    expect(resolveCronApiBaseUrl('  ')).toBe(DEFAULT_CRON_API_BASE_URL);
    expect(resolveCronApiBaseUrl('http://api.example.com')).toBe(
      DEFAULT_CRON_API_BASE_URL
    );
    expect(resolveCronApiBaseUrl('https://u:p@api.example.com')).toBe(
      DEFAULT_CRON_API_BASE_URL
    );
    expect(resolveCronApiBaseUrl('https://api.example.com/?x=1')).toBe(
      DEFAULT_CRON_API_BASE_URL
    );
    expect(resolveCronApiBaseUrl('pas une url')).toBe(
      DEFAULT_CRON_API_BASE_URL
    );
  });

  it('valide : retenue, sans slash final', () => {
    expect(resolveCronApiBaseUrl('https://api.example.com//')).toBe(
      'https://api.example.com'
    );
  });
});

describe('runCronJob', () => {
  const job = CRON_JOBS.find((j) => j.name === 'checkin-cron');
  if (!job) throw new Error('checkin-cron manquant');

  it('même appel que la fonction Netlify', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"ok":true}'));
    const r = await runCronJob(job, {
      baseUrl: 'https://api.example.com',
      secret: 's3cr3t',
      fetchImpl,
    });
    expect(r).toMatchObject({ name: 'checkin-cron', status: 200, ok: true });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://api.example.com/api/cron/checkin-process');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{}');
    expect(new Headers(init.headers).get('authorization')).toBe(
      'Bearer s3cr3t'
    );
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('statut d’erreur et erreur réseau remontés, sans exception', async () => {
    const r500 = await runCronJob(job, {
      baseUrl: 'https://api.example.com',
      secret: 's',
      fetchImpl: async () => new Response('boom', { status: 500 }),
    });
    expect(r500).toMatchObject({ ok: false, status: 500, body: 'boom' });
    const rNet = await runCronJob(job, {
      baseUrl: 'https://api.example.com',
      secret: 's',
      fetchImpl: async () => {
        throw new Error('réseau');
      },
    });
    expect(rNet).toMatchObject({ ok: false, status: 0, error: 'réseau' });
  });
});
