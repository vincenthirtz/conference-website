// utils/matches/evidence.ts
//
// Shared server-side helpers for match evidence (feature "Integrite des
// resultats & anti-triche", slice 1 : preuve + reconciliation).
//
// Both the bot-facing captain endpoint
// (pages/api/bot/v1/matches/[matchId]/evidence.ts) and the staff-facing admin
// endpoint (pages/api/admin/matches/[matchId]/evidence.ts) reuse this module so
// the base64 decode + magic-byte validation + upload + signed-URL logic stays
// in ONE place (mirrors the posture of pages/api/admin/upload.ts, factored).
//
// The `match-evidence` Storage bucket is PRIVATE (RLS-only, service role). We
// never expose `storage_path` to clients — reads go through short-lived signed
// URLs produced by `signEvidenceUrl`.

import crypto from 'crypto';
import { supabaseAdmin } from '@/utils/supabase';

export const EVIDENCE_BUCKET = 'match-evidence';

/** Hard cap on a single evidence upload (before base64 decoding overhead). */
export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024; // ~10 MB

export type EvidenceKind = 'screenshot' | 'replay_file' | 'replay_url';

/* ---------------------------------------------------------------------------
 * Magic-byte sniffing for screenshots (png / jpeg / webp) — same signatures as
 * pages/api/admin/upload.ts. We SNIFF the declared kind rather than trust a
 * client-sent mime type, so CodeQL taint tracking sees a typed extraction.
 * ------------------------------------------------------------------------- */

type ImageSignature = {
  mime: string;
  ext: string;
  test: (b: Buffer) => boolean;
};

const IMAGE_SIGNATURES: ImageSignature[] = [
  {
    mime: 'image/png',
    ext: 'png',
    test: (b) =>
      b.length >= 4 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47,
  },
  {
    mime: 'image/jpeg',
    ext: 'jpg',
    test: (b) =>
      b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    // "RIFF"...."WEBP" — bytes 8-11 disambiguate WebP from WAV/AVI.
    mime: 'image/webp',
    ext: 'webp',
    test: (b) =>
      b.length >= 12 &&
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50,
  },
];

/**
 * Allowlist of replay-container extensions we accept for `replay_file`. Replay
 * formats vary wildly per game and have no reliable universal magic bytes, so
 * we store them as `application/octet-stream` and gate purely on a pragmatic
 * extension allowlist (per the slice-1 spec).
 *
 *  - dem      : Source / CS2 demos
 *  - replay   : Rocket League
 *  - rofl     : League of Legends
 *  - ow / owr : Overwatch highlight / replay exports
 *  - rec      : generic recordings
 *  - vlr      : misc replay containers
 *  - zip / gz : bundled replays
 */
export const REPLAY_EXT_ALLOWLIST = new Set([
  'dem',
  'replay',
  'rofl',
  'ow',
  'owr',
  'rec',
  'vlr',
  'zip',
  'gz',
]);

export type DecodedEvidence = {
  buffer: Buffer;
  mime: string;
  ext: string;
  sizeBytes: number;
  sha256: string;
};

export type DecodeResult =
  | { ok: true; value: DecodedEvidence }
  | { ok: false; error: string };

/**
 * Decode a base64 payload for a binary evidence kind (screenshot / replay_file),
 * enforce the size cap, and validate the content:
 *   - screenshot  : magic bytes must match png/jpg/webp (mime/ext derived from
 *                   the actual bytes, never a client-supplied mime).
 *   - replay_file : extension from `filename` must be on REPLAY_EXT_ALLOWLIST;
 *                   stored as application/octet-stream.
 * Returns the decoded buffer + derived mime/ext + sha256 on success.
 */
export function decodeEvidencePayload(
  kind: 'screenshot' | 'replay_file',
  fileBase64: string,
  filename: string
): DecodeResult {
  const base64Data = fileBase64.replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');

  if (buffer.length === 0) {
    return { ok: false, error: 'Fichier vide ou base64 invalide.' };
  }
  if (buffer.length > MAX_EVIDENCE_BYTES) {
    const maxMo = Math.round(MAX_EVIDENCE_BYTES / (1024 * 1024));
    return { ok: false, error: `Fichier trop lourd (max ${maxMo} Mo).` };
  }

  let mime: string;
  let ext: string;

  if (kind === 'screenshot') {
    const sig = IMAGE_SIGNATURES.find((s) => s.test(buffer));
    if (!sig) {
      return {
        ok: false,
        error:
          'Le contenu du fichier ne correspond pas à une image PNG, JPEG ou WebP.',
      };
    }
    mime = sig.mime;
    ext = sig.ext;
  } else {
    const rawExt = (filename.split('.').pop() ?? '').toLowerCase();
    if (!rawExt || !REPLAY_EXT_ALLOWLIST.has(rawExt)) {
      return {
        ok: false,
        error: `Extension de replay non supportée (.${rawExt || '?'}). Formats acceptés : ${[
          ...REPLAY_EXT_ALLOWLIST,
        ].join(', ')}.`,
      };
    }
    mime = 'application/octet-stream';
    ext = rawExt;
  }

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  return {
    ok: true,
    value: { buffer, mime, ext, sizeBytes: buffer.length, sha256 },
  };
}

/** Deterministic storage path for an evidence object inside the bucket. */
export function buildEvidencePath(
  tenantId: string,
  matchId: string,
  evidenceId: string,
  ext: string
): string {
  return `${tenantId}/${matchId}/${evidenceId}.${ext}`;
}

/**
 * Upload a decoded evidence buffer to the private `match-evidence` bucket via
 * the service-role client. Returns `{ error }` (string message) on failure.
 */
export async function uploadEvidenceObject(
  path: string,
  buffer: Buffer,
  contentType: string
): Promise<{ error: string | null }> {
  if (!supabaseAdmin) return { error: 'Service role indisponible.' };
  const { error } = await supabaseAdmin.storage
    .from(EVIDENCE_BUCKET)
    .upload(path, buffer, { contentType, upsert: false });
  return { error: error ? error.message : null };
}

/**
 * Produce a short-lived signed URL for a stored evidence object. Returns null
 * on failure (caller decides how to surface a missing/expired object).
 */
export async function signEvidenceUrl(
  path: string,
  ttlSeconds = 600
): Promise<string | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrl(path, ttlSeconds);
  if (error || !data) return null;
  return data.signedUrl ?? null;
}
