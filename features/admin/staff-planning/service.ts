// features/admin/staff-planning/service.ts — planning du staff : disponibilités
// par personne et par jour (cast, modération, prod OBS, gestion du live).
//
// Deux sources : la saisie à la main (`manual`) et l'import du tableur partagé
// (`csv`, lu côté navigateur par utils/staffPlanningCsv). Un import REMPLACE
// l'import précédent des mois qu'il couvre, et ne touche jamais une saisie
// manuelle — un tableur réexporté chaque semaine ne crée pas de doublons, et
// une correction faite dans l'admin survit.

import type { z } from 'zod';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import { AdminError } from '@/utils/admin/errors';
import type { Audited } from '../_shared/audited';
import * as repo from './repository';
import type {
  StaffPlanningImportBody,
  StaffPlanningSlotCreate,
} from './schemas';

export type StaffPlanningSlot = NonNullable<
  Awaited<ReturnType<typeof repo.insertSlot>>['row']
>;

const serverError = () => new AdminError(500, 'internal', 'Server error.');
const MAX_WINDOW_DAYS = 400;

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

function normalizeSlot<T extends { start_time: string; end_time: string }>(
  row: T
): T {
  return {
    ...row,
    start_time: hhmm(row.start_time),
    end_time: hhmm(row.end_time),
  };
}

/* ---------------------------------------------------------------------------
 * GET — créneaux d'une fenêtre + pseudos connus
 * ------------------------------------------------------------------------ */

export async function listPlanning(
  ctx: ServiceContext,
  query: { from: string; to: string }
): Promise<{ slots: StaffPlanningSlot[]; people: string[] }> {
  const span =
    (Date.parse(`${query.to}T00:00:00Z`) -
      Date.parse(`${query.from}T00:00:00Z`)) /
    86_400_000;
  if (!(span >= 0 && span <= MAX_WINDOW_DAYS)) {
    throw new AdminError(400, 'validation', 'Fenêtre de dates invalide.', {
      fields: { to: `Entre 0 et ${MAX_WINDOW_DAYS} jours après from.` },
    });
  }
  const [slots, people] = await Promise.all([
    repo.listSlots(ctx.db, ctx.tenantId, query.from, query.to),
    repo.listPeople(ctx.db, ctx.tenantId),
  ]);
  if (slots.error || people.error) {
    ctx.logger.error('[admin/staff-planning] list error', null, {
      tenantId: ctx.tenantId,
    });
    throw serverError();
  }
  const names = [...new Set(people.rows.map((p) => p.person_name))].sort(
    (a, b) => a.localeCompare(b, 'fr')
  );
  return { slots: slots.rows.map(normalizeSlot), people: names };
}

/* ---------------------------------------------------------------------------
 * POST — un créneau saisi à la main
 * ------------------------------------------------------------------------ */

export async function createSlot(
  ctx: ServiceContext,
  body: z.output<typeof StaffPlanningSlotCreate>
): Promise<Audited<{ slot: StaffPlanningSlot }>> {
  if (body.start_time === body.end_time) {
    throw new AdminError(400, 'validation', 'Créneau vide.', {
      fields: { end_time: 'La fin doit différer du début.' },
    });
  }
  const { row, error } = await repo.insertSlot(ctx.db, {
    tenant_id: ctx.tenantId,
    person_name: body.person_name,
    slot_date: body.slot_date,
    start_time: body.start_time,
    end_time: body.end_time,
    role: body.role ?? null,
    note: body.note ? body.note : null,
    source: 'manual',
    created_by: staffIdOf(ctx),
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
    result: { slot },
    audit: {
      entity_type: 'staff_planning_slot',
      entity_id: slot.id,
      after: slot,
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
 * POST /import — le tableur partagé
 * ------------------------------------------------------------------------ */

export async function importPlanning(
  ctx: ServiceContext,
  body: z.output<typeof StaffPlanningImportBody>
): Promise<Audited<{ inserted: number; skipped: number; months: string[] }>> {
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

  for (const month of months) {
    const { first, last } = monthBounds(month);
    const { error } = await repo.deleteCsvSlotsOfMonth(
      ctx.db,
      ctx.tenantId,
      first,
      last
    );
    if (error) {
      ctx.logger.error('[admin/staff-planning] import purge error', null, {
        tenantId: ctx.tenantId,
      });
      throw serverError();
    }
  }

  // Une même personne deux fois au même début (cellule recopiée) : une ligne.
  const seen = new Set<string>();
  const rows = body.entries
    .filter((e) => {
      const k = `${e.person}|${e.date}|${e.start}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .map((e) => ({
      tenant_id: ctx.tenantId,
      person_name: e.person,
      slot_date: e.date,
      start_time: e.start,
      end_time: e.end,
      source: 'csv',
      created_by: staffIdOf(ctx),
    }));

  const { inserted, error } = await repo.insertCsvSlots(ctx.db, rows);
  if (error) {
    ctx.logger.error('[admin/staff-planning] import insert error', null, {
      tenantId: ctx.tenantId,
    });
    throw serverError();
  }
  return {
    result: { inserted, skipped: body.entries.length - inserted, months },
    audit: {
      entity_type: 'staff_planning',
      payload: { months, entries: body.entries.length, inserted },
    },
  };
}
