// cloudflare/crons.ts
//
// Tâches planifiées du site sur Cloudflare. UN seul déclencheur (Cron
// Trigger « * * * * * », wrangler.jsonc) réveille le Worker chaque minute ;
// `dueCronJobs` dit quelles tâches tombent sur cette minute et `runCronJob`
// fait l'appel : `POST <API>/api/cron/<route>`,
// `Authorization: Bearer <CRON_SECRET>`, corps `{}`. Horaires (UTC) et délais
// d'abandon repris tels quels des anciennes fonctions planifiées Netlify,
// retirées à la bascule (2026-10-28) : cette table est désormais la seule
// source.
//
// Un déclencheur par tâche n'est pas possible : 5 par compte en offre
// gratuite. Le Worker ne lance rien sans `CRONS_ENABLED=1` (wrangler.jsonc,
// cf. cloudflare/worker.mjs) : « 0 » coupe tout d'un coup.
//
// APIs web standard uniquement : ce module tourne dans le Worker et sous
// vitest.

export type CronJob = {
  /** Nom de la fonction Netlify d'origine (journaux). */
  name: string;
  /** Expression cron à 5 champs, en UTC. */
  schedule: string;
  /** Route appelée : `/api/cron/<route>`. */
  route: string;
  /**
   * Abandon de l'appel. Les tâches longues s'arrêtent d'elles-mêmes avant, à leur
   * budget de temps, et reprennent au passage suivant (d'où leurs passages
   * rapprochés ci-dessous, docs/API-WORKER.md, lot 5).
   */
  timeoutMs: number;
};

export const CRON_JOBS: readonly CronJob[] = [
  {
    name: 'blacklist-expiry-cron',
    schedule: '23 * * * *',
    route: 'blacklist-expiry',
    timeoutMs: 20_000,
  },
  // Pas de délai côté Netlify : borné ici au plafond d'une fonction planifiée Netlify.
  {
    name: 'broadcast-cron',
    schedule: '*/5 10 * * *',
    route: 'broadcast-process',
    timeoutMs: 30_000,
  },
  {
    name: 'checkin-cron',
    schedule: '*/5 * * * *',
    route: 'checkin-process',
    timeoutMs: 20_000,
  },
  {
    name: 'discord-match-events-cron',
    schedule: '0 10 * * *',
    route: 'discord-match-events',
    timeoutMs: 20_000,
  },
  {
    name: 'dispute-sla-cron',
    schedule: '*/5 * * * *',
    route: 'dispute-sla-check',
    timeoutMs: 20_000,
  },
  {
    name: 'domain-verify-cron',
    schedule: '20 5 * * *',
    route: 'domain-verify',
    timeoutMs: 20_000,
  },
  {
    name: 'draft-auto-pick-cron',
    schedule: '* * * * *',
    route: 'draft-auto-pick',
    timeoutMs: 20_000,
  },
  {
    name: 'email-digest-cron',
    schedule: '*/5 7,17 * * *',
    route: 'email-digest',
    timeoutMs: 20_000,
  },
  {
    name: 'free-players-expiry-cron',
    schedule: '15 9 * * *',
    route: 'free-players-expiry',
    timeoutMs: 20_000,
  },
  {
    name: 'library-chat-purge-cron',
    schedule: '47 3 * * *',
    route: 'library-chat-purge',
    timeoutMs: 25_000,
  },
  {
    name: 'mvp-public-close-cron',
    schedule: '*/5 * * * *',
    route: 'mvp-public-close',
    timeoutMs: 20_000,
  },
  {
    name: 'outbox-maintenance-cron',
    schedule: '0 * * * *',
    route: 'outbox-maintenance',
    timeoutMs: 20_000,
  },
  {
    name: 'plan-renewal-cron',
    schedule: '0 8 * * *',
    route: 'plan-renewal',
    timeoutMs: 20_000,
  },
  {
    name: 'quota-alerts-cron',
    schedule: '40 5 * * *',
    route: 'quota-alerts',
    timeoutMs: 20_000,
  },
  {
    name: 'recycle-bin-purge-cron',
    schedule: '23 3 * * *',
    route: 'recycle-bin-purge',
    timeoutMs: 25_000,
  },
  {
    name: 'scrim-planning-reminders-cron',
    schedule: '0 9,18 * * *',
    route: 'scrim-planning-reminders',
    timeoutMs: 20_000,
  },
  {
    name: 'social-mirror-cron',
    schedule: '*/15 * * * *',
    route: 'social-mirror',
    timeoutMs: 20_000,
  },
  {
    name: 'social-token-refresh-cron',
    schedule: '0 6 * * *',
    route: 'social-token-refresh',
    timeoutMs: 20_000,
  },
  {
    name: 'sync-game-heroes-cron',
    schedule: '0 4 * * *',
    route: 'sync-game-heroes',
    timeoutMs: 60_000,
  },
  {
    name: 'task-board-digest-cron',
    schedule: '30 7 * * 1',
    route: 'task-board-digest',
    timeoutMs: 20_000,
  },
  {
    name: 'task-due-reminders-cron',
    schedule: '0 8 * * *',
    route: 'task-due-reminders',
    timeoutMs: 20_000,
  },
  {
    name: 'tcg-photo-purge-cron',
    schedule: '41 * * * *',
    route: 'tcg-photo-purge',
    timeoutMs: 20_000,
  },
  {
    name: 'tcg-trades-expire-cron',
    schedule: '17 * * * *',
    route: 'tcg-trades-expire',
    timeoutMs: 20_000,
  },
  {
    name: 'team-roster-reminders-cron',
    schedule: '0 9 * * *',
    route: 'team-roster-reminders',
    timeoutMs: 20_000,
  },
  {
    name: 'team-weekly-recap-cron',
    schedule: '0 9 * * 1',
    route: 'team-weekly-recap',
    timeoutMs: 20_000,
  },
  {
    name: 'tenant-purge-cron',
    schedule: '*/10 4 * * *',
    route: 'tenant-purge',
    timeoutMs: 20_000,
  },
  {
    name: 'webhook-dispatcher-cron',
    schedule: '* * * * *',
    route: 'webhook-dispatch',
    timeoutMs: 20_000,
  },
  {
    name: 'web-push-dispatcher-cron',
    schedule: '* * * * *',
    route: 'web-push-dispatch',
    timeoutMs: 25_000,
  },
];

export const DEFAULT_CRON_API_BASE_URL = 'https://api.owwomenscup.fr';

// minute, heure, jour du mois, mois, jour de la semaine (0 ou 7 = dimanche).
const FIELD_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7],
];

/**
 * Valeurs couvertes par un champ (`*`, `*\/n`, `a`, `a-b`, `a-b/n`, listes à
 * virgules). `null` si le champ est illisible : une tâche mal écrite ne doit
 * jamais tourner chaque minute par erreur.
 */
function fieldValues(
  field: string,
  [min, max]: readonly [number, number]
): Set<number> | null {
  const out = new Set<number>();
  for (const part of field.split(',')) {
    const m = part.match(/^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/);
    if (!m) return null;
    const step = m[4] ? Number(m[4]) : 1;
    const from = m[1] === '*' ? min : Number(m[2]);
    const to =
      m[1] === '*'
        ? max
        : m[3] !== undefined
          ? Number(m[3])
          : m[4]
            ? max
            : from;
    if (step < 1 || from < min || to > max || from > to) return null;
    for (let v = from; v <= to; v += step) out.add(v);
  }
  return out;
}

/** L'expression cron (5 champs, UTC) tombe-t-elle sur la minute de `date` ? */
export function cronMatches(expr: string, date: Date): boolean {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const sets = fields.map((f, i) => fieldValues(f, FIELD_RANGES[i]));
  if (sets.some((s) => s === null)) return false;
  const [minutes, hours, days, months, weekdays] = sets as Set<number>[];
  const dow = date.getUTCDay();
  const dayOfMonth = days.has(date.getUTCDate());
  const dayOfWeek = weekdays.has(dow) || (dow === 0 && weekdays.has(7));
  // Règle cron classique : jour du mois ET jour de semaine restreints (champ
  // ne commençant pas par `*`) → l'un OU l'autre suffit.
  const bothRestricted =
    !fields[2].startsWith('*') && !fields[4].startsWith('*');
  const dayMatches = bothRestricted
    ? dayOfMonth || dayOfWeek
    : dayOfMonth && dayOfWeek;
  return (
    minutes.has(date.getUTCMinutes()) &&
    hours.has(date.getUTCHours()) &&
    months.has(date.getUTCMonth() + 1) &&
    dayMatches
  );
}

export function dueCronJobs(
  date: Date,
  jobs: readonly CronJob[] = CRON_JOBS
): CronJob[] {
  return jobs.filter((job) => cronMatches(job.schedule, date));
}

/**
 * Origine de l'API visée : `CRON_API_BASE_URL` si c'est une origine https sans
 * identifiants, query ni fragment, sinon l'API de prod. Jamais le site
 * lui-même : le secret partirait vers le Worker.
 */
export function resolveCronApiBaseUrl(raw: string | undefined): string {
  const value = (raw ?? '').trim();
  if (!value) return DEFAULT_CRON_API_BASE_URL;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return DEFAULT_CRON_API_BASE_URL;
    }
  } catch {
    return DEFAULT_CRON_API_BASE_URL;
  }
  return value.replace(/\/+$/, '');
}

export type CronRunResult = {
  name: string;
  route: string;
  status: number;
  ok: boolean;
  error?: string;
  body?: string;
};

export async function runCronJob(
  job: CronJob,
  opts: { baseUrl: string; secret: string; fetchImpl?: typeof fetch }
): Promise<CronRunResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const res = await doFetch(`${opts.baseUrl}/api/cron/${job.route}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.secret}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
      signal: AbortSignal.timeout(job.timeoutMs),
    });
    const text = await res.text().catch(() => '');
    return {
      name: job.name,
      route: job.route,
      status: res.status,
      ok: res.ok,
      body: text.slice(0, 200),
    };
  } catch (err) {
    return {
      name: job.name,
      route: job.route,
      status: 0,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
