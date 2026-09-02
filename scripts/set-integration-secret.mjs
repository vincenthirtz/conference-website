#!/usr/bin/env node
/**
 * Pose un secret d'intégration chiffré dans `integration_secrets`.
 *
 * POURQUOI UN SCRIPT ET PAS UN FORMULAIRE. Ces secrets se posent une fois, à la
 * mise en service, et se relisent jamais. Une page d'admin pour trois valeurs
 * dans la vie du projet, c'est un écran de plus à traduire, à protéger et à
 * maintenir — et une surface de plus où un secret peut fuiter par une capture
 * d'écran. Le script lit la valeur sur l'entrée standard : elle ne passe donc
 * ni par un argument de ligne de commande (visible dans `ps` et dans
 * l'historique du shell), ni par le réseau autrement que vers Supabase.
 *
 * Usage :
 *   node scripts/set-integration-secret.mjs instagram_app_secret
 *   → colle la valeur, puis Ctrl-D
 *
 * Ou depuis un gestionnaire de mots de passe, sans jamais l'afficher :
 *   pbpaste | node scripts/set-integration-secret.mjs instagram_app_secret
 *
 * Prérequis dans .env.local : NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, SECRETS_ENC_KEY.
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Clés autorisées — miroir de INTEGRATION_SECRET_KEYS côté TypeScript. */
const KNOWN_KEYS = ['google_drive_sa_private_key', 'instagram_app_secret'];

const DEFAULT_TENANT_ID = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';

function loadEnv() {
  const envPath = resolve(__dirname, '..', '.env.local');
  const content = readFileSync(envPath, 'utf-8');
  return Object.fromEntries(
    content
      .split('\n')
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => {
        const idx = l.indexOf('=');
        return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
      })
  );
}

/**
 * Chiffrement identique à `utils/crypto.ts` : AES-256-GCM, clé dérivée par
 * scrypt du secret d'environnement, sortie `v1.<iv>.<tag>.<ct>` en base64url.
 * Le sel de dérivation doit rester le même — c'est lui qui rend la clé
 * reproductible au déchiffrement côté serveur.
 */
function encryptSecret(plaintext, secret) {
  const key = crypto.scryptSync(secret, 'twitch-broadcaster-token-v1', 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    'v1',
    iv.toString('base64url'),
    tag.toString('base64url'),
    ct.toString('base64url'),
  ].join('.');
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8').trim();
}

async function main() {
  const key = process.argv[2];
  if (!key || !KNOWN_KEYS.includes(key)) {
    console.error(
      `Clé manquante ou inconnue.\nClés valides : ${KNOWN_KEYS.join(', ')}`
    );
    process.exit(1);
  }

  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const encKey = env.SECRETS_ENC_KEY || env.TWITCH_TOKEN_ENC_KEY;

  if (!url || !serviceRoleKey) {
    console.error(
      'NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY absent de .env.local.'
    );
    process.exit(1);
  }
  if (!encKey) {
    console.error(
      'SECRETS_ENC_KEY absente de .env.local. Elle DOIT être identique à celle\n' +
        'de la production, sinon le serveur ne pourra pas déchiffrer ce secret.'
    );
    process.exit(1);
  }

  if (process.stdin.isTTY) {
    console.log(`Collez la valeur de « ${key} », puis Ctrl-D :`);
  }
  const value = await readStdin();
  if (!value) {
    console.error('Valeur vide — rien n’a été écrit.');
    process.exit(1);
  }

  const tenantId = process.env.TENANT_ID || DEFAULT_TENANT_ID;
  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { error } = await supabase.from('integration_secrets').upsert(
    {
      tenant_id: tenantId,
      key,
      value_encrypted: encryptSecret(value, encKey),
      updated_at: new Date().toISOString(),
      updated_by: null,
    },
    { onConflict: 'tenant_id,key' }
  );

  if (error) {
    console.error('Écriture impossible :', error.message);
    process.exit(1);
  }

  // On n'affiche JAMAIS la valeur, ni même son début : ce terminal finit dans
  // un historique, et parfois dans une capture d'écran.
  console.log(
    `✅ ${key} enregistré (chiffré) pour le tenant ${tenantId} — ${value.length} caractères.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
