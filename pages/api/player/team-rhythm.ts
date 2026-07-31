// pages/api/player/team-rhythm.ts
//
// Rythme d'équipe (N1) — disponibilité RÉCURRENTE du roster.
//
// GET  : la grille de mon équipe (ma déclaration, la heatmap agrégée, le noyau,
//        et les prochaines occurrences concrètes du noyau).
// PUT  : ma propre déclaration (créneaux + fuseau).
//
// Point important sur l'AUTORISATION : contrairement à presque toutes les
// routes d'équipe, celle-ci n'exige AUCUNE permission de gestion. Déclarer sa
// disponibilité est un geste de membre, pas de capitaine — et c'est
// précisément l'objectif : donner enfin quelque chose à faire aux 4 personnes
// d'un roster qui n'ont aujourd'hui aucune raison d'ouvrir le site.
// Seule l'action dérivée « annoncer ces créneaux » (création d'une recherche de
// scrim) reste gardée par `manage_scrims` ; on renvoie donc `canAnnounce` pour
// que l'UI n'affiche pas un bouton qui échouerait.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequestAsync } from '@/utils/tenant';
import { hasTeamPermission } from '@/utils/teams/permissions';
import { findMemberTeam } from '@/utils/teams/memberTeam';
import {
  buildRhythmHeatmap,
  coreRhythmSlots,
  normalizeRhythmSlots,
  projectRhythmSlots,
  rhythmCoreThreshold,
  type RhythmHeatmap,
  type RhythmMemberInput,
} from '@/utils/teams/teamRhythm';
import {
  isSearchLive,
  MAX_SEARCH_SLOTS,
  type ScrimSearchRow,
} from '@/utils/teams/scrimSearch';
import { loadPlayedGames } from '@/utils/teams/playedGames';
import {
  announcedSlotKeys,
  pickTrainingSlot,
  tallyPlayedBySlot,
  type TrainingSuggestion,
} from '@/utils/teams/trainingSuggestion';
import { getTimeZoneOffsetMinutes } from '@/utils/timezone';
import { logger } from '@/utils/logger';

const DEFAULT_TIMEZONE = 'Europe/Paris';

export type TeamRhythmResponse = {
  teamId: string | null;
  teamName: string | null;
  /** Fuseau dans lequel la heatmap et le noyau sont exprimés. */
  referenceTimezone: string;
  /** Ma déclaration (clés de créneaux) et mon fuseau. */
  mySlots: string[];
  myTimezone: string;
  /** Nom d'affichage par `user_id` — pour dire QUI est dispo sur un créneau. */
  memberNames: Record<string, string>;
  /** Effectif pris en compte pour le seuil de noyau. */
  memberCount: number;
  /** Nombre de membres ayant déclaré quelque chose. */
  declaredCount: number;
  threshold: number;
  heatmap: RhythmHeatmap;
  coreSlots: string[];
  /** Prochaines occurrences réelles du noyau, prêtes pour une annonce. */
  suggestedSlots: string[];
  /**
   * Créneau d'entraînement suggéré (N6) : disponible et pourtant jamais joué.
   * `null` quand il n'y a rien à proposer — cas normal.
   */
  suggestion: TrainingSuggestion | null;
  /** Prochaines occurrences du seul créneau suggéré. */
  suggestionSlots: string[];
  /** L'utilisateur peut-il créer la recherche de scrim depuis le noyau ? */
  canAnnounce: boolean;
};

/** Un fuseau IANA que le runtime sait interpréter — sinon on retombe sur Paris. */
function safeTimezone(input: unknown): string | null {
  if (typeof input !== 'string' || !input.trim()) return null;
  const tz = input.trim();
  if (tz.length > 64) return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return null;
  }
}

type MemberRow = {
  user_id: string | null;
  display_name: string | null;
};

type AvailabilityRow = {
  user_id: string;
  timezone: string | null;
  slots: unknown;
};

const EMPTY: Omit<TeamRhythmResponse, 'referenceTimezone'> = {
  teamId: null,
  teamName: null,
  mySlots: [],
  myTimezone: DEFAULT_TIMEZONE,
  memberNames: {},
  memberCount: 0,
  declaredCount: 0,
  threshold: 1,
  heatmap: {},
  coreSlots: [],
  suggestedSlots: [],
  suggestion: null,
  suggestionSlots: [],
  canAnnounce: false,
};

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  const isGet = req.method === 'GET';
  const isPut = req.method === 'PUT';
  if (!isGet && !isPut) {
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (
    applyRateLimit(
      req,
      res,
      isPut ? { max: 30, windowMs: 60_000 } : { max: 60, windowMs: 60_000 },
      'team-rhythm'
    )
  ) {
    return;
  }

  const tenantId = await resolveTenantIdForUserRequestAsync(req, {
    authUserId: user.id,
  });

  const team = await findMemberTeam(user.id, tenantId);

  if (!team) {
    // Pas d'équipe : ce n'est pas une erreur, il n'y a simplement pas de rythme.
    if (isPut) {
      return res
        .status(403)
        .json({ error: 'Tu dois appartenir à une équipe active.' });
    }
    return res
      .status(200)
      .json({ ...EMPTY, referenceTimezone: DEFAULT_TIMEZONE });
  }

  if (isPut) {
    const body = (req.body ?? {}) as { slots?: unknown; timezone?: unknown };
    const normalized = normalizeRhythmSlots(body.slots);
    if (!normalized.ok) {
      return res.status(400).json({ error: normalized.error });
    }
    const timezone = safeTimezone(body.timezone) ?? DEFAULT_TIMEZONE;

    const { error } = await supabaseAdmin.from('team_availability').upsert(
      {
        tenant_id: tenantId,
        team_id: team.id,
        user_id: user.id,
        timezone,
        slots: normalized.slots,
      },
      { onConflict: 'team_id,user_id' }
    );

    if (error) {
      logger.error('[team-rhythm] upsert error', error);
      return res
        .status(500)
        .json({ error: 'Enregistrement de tes créneaux impossible.' });
    }
    // On ne renvoie pas la grille recalculée : l'UI recharge, et un PUT qui
    // renverrait un agrégat coûterait une lecture complète à chaque clic.
    return res.status(200).json({ ok: true, slots: normalized.slots });
  }

  const [membersRes, availabilityRes, canAnnounce] = await Promise.all([
    supabaseAdmin
      .from('team_members')
      .select('user_id, display_name')
      .eq('team_id', team.id)
      .eq('tenant_id', tenantId),
    supabaseAdmin
      .from('team_availability')
      .select('user_id, timezone, slots')
      .eq('team_id', team.id)
      .eq('tenant_id', tenantId),
    hasTeamPermission(user.id, team.id, 'manage_scrims'),
  ]);

  if (membersRes.error) {
    logger.error('[team-rhythm] members error', membersRes.error);
    return res.status(500).json({ error: 'Lecture du roster impossible.' });
  }
  if (availabilityRes.error) {
    logger.error('[team-rhythm] availability error', availabilityRes.error);
    return res.status(500).json({ error: 'Lecture des créneaux impossible.' });
  }

  const members = (membersRes.data || []) as MemberRow[];
  const memberIds = new Set(
    members.map((m) => m.user_id).filter((id): id is string => !!id)
  );

  const rows = (availabilityRes.data || []) as AvailabilityRow[];
  const mine = rows.find((r) => r.user_id === user.id) ?? null;

  const myTimezone =
    safeTimezone(mine?.timezone) ??
    safeTimezone(req.query.tz) ??
    DEFAULT_TIMEZONE;

  // Fuseau de référence = le mien : la grille est lue par quelqu'un, et c'est
  // son heure locale qui doit être juste. Les autres sont reprojetés.
  const referenceTimezone = myTimezone;

  const inputs: RhythmMemberInput[] = [];
  for (const row of rows) {
    // Une déclaration orpheline (membre parti depuis) ne doit pas gonfler le
    // noyau — on la garde en base (historique) mais on l'ignore ici.
    if (!memberIds.has(row.user_id)) continue;
    const normalized = normalizeRhythmSlots(row.slots);
    if (!normalized.ok || normalized.slots.length === 0) continue;
    inputs.push({
      userId: row.user_id,
      timezone: safeTimezone(row.timezone) ?? DEFAULT_TIMEZONE,
      slots: normalized.slots,
    });
  }

  const heatmap = buildRhythmHeatmap(inputs, referenceTimezone);
  const memberCount = memberIds.size;
  const threshold = rhythmCoreThreshold(memberCount);
  const core = coreRhythmSlots(heatmap, threshold);

  // Noms pour l'infobulle « qui est dispo ce créneau ». Sans eux, la heatmap
  // n'est qu'un compteur : on voit qu'il manque quelqu'un, pas qui.
  const memberNames: Record<string, string> = {};
  for (const m of members) {
    if (m.user_id) memberNames[m.user_id] = m.display_name || '—';
  }

  const myNormalized = normalizeRhythmSlots(mine?.slots ?? []);

  // Suggestion d'entraînement (N6) : le créneau où l'équipe est disponible et
  // ne joue pourtant jamais. C'est la seule information du rythme qui fasse
  // AGIR — « vous êtes au complet » constate, « et vous n'y jouez jamais »
  // propose. Best-effort : une erreur de lecture n'empêche pas la grille.
  const offsetMinutes = getTimeZoneOffsetMinutes(new Date(), referenceTimezone);
  let suggestion: TrainingSuggestion | null = null;
  try {
    const [games, searchesRes] = await Promise.all([
      loadPlayedGames(tenantId, team.id),
      supabaseAdmin
        .from('scrim_searches')
        .select('team_id, slots, status, expires_at')
        .eq('tenant_id', tenantId)
        .eq('team_id', team.id)
        .eq('status', 'active'),
    ]);
    const liveSlots = ((searchesRes.data || []) as ScrimSearchRow[])
      .filter((s) => isSearchLive(s))
      .flatMap((s) => s.slots || []);

    suggestion = pickTrainingSlot({
      coreSlots: core,
      heatmap,
      playedBySlot: tallyPlayedBySlot(
        games.map((g) => g.playedAt),
        offsetMinutes
      ),
      announcedSlots: announcedSlotKeys(liveSlots, offsetMinutes),
    });
  } catch (err) {
    logger.error('[team-rhythm] suggestion error', err);
  }

  const payload: TeamRhythmResponse = {
    suggestion,
    /** Prochaines occurrences du seul créneau suggéré, prêtes à annoncer. */
    suggestionSlots: suggestion
      ? projectRhythmSlots([suggestion.slot], referenceTimezone, { max: 4 })
      : [],
    teamId: team.id,
    teamName: team.name,
    referenceTimezone,
    mySlots: myNormalized.ok ? myNormalized.slots : [],
    myTimezone,
    memberNames,
    memberCount,
    declaredCount: inputs.length,
    threshold,
    heatmap,
    coreSlots: core,
    suggestedSlots: projectRhythmSlots(core, referenceTimezone, {
      max: MAX_SEARCH_SLOTS,
    }),
    canAnnounce,
  };

  res.setHeader('Cache-Control', 'private, max-age=15');
  return res.status(200).json(payload);
});
