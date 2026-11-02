// scripts/db-schema-encrypt.mjs — chiffre le relevé de structure de la base (docs/D1-MIGRATION.md,
// lot 2) pour une clé publique, avant qu'il quitte la CI d'un dépôt public.
//
// AES-256-GCM pour le fichier, clé AES chiffrée en RSA-OAEP (SHA-256) avec
// scripts/db-schema-dump-public-key.txt. Seule la clé privée correspondante, gardée hors de ce dépôt, le
// relit. Ce script refuse un relevé qui contiendrait des données : un `COPY … FROM stdin` ou un
// `INSERT INTO` hors du corps d'une fonction (ces corps, entre `$…$`, en contiennent normalement).
//
// Usage : node scripts/db-schema-encrypt.mjs <schema.sql> <sortie.json>

import {
  constants,
  createCipheriv,
  publicEncrypt,
  randomBytes,
} from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error(
    'Usage : node scripts/db-schema-encrypt.mjs <schema.sql> <sortie.json>'
  );
  process.exit(1);
}

const sql = readFileSync(input);
const text = sql.toString('utf8');
// Sans le corps des fonctions : `$$ … $$` ou `$tag$ … $tag$`.
const outsideBodies = text.replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, '');
if (/^\s*(COPY\s[^;]*\bFROM\s+stdin\b|INSERT\s+INTO\s)/im.test(outsideBodies)) {
  console.error('Le relevé contient des données (COPY ou INSERT) : refusé.');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const publicKey = readFileSync(
  join(here, 'db-schema-dump-public-key.txt'),
  'utf8'
);

const key = randomBytes(32);
const iv = randomBytes(12);
const cipher = createCipheriv('aes-256-gcm', key, iv);
const body = Buffer.concat([cipher.update(sql), cipher.final()]);

writeFileSync(
  output,
  JSON.stringify({
    alg: 'RSA-OAEP-256+A256GCM',
    key: publicEncrypt(
      {
        key: publicKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      key
    ).toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    body: body.toString('base64'),
  })
);

// Des nombres seulement : le dépôt est public.
const count = (re) => (text.match(re) || []).length;
console.log(
  `relevé chiffré : ${text.split('\n').length} lignes, ${count(/^CREATE TABLE /gm)} tables, ` +
    `${count(/^CREATE (OR REPLACE )?FUNCTION /gm)} fonctions, ${count(/^CREATE (OR REPLACE )?TRIGGER /gm)} déclencheurs, ` +
    `${count(/^CREATE (UNIQUE )?INDEX /gm)} index, ${count(/^CREATE POLICY /gm)} règles`
);
