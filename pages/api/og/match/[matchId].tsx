// pages/api/og/match/[matchId].tsx
//
// L'AFFICHE D'UN MATCH, en PNG : carte sociale (1200×630) pour le partage d'un
// lien, et format story (1080×1920) pour ce qu'on poste sur Instagram ou
// TikTok entre deux rencontres.
//
// Pourquoi une seconde taille : une carte panoramique postée en story se
// retrouve minuscule au milieu de l'écran, avec deux bandes vides. Une équipe
// qui veut annoncer son match ne va pas ouvrir un éditeur d'image pour ça —
// donc on produit directement le format qu'elle publie.
//
//   /api/og/match/<uuid>              → 1200×630 (og:image, Twitter card)
//   /api/og/match/<uuid>?format=story → 1080×1920
//
// RUNTIME Node.js (comme og/player) : on convertit l'ImageResponse en Buffer.
//
// NE THROW JAMAIS : toute erreur retombe sur une carte générique. Un crawler
// social doit toujours recevoir un PNG 200, sinon l'aperçu de partage casse.
//
// Aucun logo distant n'est chargé : un fetch échoué casserait toute l'image, et
// les logos d'équipe peuvent pointer n'importe où. On dessine des initiales,
// comme la carte joueuse.

import { ImageResponse } from 'next/og';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

const CARD = { width: 1200, height: 630 };
const STORY = { width: 1080, height: 1920 };

const SITE_NAME = "OW Women's Cup";
const INK = '#0b0710';
const ACCENT = '#cd85ec';

function siteHost(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  if (!raw) return 'owwomenscup.fr';
  try {
    return new URL(raw).host || 'owwomenscup.fr';
  } catch {
    return 'owwomenscup.fr';
  }
}

type CardData = {
  team1: string;
  team2: string;
  score: string | null;
  roundName: string | null;
  tournamentName: string | null;
  dateLabel: string | null;
  finished: boolean;
};

/**
 * Lit le strict nécessaire, et refuse tout ce qui n'est pas public.
 *
 * Même règle que l'overlay et les embeds : un tournoi privé ne sort pas par
 * une URL d'image. Rend `null` dès qu'un doute existe — l'appelant affichera
 * la carte générique.
 */
async function readCardData(matchId: string): Promise<CardData | null> {
  if (!supabaseAdmin) return null;

  const { data, error } = await supabaseAdmin
    .from('matches')
    .select(
      `id, status, scheduled_at, round_name, team1_score, team2_score,
       is_bye, deleted_at,
       team1:team1_id ( name, short_name ),
       team2:team2_id ( name, short_name ),
       tournament:tournament_id ( name, short_name, visibility )`
    )
    .eq('id', matchId)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as unknown as {
    status: string | null;
    scheduled_at: string | null;
    round_name: string | null;
    team1_score: number | null;
    team2_score: number | null;
    is_bye: boolean | null;
    deleted_at: string | null;
    team1: { name?: string | null; short_name?: string | null } | null;
    team2: { name?: string | null; short_name?: string | null } | null;
    tournament: {
      name?: string | null;
      short_name?: string | null;
      visibility?: string | null;
    } | null;
  };

  if (row.deleted_at || row.is_bye) return null;
  if (!row.tournament || row.tournament.visibility !== 'public') return null;

  const finished = (row.status ?? '').toLowerCase() === 'finished';
  const hasScore =
    typeof row.team1_score === 'number' && typeof row.team2_score === 'number';

  return {
    team1: row.team1?.name?.trim() || '—',
    team2: row.team2?.name?.trim() || '—',
    score:
      finished && hasScore ? `${row.team1_score} – ${row.team2_score}` : null,
    roundName: row.round_name?.trim() || null,
    tournamentName:
      row.tournament.name?.trim() || row.tournament.short_name?.trim() || null,
    dateLabel: formatDate(row.scheduled_at),
    finished,
  };
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  }).format(new Date(ms));
}

function initials(name: string): string {
  const cleaned = name.replace(/[^\p{L}\p{N} ]/gu, ' ').trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '??';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

/* ── Rendu ─────────────────────────────────────────────────────────────── */

function TeamBlock({ name, size }: { name: string; size: number }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: size * 0.18,
        maxWidth: size * 3.2,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size,
          height: size,
          borderRadius: size * 0.22,
          background: 'rgba(255,255,255,0.08)',
          border: '2px solid rgba(255,255,255,0.14)',
          fontSize: size * 0.38,
          fontWeight: 800,
          color: '#ffffff',
        }}
      >
        {initials(name)}
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: size * 0.22,
          fontWeight: 700,
          color: '#ffffff',
          textAlign: 'center',
          lineHeight: 1.15,
        }}
      >
        {name}
      </div>
    </div>
  );
}

function matchCard(data: CardData, story: boolean) {
  const dim = story ? STORY : CARD;
  const unit = story ? 190 : 150;
  return (
    <div
      style={{
        width: dim.width,
        height: dim.height,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: story ? 90 : 44,
        background: `linear-gradient(160deg, ${INK} 0%, #1a0f24 60%, #2a1038 100%)`,
        padding: story ? 90 : 60,
      }}
    >
      <div
        style={{
          display: 'flex',
          fontSize: story ? 34 : 26,
          letterSpacing: 6,
          textTransform: 'uppercase',
          color: ACCENT,
          fontWeight: 700,
          textAlign: 'center',
        }}
      >
        {[data.tournamentName, data.roundName].filter(Boolean).join(' · ') ||
          SITE_NAME}
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: story ? 'column' : 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: story ? 70 : 60,
        }}
      >
        <TeamBlock name={data.team1} size={unit} />
        <div
          style={{
            display: 'flex',
            fontSize: data.score ? unit * 0.52 : unit * 0.4,
            fontWeight: 900,
            color: data.score ? '#ffffff' : 'rgba(255,255,255,0.35)',
          }}
        >
          {data.score ?? 'VS'}
        </div>
        <TeamBlock name={data.team2} size={unit} />
      </div>

      {data.dateLabel && !data.finished && (
        <div
          style={{
            display: 'flex',
            fontSize: story ? 40 : 30,
            color: 'rgba(255,255,255,0.75)',
            textAlign: 'center',
          }}
        >
          {data.dateLabel}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          fontSize: story ? 32 : 24,
          color: ACCENT,
        }}
      >
        {siteHost()}
      </div>
    </div>
  );
}

function fallbackCard(story: boolean) {
  const dim = story ? STORY : CARD;
  return (
    <div
      style={{
        width: dim.width,
        height: dim.height,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        background: `linear-gradient(160deg, ${INK} 0%, #2a1038 100%)`,
      }}
    >
      <div
        style={{
          display: 'flex',
          fontSize: story ? 72 : 56,
          fontWeight: 800,
          color: '#ffffff',
        }}
      >
        {SITE_NAME}
      </div>
      <div style={{ display: 'flex', fontSize: 28, color: ACCENT }}>
        {siteHost()}
      </div>
    </div>
  );
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const story =
    (Array.isArray(req.query.format)
      ? req.query.format[0]
      : req.query.format) === 'story';
  const dim = story ? STORY : CARD;

  // Le score d'un match bouge : cache court côté navigateur, plus long côté
  // CDN avec revalidation en tâche de fond. Une affiche d'avant-match, elle,
  // ne change pas — et c'est la même URL.
  res.setHeader(
    'Cache-Control',
    'public, max-age=120, s-maxage=600, stale-while-revalidate=86400'
  );
  res.setHeader('Content-Type', 'image/png');

  try {
    const raw = req.query.matchId;
    const matchId = Array.isArray(raw) ? raw[0] : raw;
    const data =
      matchId && isValidUUID(matchId) ? await readCardData(matchId) : null;

    const img = new ImageResponse(
      data ? matchCard(data, story) : fallbackCard(story),
      dim
    );
    res.status(200).send(Buffer.from(await img.arrayBuffer()));
  } catch (err) {
    logger.error('[og/match] render error, serving fallback', err);
    try {
      const img = new ImageResponse(fallbackCard(story), dim);
      res.status(200).send(Buffer.from(await img.arrayBuffer()));
    } catch (fatal) {
      logger.error('[og/match] fallback render also failed', fatal);
      res.status(200).end();
    }
  }
}
