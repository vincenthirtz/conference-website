// features/player/library/realtime/presenceVerifier.ts — QUI est dans la
// salle (lot 14a de docs/PLAN-womens-library.md) : la présence des autres,
// réduite aux identités dont le JETON DE PRÉSENCE est vérifié.
//
// UNE ENTRÉE N'EST MONTRÉE QUE SI son jeton :
//   - porte une signature ECDSA P-256 valide pour la clé publique rendue par
//     l'entrée (WebCrypto, `crypto.subtle`) ;
//   - a été émis pour CETTE salle, au nom de la clé de présence (qui doit
//     aussi être le `userId` du payload) ;
//   - n'est pas échu (horloge du serveur, estimée d'après mon propre jeton).
// Le pseudo, l'avatar et le look affichés sont CEUX DU JETON, jamais ceux
// qu'un payload annoncerait à côté.
//
// ASYNCHRONE ET MIS EN CACHE : un jeton inconnu part en vérification et son
// entrée attend, invisible ; à l'issue, `onSettled` relance la lecture. Un
// jeton déjà jugé l'est sans recalcul (cache borné). Le format
// (`../presenceTicket.ts`, recopié de l'API) est chargé À LA DEMANDE : il ne
// pèse pas sur le premier chargement de la page.
//
// SANS WEBCRYPTO ECDSA (contexte non sécurisé, navigateur ancien) ou avec une
// clé illisible : PERSONNE n'est montré. Mieux vaut une salle vide qu'une
// salle d'identités invérifiables. Un avertissement, une seule fois.

import type {
  LibraryPresenceClaims,
  LibraryPresencePublicKey,
} from '../presenceTicket';
import type { LibraryPresenceGrant } from '../socialResponses';
import {
  LIBRARY_PRESENCE_MAX_CHARS,
  LibraryPresencePayload,
  parsePeerPayload,
} from './payloads';

export type PresenceVerifier = {
  /**
   * Les revendications d'un jeton VÉRIFIÉ pour cette salle, `null` s'il est
   * refusé, `undefined` tant qu'on le vérifie (`onSettled` suivra).
   */
  check(ticket: string): LibraryPresenceClaims | null | undefined;
  /** Résolue quand plus aucune vérification n'est en cours. */
  idle(): Promise<void>;
};

/** Jetons jugés gardés en mémoire, au plus. */
const CACHE_MAX = 256;
let warned = false;

function warnOnce(reason: unknown) {
  if (warned) return;
  warned = true;
  console.warn(
    '[library] présences invérifiables (WebCrypto ECDSA ou clé) : personne ne sera affiché.',
    reason
  );
}

type Ready = {
  format: typeof import('../presenceTicket');
  subtle: SubtleCrypto;
  key: CryptoKey;
};

export function createPresenceVerifier(args: {
  key: LibraryPresencePublicKey;
  roomId: string;
  onSettled: () => void;
  /** WebCrypto (tests) ; défaut : `crypto.subtle`, absent hors contexte sécurisé. */
  subtle?: SubtleCrypto | null;
}): PresenceVerifier {
  const subtle =
    args.subtle === undefined
      ? (globalThis.crypto?.subtle ?? null)
      : args.subtle;
  const judged = new Map<string, LibraryPresenceClaims | null>();
  const pending = new Map<string, Promise<void>>();
  let ready: Promise<Ready | null> | null = null;

  const prepare = () => {
    ready ??= (async () => {
      if (!subtle) throw new Error('crypto.subtle indisponible');
      const format = await import('../presenceTicket');
      const key = await format.importPresenceKey(subtle, args.key);
      return { format, subtle, key };
    })().catch((err: unknown) => {
      warnOnce(err);
      return null;
    });
    return ready;
  };

  async function judge(ticket: string): Promise<LibraryPresenceClaims | null> {
    const r = await prepare();
    if (!r) return null;
    const decoded = r.format.decodePresenceTicket(ticket);
    if (!decoded || decoded.claims.roomId !== args.roomId) return null;
    const ok = await r.format.verifyPresenceSignature(r.subtle, r.key, decoded);
    return ok ? decoded.claims : null;
  }

  return {
    check(ticket) {
      if (judged.has(ticket)) return judged.get(ticket) ?? null;
      if (!pending.has(ticket)) {
        const done = judge(ticket)
          .catch(() => null)
          .then((claims) => {
            if (judged.size >= CACHE_MAX) {
              const oldest = judged.keys().next().value;
              if (oldest !== undefined) judged.delete(oldest);
            }
            judged.set(ticket, claims);
            pending.delete(ticket);
            args.onSettled();
          });
        pending.set(ticket, done);
      }
      return undefined;
    },
    async idle() {
      while (pending.size > 0) await Promise.all(pending.values());
    },
  };
}

/** Une présence VÉRIFIÉE : la case du payload, l'identité du jeton. */
export type VerifiedPresenceEntry = {
  userId: string;
  nickname: string;
  avatarId: string;
  /** Look composé du jeton (forme compacte validée), ou null : `avatarId`. */
  look: string | null;
  gx: number;
  gy: number;
  dir: number;
  /** Le jeton vérifié : c'est lui que portent signaler, bloquer, expulser. */
  ticket: string;
  /** Son échéance, en ms de MON horloge. */
  expiresAt: number;
};

/** Au plus ce nombre d'entrées montrées (une salle en tient 30). */
export const PRESENCE_MAX_ENTRIES = 100;
/** Au plus ce nombre de métas lues par clé (onglets, copies). */
const METAS_MAX = 8;

/**
 * La présence brute d'un canal → les entrées VÉRIFIÉES, une par clé.
 * `skewMs` : horloge du serveur moins la mienne ; `now` : la mienne (ms).
 */
export function readVerifiedPresence(
  raw: Record<string, Array<Record<string, unknown>>>,
  verifier: PresenceVerifier,
  clock: { now: number; skewMs: number }
): VerifiedPresenceEntry[] {
  const out: VerifiedPresenceEntry[] = [];
  const serverNow = (clock.now + clock.skewMs) / 1000;
  for (const [key, metas] of Object.entries(raw ?? {})) {
    if (out.length >= PRESENCE_MAX_ENTRIES) break;
    if (!Array.isArray(metas)) continue;
    // Plusieurs métas sous une même clé (onglets, ou une copie posée par une
    // autre cliente) : la dernière dont le jeton est VÉRIFIÉ.
    const last = Math.max(0, metas.length - METAS_MAX);
    for (let i = metas.length - 1; i >= last; i -= 1) {
      const meta = metas[i];
      if (!meta || typeof meta !== 'object') continue;
      const { presence_ref: _ref, ...payload } = meta;
      const parsed = parsePeerPayload(
        LibraryPresencePayload,
        payload,
        LIBRARY_PRESENCE_MAX_CHARS
      );
      if (!parsed || parsed.userId !== key) continue;
      const claims = verifier.check(parsed.ticket);
      if (!claims || claims.userId !== key || claims.exp <= serverNow) continue;
      out.push({
        userId: key,
        nickname: claims.nickname,
        avatarId: claims.avatarId,
        look: claims.look,
        gx: parsed.gx,
        gy: parsed.gy,
        dir: parsed.dir,
        ticket: parsed.ticket,
        expiresAt: claims.exp * 1000 - clock.skewMs,
      });
      break;
    }
  }
  return out;
}

/**
 * Ce que la connexion d'une salle tient du lot 14a : MON jeton (il part dans
 * ma présence), la lecture vérifiée de celle des autres, et l'horloge du
 * serveur, estimée d'après l'émission de mon jeton. Plusieurs jetons jugés
 * d'un coup ne relancent qu'UNE relecture (`onSettled`).
 */
export function createVerifiedPresence(args: {
  grant: LibraryPresenceGrant;
  roomId: string;
  now: () => number;
  onSettled: () => void;
  subtle?: SubtleCrypto | null;
}) {
  let grant = args.grant;
  const skewMs = (Date.parse(grant.issuedAt) || args.now()) - args.now();
  let queued = false;
  const settled = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      args.onSettled();
    });
  };
  const verifierOf = (g: LibraryPresenceGrant) =>
    createPresenceVerifier({
      key: g.key,
      roomId: args.roomId,
      onSettled: settled,
      subtle: args.subtle,
    });
  let verifier = verifierOf(grant);
  return {
    ticket: () => grant.ticket,
    read: (raw: Record<string, Array<Record<string, unknown>>>) =>
      readVerifiedPresence(raw, verifier, { now: args.now(), skewMs }),
    /** Un jeton renouvelé ; `true` si la clé a changé (relire la présence). */
    renew(next: LibraryPresenceGrant): boolean {
      const rekeyed = next.key.x !== grant.key.x || next.key.y !== grant.key.y;
      grant = next;
      if (rekeyed) verifier = verifierOf(grant);
      return rekeyed;
    },
    idle: () => verifier.idle(),
  };
}
