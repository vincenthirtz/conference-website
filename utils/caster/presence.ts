// Logique pure de la présence multi-caster — port des helpers de l'app desktop
// womenscup-caster (src/main/presence.js:formatPresence + les helpers d'affichage
// de src/renderer/tabs/chat.js). Zéro DOM, zéro Supabase : testé en Vitest.
//
// Le transport (canal Supabase Realtime Presence `caster_presence`) vit dans
// hooks/useCasterPresence.ts.

import type { CasterPresenceUser } from '@/types/caster';

/**
 * Payload brut tel que trackné sur le canal. Volontairement permissif : il
 * vient du réseau (et de l'app desktop, qui peut évoluer de son côté).
 */
type RawPresence = Record<string, unknown>;

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value ? value : fallback;
}

function nullableStr(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

/**
 * Aplatit l'état de présence Supabase (`{ [key]: presences[] }`) en une liste
 * d'utilisateurs — une entrée par clé de présence, la PREMIÈRE présence gagne
 * (même choix que le desktop : un caster qui ouvre deux fenêtres reste un seul
 * utilisateur, la clé de présence étant le staffId).
 */
export function formatPresenceState(
  state: Record<string, readonly RawPresence[]> | null | undefined
): CasterPresenceUser[] {
  const users: CasterPresenceUser[] = [];
  for (const [key, presences] of Object.entries(state || {})) {
    if (!Array.isArray(presences) || presences.length === 0) continue;
    const p: RawPresence = presences[0] || {};
    users.push({
      staffId: str(p.staffId, key),
      displayName: str(p.displayName, key),
      role: str(p.role),
      activeScene: nullableStr(p.activeScene),
      activeField: nullableStr(p.activeField),
      joinedAt: str(p.joinedAt),
    });
  }
  // Ordre stable (arrivée puis nom) : le bandeau ne doit pas sauter à chaque sync.
  return users.sort(
    (a, b) =>
      a.joinedAt.localeCompare(b.joinedAt) ||
      a.displayName.localeCompare(b.displayName)
  );
}

/** Initiales d'affichage (2 lettres max) — repli « ? ». */
export function presenceInitials(name: string | null | undefined): string {
  const words = String(name || '')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  return words
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Teinte d'avatar stable par utilisateur (style GitHub) : les casters se
 * distinguent d'un coup d'œil au lieu de partager un même gris. Hash de chaîne
 * bon marché → teinte ; S/L fixes pour garder les initiales lisibles en blanc.
 */
export function presenceColor(seed: string | null | undefined): string {
  const s = String(seed || '?');
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 48%, 40%)`;
}

/**
 * Les AUTRES casters ayant cette scène ouverte (self exclu). Base de
 * l'indicateur de la liste des scènes et du bandeau de collaboration —
 * indicateur purement consultatif : jamais de verrou dur, en direct on doit
 * toujours pouvoir corriger une faute immédiatement.
 */
export function othersOnScene(
  users: CasterPresenceUser[],
  sceneId: string | null | undefined,
  selfStaffId: string | null | undefined
): CasterPresenceUser[] {
  if (!sceneId) return [];
  return users.filter(
    (u) => u.activeScene === sceneId && u.staffId !== selfStaffId
  );
}

/** Index sceneId → autres casters présents (une passe pour toute la liste). */
export function othersBySceneId(
  users: CasterPresenceUser[],
  selfStaffId: string | null | undefined
): Record<string, CasterPresenceUser[]> {
  const index: Record<string, CasterPresenceUser[]> = {};
  for (const u of users) {
    if (!u.activeScene || u.staffId === selfStaffId) continue;
    (index[u.activeScene] ||= []).push(u);
  }
  return index;
}
