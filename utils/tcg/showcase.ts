// utils/tcg/showcase.ts
//
// La VITRINE : jusqu'à `MAX_SHOWCASE_CARDS` cartes qu'une joueuse choisit de
// montrer sur SA fiche publique (`/player/[userId]`).
//
// OPT-IN, DÉSACTIVÉE PAR DÉFAUT. Sans ligne `tcg_showcases`, ou avec
// `enabled = false`, rien ne s'affiche. La collection reste privée et
// `noindex` : la vitrine ne publie que ce que la joueuse désigne, rien d'autre.
//
// ELLE NE STOCKE QUE DES RÉFÉRENCES DE SUJET, JAMAIS UNE CARTE NI UNE IMAGE.
//   - `subject_keys` porte `player:<uuid>`, `team:<uuid>`, `map:<slug>` — le
//     format de `cardSubjectKey`. Pas un exemplaire (`pack_id:position`) : on
//     expose « Akira », pas « la copie n°3 d'Akira », et une copie cédée ne doit
//     pas faire disparaître une carte dont on garde un autre exemplaire.
//   - À L'AFFICHAGE, chaque référence est RELUE contre la possession réelle
//     (`readOwnedCardRows`) : une carte recyclée jusqu'au dernier exemplaire ou
//     échangée disparaît de la vitrine sans que personne n'ait à nettoyer la
//     ligne. La rareté montrée est la meilleure encore possédée.
//   - Les FACES passent par `readCardFaces.ts`, seul porteur du filtre de
//     consentement : une joueuse représentée dans la vitrine d'une autre qui
//     retire sa photo y retombe sur son avatar ou l'aplat, jamais sur l'ancienne
//     photo. La régénération de la page est l'affaire de
//     `revalidatePlayerCard.ts`, qui retrouve les vitrines concernées.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { RARITY_ORDER, type TcgRarity } from './rarity';
import { readOwnedCardRows } from './readOwnedCards';
import {
  readPlayerFaces,
  readTeamFaces,
  readFanartFaces,
} from './readCardFaces';
import { gameMascotDisplayName } from './gameMascots';
import type { LogoCredit } from '@/utils/teams/logoCredit';
import { readMapFaces } from './readMapFaces';
import { cardSubjectKey } from './subjectKey';

/** Cartes exposables au plus. */
export const MAX_SHOWCASE_CARDS = 3;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Un slug de map : minuscules, chiffres, tirets — la forme du registre. */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type ShowcaseSubject =
  | { kind: 'player'; id: string }
  | { kind: 'team'; id: string }
  | { kind: 'map'; id: string }
  | { kind: 'fanart'; id: string }
  | { kind: 'mascot'; id: string };

/**
 * Lit une clé de sujet. `null` = forme invalide.
 *
 * La forme est vérifiée AVANT toute lecture : une clé stockée est relue plus
 * tard dans des filtres, et la possession seule ne suffirait pas à écarter une
 * valeur exotique si la lecture de la collection échouait.
 */
export function parseShowcaseKey(value: unknown): ShowcaseSubject | null {
  if (typeof value !== 'string' || value.length > 80) return null;
  const separator = value.indexOf(':');
  if (separator <= 0) return null;
  const kind = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if (
    (kind === 'player' || kind === 'team' || kind === 'fanart') &&
    UUID_RE.test(id)
  ) {
    return { kind, id: id.toLowerCase() };
  }
  if (
    (kind === 'map' || kind === 'mascot') &&
    id.length <= 64 &&
    SLUG_RE.test(id)
  ) {
    return { kind, id };
  }
  // Un type absent d'ici n'est pas « refusé » de façon lisible : la carte
  // disparaît simplement de la vitrine, sans message. C'est ce qui est arrivé
  // aux mascottes et aux fan arts.
  return null;
}

export function showcaseKey(subject: ShowcaseSubject): string {
  return `${subject.kind}:${subject.id}`;
}

/** Une carte exposée, à la forme des cartes de la collection (sans compteur). */
export type ShowcaseCard =
  | {
      key: string;
      kind: 'player';
      userId: string;
      displayName: string | null;
      imageUrl: string | null;
      rarity: TcgRarity;
      isFoil: boolean;
    }
  | {
      key: string;
      kind: 'team';
      teamId: string;
      name: string | null;
      slug: string | null;
      logoUrl: string | null;
      cardImageUrl: string | null;
      /** Crédit du logo (`TeamFace.logoCredit`) ; `null` sans artiste nommée. */
      logoCredit: LogoCredit | null;
      rarity: TcgRarity;
      isFoil: boolean;
    }
  | {
      key: string;
      kind: 'map';
      slug: string;
      name: string | null;
      imageUrl: string | null;
      rarity: TcgRarity;
      isFoil: boolean;
    }
  | {
      key: string;
      kind: 'fanart';
      fanartId: string;
      title: string | null;
      artistName: string | null;
      artistUrl: string | null;
      imageUrl: string | null;
      rarity: TcgRarity;
      isFoil: boolean;
    }
  | {
      key: string;
      kind: 'mascot';
      slug: string;
      name: string | null;
      rarity: TcgRarity;
      isFoil: boolean;
    };

export type ShowcaseRow = { enabled: boolean; subjectKeys: string[] };

export type ReadRowResult =
  | { ok: true; row: ShowcaseRow | null }
  | { ok: false; error: string };

/** La ligne de vitrine, telle que stockée. `row: null` = jamais configurée. */
export async function readShowcaseRow(
  tenantId: string,
  userId: string
): Promise<ReadRowResult> {
  if (!supabaseAdmin) return { ok: false, error: 'supabaseAdmin absent' };
  const { data, error } = await supabaseAdmin
    .from('tcg_showcases')
    .select('enabled, subject_keys')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: true, row: null };
  const row = data as { enabled?: unknown; subject_keys?: unknown };
  const keys = Array.isArray(row.subject_keys)
    ? row.subject_keys.filter((k): k is string => parseShowcaseKey(k) !== null)
    : [];
  return {
    ok: true,
    // `enabled` strictement `true` : toute autre valeur vaut « désactivée »,
    // le sens sûr d'un opt-in.
    row: {
      enabled: row.enabled === true,
      subjectKeys: keys.slice(0, MAX_SHOWCASE_CARDS),
    },
  };
}

export type ResolveResult =
  | {
      ok: true;
      cards: ShowcaseCard[];
      /** Références stockées qui ne sont plus possédées. */
      unavailable: number;
    }
  | { ok: false; error: string };

/**
 * Les cartes exposées, RELUES contre la possession réelle, faces comprises.
 *
 * L'ordre est celui choisi par la joueuse. Ne lève jamais ; une collection
 * illisible rend `ok: false` — et l'appelant public n'affiche alors RIEN,
 * plutôt qu'une vitrine qu'on ne peut plus vérifier.
 */
export async function resolveShowcaseCards(
  tenantId: string,
  userId: string,
  subjectKeys: readonly string[]
): Promise<ResolveResult> {
  const wanted = [
    ...new Set(
      subjectKeys
        .map(parseShowcaseKey)
        .filter((s): s is ShowcaseSubject => s !== null)
        .map(showcaseKey)
    ),
  ].slice(0, MAX_SHOWCASE_CARDS);
  if (wanted.length === 0) return { ok: true, cards: [], unavailable: 0 };

  const owned = await readOwnedCardRows(tenantId, userId);
  if (!owned.ok) return { ok: false, error: owned.error };

  // Meilleure rareté et brillance par sujet, sur les seuls sujets demandés.
  const best = new Map<string, { rarity: TcgRarity; isFoil: boolean }>();
  const wantedSet = new Set(wanted);
  for (const row of owned.value) {
    const key = cardSubjectKey(row);
    if (!key || !wantedSet.has(key)) continue;
    const current = best.get(key);
    if (!current) {
      best.set(key, { rarity: row.rarity, isFoil: Boolean(row.is_foil) });
      continue;
    }
    if (
      RARITY_ORDER.indexOf(row.rarity) > RARITY_ORDER.indexOf(current.rarity)
    ) {
      current.rarity = row.rarity;
    }
    current.isFoil = current.isFoil || Boolean(row.is_foil);
  }

  const kept = wanted.filter((key) => best.has(key));
  const subjects = kept
    .map(parseShowcaseKey)
    .filter((s): s is ShowcaseSubject => s !== null);

  // Les faces, par les lecteurs porteurs du filtre de consentement.
  const [playerFaces, teamFaces, mapFaces, fanartFaces] = await Promise.all([
    readPlayerFaces(
      tenantId,
      subjects.filter((s) => s.kind === 'player').map((s) => s.id)
    ),
    readTeamFaces(
      tenantId,
      subjects.filter((s) => s.kind === 'team').map((s) => s.id)
    ),
    readMapFaces(subjects.filter((s) => s.kind === 'map').map((s) => s.id)),
    readFanartFaces(
      tenantId,
      subjects.filter((s) => s.kind === 'fanart').map((s) => s.id)
    ),
  ]);

  const cards: ShowcaseCard[] = subjects.map((subject) => {
    const key = showcaseKey(subject);
    const { rarity, isFoil } = best.get(key) as {
      rarity: TcgRarity;
      isFoil: boolean;
    };
    if (subject.kind === 'player') {
      const face = playerFaces.get(subject.id);
      return {
        key,
        kind: 'player',
        userId: subject.id,
        displayName: face?.displayName ?? null,
        imageUrl: face?.imageUrl ?? null,
        rarity,
        isFoil,
      };
    }
    if (subject.kind === 'map') {
      const face = mapFaces.get(subject.id);
      return {
        key,
        kind: 'map',
        slug: subject.id,
        name: face?.name ?? null,
        imageUrl: face?.imageUrl ?? null,
        rarity,
        isFoil,
      };
    }
    if (subject.kind === 'fanart') {
      const face = fanartFaces.get(subject.id);
      return {
        key,
        kind: 'fanart',
        fanartId: subject.id,
        title: face?.title ?? null,
        // La vitrine est PUBLIQUE : c'est là que le crédit compte le plus.
        artistName: face?.artistName ?? null,
        artistUrl: face?.artistUrl ?? null,
        imageUrl: face?.imageUrl ?? null,
        rarity,
        isFoil,
      };
    }
    if (subject.kind === 'mascot') {
      return {
        key,
        kind: 'mascot',
        slug: subject.id,
        name: gameMascotDisplayName(subject.id),
        rarity,
        isFoil,
      };
    }
    const face = teamFaces.get(subject.id);
    return {
      key,
      kind: 'team',
      teamId: subject.id,
      name: face?.name ?? null,
      slug: face?.slug ?? null,
      logoUrl: face?.logoUrl ?? null,
      cardImageUrl: face?.cardImageUrl ?? null,
      // La vitrine est affichée sur la fiche PUBLIQUE : c'est la vitrine
      // d'une joueuse, mais l'œuvre reste celle de l'artiste du logo.
      logoCredit: face?.logoCredit ?? null,
      rarity,
      isFoil,
    };
  });

  return { ok: true, cards, unavailable: wanted.length - kept.length };
}

/**
 * La vitrine telle qu'une VISITEUSE la voit : `null` si désactivée, jamais
 * configurée, vide, ou illisible.
 *
 * Dans le doute, rien : une vitrine est un opt-in, et une lecture en échec ne
 * doit ni exposer ce qu'on ne peut plus vérifier, ni faire échouer la fiche.
 */
export async function readPublicShowcase(
  tenantId: string,
  userId: string
): Promise<ShowcaseCard[] | null> {
  try {
    const row = await readShowcaseRow(tenantId, userId);
    if (!row.ok) {
      logger.warn(
        '[tcg/showcase] vitrine illisible pour %s: %s',
        userId,
        row.error
      );
      return null;
    }
    if (!row.row || !row.row.enabled || row.row.subjectKeys.length === 0) {
      return null;
    }
    const resolved = await resolveShowcaseCards(
      tenantId,
      userId,
      row.row.subjectKeys
    );
    if (!resolved.ok) {
      logger.warn(
        '[tcg/showcase] collection illisible pour %s: %s',
        userId,
        resolved.error
      );
      return null;
    }
    return resolved.cards.length > 0 ? resolved.cards : null;
  } catch (err) {
    logger.warn(
      '[tcg/showcase] vitrine publique impossible pour %s: %s',
      userId,
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

/**
 * Les propriétaires de vitrines ACTIVES qui exposent la carte de ce sujet.
 *
 * Sert à régénérer leurs fiches quand la face de ce sujet change (photo
 * retirée, refusée, remplacée) : sans cela, la vitrine d'une AUTRE joueuse
 * garderait l'ancienne photo jusqu'à l'expiration de l'ISR.
 *
 * Tous tenants confondus : régénérer une page de trop ne coûte rien, en oublier
 * une laisserait une photo retirée en ligne. Ne lève jamais ; `[]` sur échec.
 */
export async function readShowcaseOwnersShowing(
  subjectKey: string,
  limit = 200
): Promise<string[]> {
  if (!supabaseAdmin || !parseShowcaseKey(subjectKey)) return [];
  try {
    const { data, error } = await supabaseAdmin
      .from('tcg_showcases')
      .select('user_id, subject_keys')
      .eq('enabled', true)
      // `cs` = « le tableau contient ». Index GIN dédié dans la migration.
      .filter('subject_keys', 'cs', `{"${subjectKey}"}`)
      .limit(limit);
    if (error) {
      logger.warn('[tcg/showcase] vitrines illisibles: %s', error.message);
      return [];
    }
    // Revérifié en mémoire : la clé a été validée, mais on ne confie pas à un
    // seul filtre la décision de qui régénérer.
    return [
      ...new Set(
        ((data ?? []) as Array<{ user_id: string; subject_keys: unknown }>)
          .filter(
            (r) =>
              Array.isArray(r.subject_keys) &&
              r.subject_keys.includes(subjectKey)
          )
          .map((r) => r.user_id)
      ),
    ];
  } catch {
    return [];
  }
}
