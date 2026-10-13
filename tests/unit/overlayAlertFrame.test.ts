// L'HABILLAGE DE LA BOÎTE D'ALERTES — le fichier livré est celui qu'on a inspecté.
//
// `public/overlay/alerts/noeud.webm` doit être un VP9 profil 0 AVEC alpha, le
// seul que le CEF d'OBS décode (incident du 2026-09-23 : PIPELINE_ERROR_DECODE,
// boîte d'alertes sans habillage en plein direct). L'inspecteur du conteneur
// (`utils/uploads/webmCodec.ts`) vit dans conference-api, avec une COPIE FIGÉE
// de ce fichier (`tests/fixtures/overlay/noeud.webm`) qu'il inspecte là-bas.
//
// Ici on garantit l'autre moitié : le fichier réellement servi est bien celui
// qui a été inspecté. Même empreinte des deux côtés, à dessein. Changer
// l'habillage = refaire passer l'inspection côté API sur la nouvelle copie,
// puis mettre à jour l'empreinte ici ET là-bas.

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const FRAME_PATH = path.join(
  process.cwd(),
  'public',
  'overlay',
  'alerts',
  'noeud.webm'
);

/** Même littéral que conference-api/tests/unit/overlayAlertFrame.test.ts. */
const INSPECTED_FRAME_SHA256 =
  '698cfbca41b5f5191d3bc01482bb851eccc2a28bcfb60449b875e1f70178ab9c';

describe("habillage de la boîte d'alertes — fichier livré", () => {
  it('est un WebM, et exactement celui inspecté côté API', () => {
    const buf = fs.readFileSync(FRAME_PATH);
    expect(buf.subarray(0, 4)).toEqual(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    expect(createHash('sha256').update(buf).digest('hex')).toBe(
      INSPECTED_FRAME_SHA256
    );
  });
});
