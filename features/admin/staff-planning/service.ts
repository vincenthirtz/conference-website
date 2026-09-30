// features/admin/staff-planning/service.ts — planning du staff : disponibilités
// par personne et par jour (cast, modération, prod OBS, gestion du live).
//
// Deux sources : la saisie à la main (`manual`) et l'import du tableur partagé
// (`csv`, lu côté navigateur par utils/staffPlanningCsv). Un import RAPPROCHE
// le fichier de l'import précédent des mois qu'il couvre : les créneaux
// disparus du fichier sont retirés, les nouveaux ajoutés, et ceux qui restent
// GARDENT le rôle et la note posés dans l'admin (le tableur n'en porte pas).
// Une saisie manuelle n'est jamais touchée par un import.
//
// La lecture joint les SOIRS DE MATCH de la fenêtre : l'écran montre quels
// soirs sont à couvrir et lesquels ne le sont pas.

import type { z } from 'zod';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import { AdminError } from '@/utils/admin/errors';
import { addDaysYmd, dateAndMinuteInTz } from '@/utils/teams/scrimCalendar';
import type { Audited } from '../_shared/audited';
import * as repo from './repository';
import type {
  StaffPlanningImportBody,
  StaffPlanningSlotCreate,
  StaffPlanningSlotPatch,
} from './schemas';

export type StaffPlanningSlot = NonNullable<
  Awaited<ReturnType<typeof repo.insertSlot>>['row']
>;

/** Un soir de match : nombre de matchs et heure du premier (heure de Paris). */
export type MatchNight = { date: string; count: number; first: string };

export const STAFF_PLANNING_TZ = 'Europe/Paris';
const serverError = () => new AdminError(500, 'internal', 'Server error.');
const MAX_WINDOW_DAYS = 400;
const MAX_REPEAT_WEEKS = 26;

function staffIdOf(ctx: ServiceContext): string | null {
  return ctx.actor.kind === 'staff' ? ctx.actor.staffId : null;
}

/** 'YYYY-MM' → premier et dernier jour du mois. */
export function monthBounds(month: string): { first: string; last: string } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    first: `${month}-01`,
    last: `${month}-${String(last).padStart(2, '0')}`,
  };
}

/** `time` Postgres (« 22:00:00 ») → « 22:00 ». */
const hhmm = (t: string) => t.slice(0, 5);
const pad2 = (n: number) => String(n).padStart(2, '0');

function normalizeSlot<T extends { start_time: string; end_time: string }>(
  row: T
): T {
  return {
    ...row,
    start_time: hhmm(row.start_time),
    end_time: hhmm(row.end_time),
  };
}

/** Matchs (instants ISO) → soirs, à l'heure de Paris. Pur, testé. */
export function groupMatchNights(
  rows: readonly { scheduled_at: string | null; status: string | null }[],
  from: string,
  to: string
): MatchNight[] {
  const byDay = new Map<string, { count: number; minute: number }>();
  for (const r of rows) {
    if (!r.scheduled_at || r.status === 'cancelled') continue;
    const pos = dateAndMinuteInTz(r.scheduled_at, STAFF_PLANNING_TZ);
    if (!pos || pos.ymd < from || pos.ymd > to) continue;
    const cur = byDay.get(pos.ymd);
    if (cur) {
      cur.count += 1;
      cur.minute = Math.min(cur.minute, pos.minute);
    } else byDay.set(pos.ymd, { count: 1, minute: pos.minute });
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      count: v.count,
      first: `${pad2(Math.floor(v.minute / 60))}:${pad2(v.minute % 60)}`,
    }));
}

/** Dates d'une répétition hebdomadaire, `from` compris, `until` inclus. */
export function weeklyDates(from: string, until: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= until && out.length < MAX_REPEAT_WEEKS; ) {
    out.push(d);
    d = addDaysYmd(d, 7);
  }
  return out;
}

/* ---------------------------------------------------------------------------
 * GET — créneaux d'une fenêtre, pseudos connus, soirs de match
 * ------------------------------------------------------------------------ */

export async function listPlanning(
  ctx: ServiceContext,
  query: { from: string; to: string }
): Promise<{
  slots: StaffPlanningSlot[];
  people: string[];
  matchNights: MatchNight[];
}> {
  const span =
    (Date.parse(`${query.to}T00:00:00Z`) -
      Date.parse(`${query.from}T00:00:00Z`)) /
    86_400_000;
  if (!(span >= 0 && span <= MAX_WINDOW_DAYS)) {
    throw new AdminError(400, 'validation', 'Fenêtre de dates invalide.', {
      fields: { to: `Entre 0 et ${MAX_WINDOW_DAYS} jours après from.` },
    });
  }
  // Fenêtre UTC élargie d'un jour de chaque côté : un match à 00:30 heure de
  // Paris tombe la veille en UTC. Le regroupement recoupe ensuite à la date.
  const fromIso = `${addDaysYmd(query.from, -1)}T00:00:00Z`;
  const toIso = `${addDaysYmd(query.to, 2)}T00:00:00Z`;
  const [slots, people, matches] = await Promise.all([
    repo.listSlots(ctx.db, ctx.tenantId, query.from, query.to),
    repo.listPeople(ctx.db, ctx.tenantId),
    repo.listMatchTimes(ctx.db, ctx.tenantId, fromIso, toIso),
  ]);
  if (slots.error || people.error || matches.error) {
    ctx.logger.error('[admin/staff-planning] list error', null, {
      tenantId: ctx.tenantId,
    });
    throw serverError();
  }
  const names = [...new Set(people.rows.map((p) => p.person_name))].sort(
    (a, b) => a.localeCompare(b, 'fr')
  );
  return {
    slots: slots.rows.map(normalizeSlot),
    people: names,
    matchNights: groupMatchNights(matches.rows, query.from, query.to),
  };
}

/* ---------------------------------------------------------------------------
 * POST — un créneau saisi à la main, éventuellement répété chaque semaine
 * ------------------------------------------------------------------------ */

export async function createSlot(
  ctx: ServiceContext,
  body: z.output<typeof StaffPlanningSlotCreate>
): Promise<
  Audited<{ slot: StaffPlanningSlot | null; created: number; skipped: number }>
> {
  if (body.start_time === body.end_time) {
    throw new AdminError(400, 'validation', 'Créneau vide.', {
      fields: { end_time: 'La fin doit différer du début.' },
    });
  }
  const base = {
    tenant_id: ctx.tenantId,
    person_name: body.person_name,
    start_time: body.start_time,
    end_time: body.end_time,
    role: body.role ?? null,
    note: body.note ? body.note : null,
    source: 'manual',
    created_by: staffIdOf(ctx),
  };

  if (body.repeat_until) {
    if (body.repeat_until < body.slot_date) {
      throw new AdminError(400, 'validation', 'Répétition invalide.', {
        fields: { repeat_until: 'Doit suivre le premier jour.' },
      });
    }
    const dates = weeklyDates(body.slot_date, body.repeat_until);
    const { inserted, error } = await repo.insertSlotsIgnoringDuplicates(
      ctx.db,
      dates.map((slot_date) => ({ ...base, slot_date }))
    );
    if (error) {
      ctx.logger.error('[admin/staff-planning] repeat insert error', null, {
        tenantId: ctx.tenantId,
      });
      throw serverError();
    }
    return {
      result: {
        slot: null,
        created: inserted,
        skipped: dates.length - inserted,
      },
      audit: {
        entity_type: 'staff_planning_slot',
        payload: {
          person: body.person_name,
          from: body.slot_date,
          until: body.repeat_until,
          created: inserted,
        },
      },
    };
  }

  const { row, error } = await repo.insertSlot(ctx.db, {
    ...base,
    slot_date: body.slot_date,
  });
  if (error?.code === '23505') {
    throw new AdminError(
      409,
      'conflict',
      'Cette personne a déjà un créneau qui commence à cette heure ce jour-là.'
    );
  }
  if (error || !row) {
    ctx.logger.error('[admin/staff-planning] insert error', null, {
      tenantId: ctx.tenantId,
    });
    throw serverError();
  }
  const slot = normalizeSlot(row);
  return {
    result: { slot, created: 1, skipped: 0 },
    audit: {
      entity_type: 'staff_planning_slot',
      entity_id: slot.id,
      after: slot,
    },
  };
}

/* ---------------------------------------------------------------------------
 * PATCH — rôle, horaires, note
 * ------------------------------------------------------------------------ */

export async function updateSlot(
  ctx: ServiceContext,
  slotId: string,
  body: z.output<typeof StaffPlanningSlotPatch>
): Promise<Audited<{ slot: StaffPlanningSlot }>> {
  if (
    body.start_time !== undefined &&
    body.end_time !== undefined &&
    body.start_time === body.end_time
  ) {
    throw new AdminError(400, 'validation', 'Créneau vide.', {
      fields: { end_time: 'La fin doit différer du début.' },
    });
  }
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (body.start_time !== undefined) patch.start_time = body.start_time;
  if (body.end_time !== undefined) patch.end_time = body.end_time;
  if (body.role !== undefined) patch.role = body.role;
  if (body.note !== undefined) patch.note = body.note ? body.note : null;

  const { row, error } = await repo.updateSlot(
    ctx.db,
    ctx.tenantId,
    slotId,
    patch
  );
  if (error?.code === '23505') {
    throw new AdminError(
      409,
      'conflict',
      'Cette personne a déjà un créneau qui commence à cette heure ce jour-là.'
    );
  }
  if (error) {
    ctx.logger.error('[admin/staff-planning] update error', null, {
      tenantId: ctx.tenantId,
    });
    throw serverError();
  }
  if (!row) throw new AdminError(404, 'not_found', 'Créneau introuvable.');
  const slot = normalizeSlot(row);
  return {
    result: { slot },
    audit: {
      entity_type: 'staff_planning_slot',
      entity_id: slot.id,
      payload: { fields: Object.keys(patch).filter((k) => k !== 'updated_at') },
    },
  };
}

/* ---------------------------------------------------------------------------
 * DELETE
 * ------------------------------------------------------------------------ */

export async function deleteSlot(
  ctx: ServiceContext,
  slotId: string
): Promise<Audited<{ ok: true }>> {
  const { deleted, error } = await repo.deleteSlot(
    ctx.db,
    ctx.tenantId,
    slotId
  );
  if (error) {
    ctx.logger.error('[admin/staff-planning] delete error', null, {
      tenantId: ctx.tenantId,
    });
    throw serverError();
  }
  if (deleted === 0) {
    throw new AdminError(404, 'not_found', 'Créneau introuvable.');
  }
  return {
    result: { ok: true },
    audit: { entity_type: 'staff_planning_slot', entity_id: slotId },
  };
}

/* ---------------------------------------------------------------------------
 * POST /import — le tableur partagé, rapproché de l'import précédent
 * ------------------------------------------------------------------------ */

const keyOf = (person: string, date: string, start: string) =>
  `${person}|${date}|${start}`;

export async function importPlanning(
  ctx: ServiceContext,
  body: z.output<typeof StaffPlanningImportBody>
): Promise<
  Audited<{
    inserted: number;
    kept: number;
    removed: number;
    skipped: number;
    months: string[];
  }>
> {
  const months = [...new Set(body.months)].sort();
  const outside = body.entries.filter(
    (e) => !months.includes(e.date.slice(0, 7))
  );
  if (outside.length > 0) {
    throw new AdminError(400, 'validation', 'Créneau hors des mois importés.', {
      fields: {
        entries: `${outside[0].date} n’est dans aucun mois de months.`,
      },
    });
  }

  // Import précédent des mois couverts, indexé par (personne, jour, début).
  const previous = new Map<string, { id: string; end: string }>();
  for (const month of months) {
    const { first, last } = monthBounds(month);
    const { rows, error } = await repo.listCsvSlots(
      ctx.db,
      ctx.tenantId,
      first,
      last
    );
    if (error) {
      ctx.logger.error('[admin/staff-planning] import read error', null, {
        tenantId: ctx.tenantId,
      });
      throw serverError();
    }
    for (const r of rows) {
      previous.set(keyOf(r.person_name, r.slot_date, hhmm(r.start_time)), {
        id: r.id,
        end: hhmm(r.end_time),
      });
    }
  }

  // Une même personne deux fois au même début (cellule recopiée) : une ligne.
  const incoming = new Map<string, (typeof body.entries)[number]>();
  for (const e of body.entries)
    incoming.set(keyOf(e.person, e.date, e.start), e);

  const toRemove: string[] = [];
  let kept = 0;
  for (const [key, prev] of previous) {
    const next = incoming.get(key);
    // Disparu du fichier, ou fin changée (on remplace : rôle et note suivent).
    if (!next) toRemove.push(prev.id);
    else if (next.end !== prev.end) {
      const { error } = await repo.updateSlot(ctx.db, ctx.tenantId, prev.id, {
        end_time: next.end,
        updated_at: new Date().toISOString(),
      });
      if (error) throw serverError();
      kept += 1;
    } else kept += 1;
  }
  const { error: delErr } = await repo.deleteSlotsByIds(
    ctx.db,
    ctx.tenantId,
    toRemove
  );
  if (delErr) {
    ctx.logger.error('[admin/staff-planning] import purge error', null, {
      tenantId: ctx.tenantId,
    });
    throw serverError();
  }

  const fresh = [...incoming.entries()]
    .filter(([key]) => !previous.has(key))
    .map(([, e]) => ({
      tenant_id: ctx.tenantId,
      person_name: e.person,
      slot_date: e.date,
      start_time: e.start,
      end_time: e.end,
      source: 'csv',
      created_by: staffIdOf(ctx),
    }));
  const { inserted, error } = await repo.insertSlotsIgnoringDuplicates(
    ctx.db,
    fresh
  );
  if (error) {
    ctx.logger.error('[admin/staff-planning] import insert error', null, {
      tenantId: ctx.tenantId,
    });
    throw serverError();
  }
  return {
    result: {
      inserted,
      kept,
      removed: toRemove.length,
      // Doublons d'une saisie manuelle : la saisie gagne.
      skipped: fresh.length - inserted,
      months,
    },
    audit: {
      entity_type: 'staff_planning',
      payload: {
        months,
        entries: body.entries.length,
        inserted,
        kept,
        removed: toRemove.length,
      },
    },
  };
}
