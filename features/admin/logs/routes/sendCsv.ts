// features/admin/logs/routes/sendCsv.ts — écrit un export CSV téléchargeable.

import type { NextApiResponse } from 'next';
import type { CsvFile } from '../service';

export function sendCsv(res: NextApiResponse, file: CsvFile): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${file.filename}"`
  );
  // BOM UTF-8 pour Excel.
  res.status(200).end('﻿' + file.content);
}
