// utils/staffPlanningCsv.ts — lecture du tableur « Calendrier disponibilité »
// du staff (export CSV Google Sheets) vers des créneaux datés.
//
// FORMAT RÉEL DU FICHIER (planning tournois - Calendrier d'horaire de travail) :
//   - un bloc par mois : une ligne « septembre 2026 » en colonne B suivie des
//     numéros de jour dans les colonnes suivantes (l'emplacement du « 1 »
//     varie d'un mois à l'autre) ;
//   - puis une ligne de jours de semaine (Lu, Ma…) — IGNORÉE : elle est
//     décalée dans le fichier d'origine (octobre, novembre), les vraies dates
//     viennent des numéros de jour ;
//   - puis une ligne par personne (nom en colonne B), une cellule par jour :
//     vide, ou une plage « 19h-22h », « 20h30-00 », « 22h-00 » (00 = minuit).
//   - le bloc s'arrête à la première ligne sans nom.
// Pur et sans dépendance : testé seul (tests/unit/staffPlanningCsv.test.ts).

export type StaffPlanningEntry = {
  person: string;
  /** 'YYYY-MM-DD' */
  date: string;
  /** 'HH:MM' */
  start: string;
  /** 'HH:MM' — '00:00' ou antérieur à `start` = se termine le lendemain. */
  end: string;
};

export type StaffPlanningImport = {
  entries: StaffPlanningEntry[];
  /** Toutes les personnes du tableur, créneaux ou non, dans l'ordre du fichier. */
  people: string[];
  /** Mois couverts par le fichier ('YYYY-MM'). */
  months: string[];
  /** Cellules non comprises (« octobre 2026 · Pomme · 12 : "?" »). */
  warnings: string[];
};

const MONTHS: Record<string, number> = {
  janvier: 1,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12,
};

const WEEKDAYS = new Set(['lu', 'ma', 'me', 'je', 've', 'sa', 'di']);
const pad2 = (n: number) => String(n).padStart(2, '0');
const strip = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Découpe CSV minimale : virgules, champs entre guillemets, "" échappé. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** « septembre 2026 » → { year, month } ; sinon null. */
export function parseMonthLabel(
  label: string
): { year: number; month: number } | null {
  const m = strip(label).match(/^([a-z]+)\s+(\d{4})$/);
  if (!m || !MONTHS[m[1]]) return null;
  return { year: Number(m[2]), month: MONTHS[m[1]] };
}

/** « 19h-22h », « 20h30-00 », « 22h - 0h » → { start, end } ; sinon null. */
export function parseTimeRange(
  cell: string
): { start: string; end: string } | null {
  const m = strip(cell)
    .replace(/\s+/g, '')
    .match(/^(\d{1,2})(?:h(\d{2})?)?[-–a](\d{1,2})(?:h(\d{2})?)?$/);
  if (!m) return null;
  const [sh, sm, eh, em] = [m[1], m[2] ?? '0', m[3], m[4] ?? '0'].map(Number);
  if (sh > 23 || eh > 24 || sm > 59 || em > 59) return null;
  return {
    start: `${pad2(sh)}:${pad2(sm)}`,
    end: `${pad2(eh % 24)}:${pad2(em)}`,
  };
}

/** « P1xel ( Orange Ribbit ) » → « P1xel (Orange Ribbit) ». */
export function cleanPersonName(raw: string): string {
  return raw
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s+/g, ' ')
    .trim();
}

function isWeekdayRow(row: string[]): boolean {
  const cells = row.map(strip).filter(Boolean);
  return cells.length > 0 && cells.every((c) => WEEKDAYS.has(c));
}

export function parseStaffPlanningCsv(text: string): StaffPlanningImport {
  const rows = parseCsvRows(text);
  const entries: StaffPlanningEntry[] = [];
  const people: string[] = [];
  const months: string[] = [];
  const warnings: string[] = [];

  for (let r = 0; r < rows.length; r++) {
    const head = parseMonthLabel(rows[r][1] ?? '');
    if (!head) continue;
    const monthKey = `${head.year}-${pad2(head.month)}`;
    const daysInMonth = new Date(
      Date.UTC(head.year, head.month, 0)
    ).getUTCDate();
    if (!months.includes(monthKey)) months.push(monthKey);

    // Colonne → numéro du jour, lus sur la ligne du mois elle-même.
    const dayOfCol = new Map<number, number>();
    rows[r].forEach((cell, c) => {
      if (c < 2 || !/^\d{1,2}$/.test(cell.trim())) return;
      const d = Number(cell);
      if (d >= 1 && d <= daysInMonth) dayOfCol.set(c, d);
    });

    let p = r + 1;
    if (rows[p] && isWeekdayRow(rows[p])) p++;
    for (; p < rows.length; p++) {
      const rawName = (rows[p][1] ?? '').trim();
      if (!rawName || parseMonthLabel(rawName)) break;
      const person = cleanPersonName(rawName);
      if (!people.includes(person)) people.push(person);
      rows[p].forEach((cell, c) => {
        const value = cell.trim();
        if (c < 2 || !value) return;
        const day = dayOfCol.get(c);
        const range = parseTimeRange(value);
        if (!day || !range) {
          warnings.push(
            `${rows[r][1].trim()} · ${person} · colonne ${c + 1} : « ${value} »`
          );
          return;
        }
        entries.push({
          person,
          date: `${monthKey}-${pad2(day)}`,
          ...range,
        });
      });
    }
    r = p - 1;
  }

  entries.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.start.localeCompare(b.start) ||
      a.person.localeCompare(b.person)
  );
  return { entries, people, months, warnings };
}
