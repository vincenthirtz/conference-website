// /api/bot/v1/matches/[matchId]/evidence
//
// Feature "Integrite des resultats & anti-triche", slice 1 : preuve.
//
// POST — un capitaine (depuis Discord) attache une preuve a un match :
//        capture d'ecran, fichier replay, ou lien externe (VOD, replay
//        hebergé). Le fichier binaire est valide (taille + magic bytes),
//        hashe (sha256), uploade dans le bucket PRIVE `match-evidence` via
//        le service role, puis une row `match_evidence` est inseree avec
//        team_side = camp du capitaine appelant.
//
// GET  — liste les preuves d'un match (vue capitaine). Chaque item binaire
//        est accompagne d'une URL SIGNEE courte-duree (jamais le storage_path
//        brut) ; les liens exposent external_url.
//
// Auth : x-api-key (BOT_API_KEY per-tenant). Identite du capitaine verifiee
// via user_discord_links -> teams.captain_id (meme convention que report.ts /
// dispute.ts). Route "basic" (pas de gate Régie+) : soumettre une preuve fait
// partie du flux de report de base.

import { z } from 'zod';
import crypto from 'crypto';
import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import {
  discordIdSchema,
  uuidSchema,
  httpUrlSchema,
  boundedString,
} from '@/utils/botValidation';
import {
  decodeEvidencePayload,
  buildEvidencePath,
  uploadEvidenceObject,
  signEvidenceUrl,
} from '@/utils/matches/evidence';
import { logPlayerAction } from '@/utils/botPlayerLogs';
import { logger } from '@/utils/logger';

// Le body peut porter un fichier binaire en base64 (~10 Mo max -> ~13.4 Mo en
// base64 + overhead JSON). La limite par defaut de Next (1mb) le rejetterait.
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '15mb',
    },
  },
};

const noteSchema = boundedString(1, 1000).optional();

// Body POST : union discriminee sur `kind`. discordUserId identifie le
// capitaine (meme champ que report.ts, contrat stable).
const evidencePostSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('screenshot'),
    discordUserId: discordIdSchema,
    file_base64: z.string().min(1, 'file_base64 requis.'),
    filename: boundedString(1, 255),
    note: noteSchema,
  }),
  z.object({
    kind: z.literal('replay_file'),
    discordUserId: discordIdSchema,
    file_base64: z.string().min(1, 'file_base64 requis.'),
    filename: boundedString(1, 255),
    note: noteSchema,
  }),
  z.object({
    kind: z.literal('replay_url'),
    discordUserId: discordIdSchema,
    external_url: httpUrlSchema,
    note: noteSchema,
  }),
]);

// Query : matchId (path) toujours ; actorDiscordUserId requis cote GET.
const evidenceQuerySchema = z.object({
  matchId: uuidSchema,
  actorDiscordUserId: discordIdSchema.optional(),
});

type MatchTeam = {
  id: string;
  name: string | null;
  captain_id: string | null;
};

/**
 * Charge le match + ses deux equipes (scopé tenant) et renvoie les refs
 * normalisees. Renvoie null (+ ecrit la reponse) sur 404/erreur.
 */
async function loadMatchTeams(
  req: BotTenantRequest,
  res: NextApiResponse,
  matchId: string
): Promise<{ team1: MatchTeam; team2: MatchTeam } | null> {
  const { data: match, error } = await supabaseAdmin
    .from('matches')
    .select(
      `id, team1_id, team2_id,
       team1:team1_id (id, name, captain_id),
       team2:team2_id (id, name, captain_id)`
    )
    .eq('tenant_id', req.botContext.tenantId)
    .eq('id', matchId)
    .maybeSingle();

  if (error) {
    logger.error('[bot/matches/evidence] match lookup error', error);
    res.status(500).json({ error: 'Erreur de lecture du match' });
    return null;
  }
  if (!match) {
    res.status(404).json({ error: 'Match introuvable' });
    return null;
  }

  const t1 = Array.isArray((match as any).team1)
    ? (match as any).team1[0]
    : (match as any).team1;
  const t2 = Array.isArray((match as any).team2)
    ? (match as any).team2[0]
    : (match as any).team2;

  if (!t1?.id || !t2?.id) {
    res.status(400).json({ error: 'Match incomplet (equipes non assignees)' });
    return null;
  }
  return { team1: t1 as MatchTeam, team2: t2 as MatchTeam };
}

type CaptainResolution = { side: 1 | 2; authUserId: string };

/**
 * Resout le compte Discord -> capitaine d'une des deux equipes, renvoie le
 * team_side + l'auth_user_id. Renvoie null (+ ecrit un 403) si l'appelant
 * n'est pas capitaine.
 */
async function resolveCaptain(
  req: BotTenantRequest,
  res: NextApiResponse,
  teams: { team1: MatchTeam; team2: MatchTeam },
  discordUserId: string
): Promise<CaptainResolution | null> {
  const captainIds = [teams.team1.captain_id, teams.team2.captain_id].filter(
    (v): v is string => typeof v === 'string'
  );
  if (captainIds.length === 0) {
    res.status(400).json({
      error: 'Capitaines manquants sur le match — preuve impossible.',
    });
    return null;
  }

  const { data: links, error } = await supabaseAdmin
    .from('user_discord_links')
    .select('auth_user_id')
    .in('auth_user_id', captainIds)
    .eq('discord_user_id', discordUserId)
    .limit(1);

  if (error) {
    logger.error('[bot/matches/evidence] link lookup error', error);
    res.status(500).json({ error: 'Erreur de verification capitaine' });
    return null;
  }

  const authId = (links?.[0]?.auth_user_id as string | undefined) ?? null;
  if (!authId) {
    res.status(403).json({
      error:
        "Ce compte Discord n'est pas le capitaine d'une des deux equipes de ce match.",
    });
    return null;
  }
  return {
    side: authId === teams.team1.captain_id ? 1 : 2,
    authUserId: authId,
  };
}

async function handlePost(
  req: BotTenantRequest,
  res: NextApiResponse,
  matchId: string
) {
  const input = req.botInput as z.infer<typeof evidencePostSchema>;

  const teams = await loadMatchTeams(req, res, matchId);
  if (!teams) return;

  const captain = await resolveCaptain(req, res, teams, input.discordUserId);
  if (!captain) return;
  const { side, authUserId } = captain;

  const evidenceId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  let row: Record<string, unknown>;

  if (input.kind === 'replay_url') {
    // Lien externe : external_url renseigne, storage_path null
    // (invariant match_evidence_location_chk).
    row = {
      id: evidenceId,
      match_id: matchId,
      tenant_id: req.botContext.tenantId,
      team_side: side,
      submitted_by_auth_user_id: authUserId,
      discord_user_id: input.discordUserId,
      kind: 'replay_url',
      storage_path: null,
      external_url: input.external_url,
      mime_type: null,
      size_bytes: null,
      sha256: null,
      note: input.note ?? null,
      created_at: nowIso,
    };
  } else {
    // Binaire : decode + validation magic bytes / allowlist + sha256 + upload.
    const decoded = decodeEvidencePayload(
      input.kind,
      input.file_base64,
      input.filename
    );
    if (!decoded.ok) {
      return res.status(400).json({ error: decoded.error });
    }
    const { buffer, mime, ext, sizeBytes, sha256 } = decoded.value;
    const path = buildEvidencePath(
      req.botContext.tenantId,
      matchId,
      evidenceId,
      ext
    );

    const up = await uploadEvidenceObject(path, buffer, mime);
    if (up.error) {
      logger.error('[bot/matches/evidence] upload error', up.error);
      return res.status(500).json({ error: "Impossible d'uploader la preuve" });
    }

    row = {
      id: evidenceId,
      match_id: matchId,
      tenant_id: req.botContext.tenantId,
      team_side: side,
      submitted_by_auth_user_id: authUserId,
      discord_user_id: input.discordUserId,
      kind: input.kind,
      storage_path: path,
      external_url: null,
      mime_type: mime,
      size_bytes: sizeBytes,
      sha256,
      note: input.note ?? null,
      created_at: nowIso,
    };
  }

  const { error: insErr } = await supabaseAdmin
    .from('match_evidence')
    .insert(row);
  if (insErr) {
    logger.error('[bot/matches/evidence] insert error', insErr);
    return res
      .status(500)
      .json({ error: "Echec de l'enregistrement de la preuve" });
  }

  if (authUserId) {
    void logPlayerAction({
      tenantId: req.botContext.tenantId,
      actorAuthUserId: authUserId,
      actorDiscordUserId: input.discordUserId,
      action: 'attach_evidence',
      entityType: 'match',
      entityId: matchId,
      payload: { kind: input.kind, team_side: side, evidence_id: evidenceId },
    });
  }

  return res.status(201).json({ id: evidenceId, kind: input.kind });
}

async function handleGet(
  req: BotTenantRequest,
  res: NextApiResponse,
  matchId: string
) {
  const { actorDiscordUserId } = req.botQuery as z.infer<
    typeof evidenceQuerySchema
  >;
  if (!actorDiscordUserId) {
    return res.status(400).json({ error: 'actorDiscordUserId requis' });
  }

  const teams = await loadMatchTeams(req, res, matchId);
  if (!teams) return;

  const captain = await resolveCaptain(req, res, teams, actorDiscordUserId);
  if (!captain) return;

  const { data: rows, error } = await supabaseAdmin
    .from('match_evidence')
    .select(
      'id, team_side, kind, external_url, mime_type, size_bytes, sha256, note, created_at, storage_path'
    )
    .eq('tenant_id', req.botContext.tenantId)
    .eq('match_id', matchId)
    .order('created_at', { ascending: true });

  if (error) {
    logger.error('[bot/matches/evidence] list error', error);
    return res.status(500).json({ error: 'Erreur de lecture des preuves' });
  }

  const evidence = await Promise.all(
    (rows ?? []).map(async (r) => {
      const rec = r as Record<string, unknown>;
      const storagePath = rec.storage_path as string | null;
      const signedUrl = storagePath ? await signEvidenceUrl(storagePath) : null;
      return {
        id: rec.id as string,
        teamSide: (rec.team_side as number | null) ?? null,
        kind: rec.kind as string,
        externalUrl: (rec.external_url as string | null) ?? null,
        signedUrl,
        mimeType: (rec.mime_type as string | null) ?? null,
        sizeBytes: (rec.size_bytes as number | null) ?? null,
        sha256: (rec.sha256 as string | null) ?? null,
        note: (rec.note as string | null) ?? null,
        createdAt: (rec.created_at as string | null) ?? null,
      };
    })
  );

  return res.status(200).json({ matchId, evidence });
}

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const { matchId } = req.botQuery as z.infer<typeof evidenceQuerySchema>;
  if (req.method === 'GET') return handleGet(req, res, matchId);
  return handlePost(req, res, matchId);
}

export default withBotRoute(handler, {
  methods: ['GET', 'POST'],
  rateLimit: {
    max: 40,
    key: 'bot-match-evidence',
    // Ecriture par capitaine : on borne aussi par acteur (champ POST
    // `discordUserId`) pour qu'un seul capitaine ne draine pas le bucket IP.
    perActor: { max: 10, windowMs: 60_000, actorField: 'discordUserId' },
  },
  idempotent: true,
  bodySchema: evidencePostSchema,
  querySchema: evidenceQuerySchema,
});
