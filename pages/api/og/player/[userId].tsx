// pages/api/og/player/[userId].tsx
//
// Carte sociale dynamique (1200×630 PNG) d'un profil PUBLIC de joueuse, servie
// comme og:image / twitter:image (summary_large_image). Utilisée par le SEO de
// `pages/player/[userId].tsx` : le partage d'un profil affiche cette carte.
//
// RUNTIME : Node.js (défaut — PAS edge). Dans un handler pages/api on ne peut
// pas `return` une Response web, donc on transforme l'ImageResponse en Buffer
// et on l'écrit via `res.send`.
//
// NE THROW JAMAIS : toute erreur (DB, joueuse inconnue, données partielles)
// retombe sur une carte générique de repli. Les crawlers sociaux doivent
// TOUJOURS obtenir un PNG 200 valide, sinon la preview de partage casse.
//
// Champs affichés = uniquement des données publiques non-PII (pseudo public,
// rating, rang, pic, bilan V-D). Aucun avatar distant n'est chargé (un fetch
// échoué casserait toute l'image) : on dessine un disque d'initiales robuste.

import { ImageResponse } from 'next/og';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { logger } from '@/utils/logger';

const WIDTH = 1200;
const HEIGHT = 630;
const SITE_NAME = "OW Women's Cup";

// Host affiché en pied de carte, dérivé de NEXT_PUBLIC_SITE_URL si présent.
function siteHost(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL;
  if (!raw) return 'owwomenscup.fr';
  try {
    return new URL(raw).host || 'owwomenscup.fr';
  } catch {
    return 'owwomenscup.fr';
  }
}

// Données minimales nécessaires à la carte (bien plus léger que
// readPlayerProfile, qui charge aussi history / h2h / achievements).
type CardData = {
  name: string;
  rating: number;
  peakRating: number;
  rank: number | null;
  wins: number;
  losses: number;
};

// Initiales robustes : jusqu'à 2 lettres du pseudo public. Repli « ? ».
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// Lecture best-effort. Renvoie `null` si joueuse introuvable OU si une erreur
// survient — l'appelant décide (carte de repli). Ne throw jamais.
async function readCardData(userId: string): Promise<CardData | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('player_ratings')
      .select(
        'user_id, display_name, battle_tag, rating, peak_rating, games_played, wins, losses'
      )
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) return null;

    const row = data as {
      user_id: string;
      display_name: string | null;
      battle_tag: string | null;
      rating: number;
      peak_rating: number;
      games_played: number;
      wins: number;
      losses: number;
    };

    const name = row.display_name ?? row.battle_tag ?? 'Joueuse';

    // Rang best-effort : nombre de joueuses notées mieux classées + 1. Si le
    // COUNT échoue, on omet le rang plutôt que d'échouer la carte.
    let rank: number | null = null;
    if (row.games_played > 0) {
      const { count, error: rankErr } = await supabaseAdmin
        .from('player_ratings')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .gt('games_played', 0)
        .gt('rating', row.rating);
      if (!rankErr && typeof count === 'number') rank = count + 1;
    }

    return {
      name,
      rating: Math.round(row.rating),
      peakRating: Math.round(row.peak_rating),
      rank,
      wins: row.wins,
      losses: row.losses,
    };
  } catch (err) {
    logger.error('[og/player] readCardData error', err);
    return null;
  }
}

// Fond de marque commun (dégradé violet profond → magenta néon).
const BRAND_BACKGROUND =
  'linear-gradient(135deg, #0E0A1F 0%, #2A0F4A 45%, #6d1a9c 100%)';

// Carte de repli : marque seule, aucun besoin de données joueuse.
function fallbackCard() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        background: BRAND_BACKGROUND,
        color: '#FFFFFF',
      }}
    >
      <div style={{ display: 'flex', fontSize: 64, fontWeight: 700 }}>
        {SITE_NAME}
      </div>
      <div
        style={{
          display: 'flex',
          marginTop: 16,
          fontSize: 30,
          color: '#cd85ec',
        }}
      >
        {siteHost()}
      </div>
    </div>
  );
}

function statBlock(
  value: string,
  label: string,
  color: string,
  marginLeft = 0
) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        marginLeft,
      }}
    >
      <div style={{ display: 'flex', fontSize: 46, fontWeight: 700, color }}>
        {value}
      </div>
      <div
        style={{
          display: 'flex',
          marginTop: 4,
          fontSize: 24,
          letterSpacing: 2,
          textTransform: 'uppercase',
          color: '#B7A9D0',
        }}
      >
        {label}
      </div>
    </div>
  );
}

function playerCard(data: CardData) {
  const name = data.name.length > 22 ? `${data.name.slice(0, 21)}…` : data.name;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: '100%',
        height: '100%',
        padding: 64,
        background: BRAND_BACKGROUND,
        color: '#FFFFFF',
      }}
    >
      {/* Header : avatar initiales + pseudo */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 140,
            height: 140,
            borderRadius: 140,
            background: 'linear-gradient(135deg, #b24be0 0%, #f0e63c 100%)',
            fontSize: 60,
            fontWeight: 700,
            color: '#FFFFFF',
          }}
        >
          {initials(data.name)}
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginLeft: 36,
          }}
        >
          <div
            style={{
              display: 'flex',
              fontSize: 30,
              letterSpacing: 3,
              textTransform: 'uppercase',
              color: '#cd85ec',
            }}
          >
            {SITE_NAME}
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 8,
              fontSize: 68,
              fontWeight: 700,
            }}
          >
            {name}
          </div>
        </div>
      </div>

      {/* Rating principal */}
      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
        <div
          style={{
            display: 'flex',
            fontSize: 200,
            fontWeight: 700,
            lineHeight: 1,
            color: '#e7c6f7',
          }}
        >
          {String(data.rating)}
        </div>
        <div
          style={{
            display: 'flex',
            marginLeft: 24,
            marginBottom: 28,
            fontSize: 36,
            letterSpacing: 4,
            textTransform: 'uppercase',
            color: '#B7A9D0',
          }}
        >
          Rating
        </div>
      </div>

      {/* Stats secondaires + host */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {statBlock(
            data.rank !== null ? `#${data.rank}` : '—',
            'Rank',
            '#FFFFFF'
          )}
          {statBlock(String(data.peakRating), 'Peak', '#f0e63c', 56)}
          {statBlock(`${data.wins}-${data.losses}`, 'W-L', '#6EE7B7', 56)}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 28,
            color: '#cd85ec',
          }}
        >
          {siteHost()}
        </div>
      </div>
    </div>
  );
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Cache agressif : la carte évolue lentement et est servie aux crawlers.
  res.setHeader(
    'Cache-Control',
    'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400'
  );
  res.setHeader('Content-Type', 'image/png');

  try {
    const rawUserId = req.query.userId;
    const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;

    const data =
      userId && typeof userId === 'string'
        ? await readCardData(userId)
        : null;

    const img = new ImageResponse(data ? playerCard(data) : fallbackCard(), {
      width: WIDTH,
      height: HEIGHT,
    });

    const buf = Buffer.from(await img.arrayBuffer());
    res.status(200).send(buf);
  } catch (err) {
    // Ultime filet : même en cas d'échec du rendu, on renvoie une carte de repli
    // valide (200) pour ne jamais casser la preview de partage.
    logger.error('[og/player] render error, serving fallback', err);
    try {
      const img = new ImageResponse(fallbackCard(), {
        width: WIDTH,
        height: HEIGHT,
      });
      const buf = Buffer.from(await img.arrayBuffer());
      res.status(200).send(buf);
    } catch (fatal) {
      logger.error('[og/player] fallback render also failed', fatal);
      res.status(200).end();
    }
  }
}
