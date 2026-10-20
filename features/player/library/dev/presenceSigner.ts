// features/player/library/dev/presenceSigner.ts — un SIGNATAIRE DE TEST des
// jetons de présence (lot 14a de docs/PLAN-womens-library.md), pour les pages
// de développement (`/dev/library-room`, `/dev/library-apartment`, 404 en
// production) et les tests. Une paire de clés ECDSA P-256 créée par WebCrypto
// joue la clé de l'API : la page de démonstration rend sa clé publique dans
// l'entrée simulée, et signe MON jeton et ceux des joueuses simulées.
//
// Le format vient de `../presenceTicket.ts` (recopié de l'API), chargé à la
// demande comme dans la salle réelle.

import { useEffect, useState } from 'react';
import type {
  LibraryPresenceClaims,
  LibraryPresencePublicKey,
} from '../presenceTicket';
import type {
  LibraryEnterResponse,
  LibraryPresenceGrant,
} from '../socialResponses';

/** Ce qu'un jeton atteste (la version et les dates sont posées ici). */
export type DevPresenceSubject = {
  roomId: string;
  userId: string;
  nickname: string;
  avatarId: string;
  look?: string | null;
};

export type DevPresenceSigner = {
  key: LibraryPresencePublicKey;
  /**
   * Un jeton signé, valable 2 h ; `over` force des revendications (échéance
   * passée, autre salle…) — c'est ainsi qu'on fabrique des cas refusés.
   */
  sign(
    subject: DevPresenceSubject,
    over?: Partial<LibraryPresenceClaims>
  ): Promise<string>;
  grant(
    subject: DevPresenceSubject,
    over?: Partial<LibraryPresenceClaims>
  ): Promise<LibraryPresenceGrant>;
};

export async function createDevPresenceSigner(
  subtle: SubtleCrypto = globalThis.crypto.subtle
): Promise<DevPresenceSigner> {
  const format = await import('../presenceTicket');
  const pair = (await subtle.generateKey(
    format.LIBRARY_PRESENCE_KEY_ALGORITHM,
    true,
    ['sign', 'verify']
  )) as CryptoKeyPair;
  const jwk = await subtle.exportKey('jwk', pair.publicKey);
  const key: LibraryPresencePublicKey = {
    kty: 'EC',
    crv: 'P-256',
    x: String(jwk.x),
    y: String(jwk.y),
  };
  const claimsOf = (
    s: DevPresenceSubject,
    over: Partial<LibraryPresenceClaims>
  ): LibraryPresenceClaims => {
    const iat = Math.floor(Date.now() / 1000);
    return {
      v: format.LIBRARY_PRESENCE_TICKET_VERSION,
      roomId: s.roomId,
      userId: s.userId,
      nickname: s.nickname,
      avatarId: s.avatarId,
      look: s.look ?? null,
      iat,
      exp: iat + format.LIBRARY_PRESENCE_TICKET_TTL_SECONDS,
      ...over,
    };
  };
  const signClaims = (claims: LibraryPresenceClaims) =>
    format.signPresenceTicket(subtle, pair.privateKey, claims);
  return {
    key,
    sign: (subject, over = {}) => signClaims(claimsOf(subject, over)),
    async grant(subject, over = {}) {
      const claims = claimsOf(subject, over);
      return {
        ticket: await signClaims(claims),
        issuedAt: new Date(claims.iat * 1000).toISOString(),
        expiresAt: new Date(claims.exp * 1000).toISOString(),
        key,
      };
    },
  };
}

let shared: Promise<DevPresenceSigner> | null = null;

/** Le signataire de la page de démonstration (un seul par chargement). */
export function devPresenceSigner(): Promise<DevPresenceSigner> {
  shared ??= createDevPresenceSigner();
  return shared;
}

/** Le signataire de la page, une fois créé (null avant). */
export function useDevPresenceSigner(): DevPresenceSigner | null {
  const [signer, setSigner] = useState<DevPresenceSigner | null>(null);
  useEffect(() => {
    let live = true;
    void devPresenceSigner().then((s) => {
      if (live) setSigner(s);
    });
    return () => {
      live = false;
    };
  }, []);
  return signer;
}

/** L'entrée simulée, avec MON jeton signé et la clé qui vérifie ceux des autres. */
export async function signedEnter(
  enter: LibraryEnterResponse,
  signer: DevPresenceSigner
): Promise<LibraryEnterResponse> {
  return {
    ...enter,
    presence: await signer.grant({
      roomId: enter.room.id,
      userId: enter.me.userId,
      nickname: enter.me.nickname,
      avatarId: enter.me.avatarId,
    }),
  };
}

/** La présence d'une joueuse simulée : sa case et SON jeton signé. */
export async function signedPeerMeta(
  signer: DevPresenceSigner,
  roomId: string,
  peer: Omit<DevPresenceSubject, 'roomId'> & {
    gx: number;
    gy: number;
    dir: number;
  },
  over?: Partial<LibraryPresenceClaims>
): Promise<{
  userId: string;
  gx: number;
  gy: number;
  dir: number;
  ticket: string;
}> {
  const ticket = await signer.sign({ ...peer, roomId }, over);
  return {
    userId: peer.userId,
    gx: peer.gx,
    gy: peer.gy,
    dir: peer.dir,
    ticket,
  };
}
