// utils/invitations/tokenClient.ts — appels des pages de JETON
// (/invitation/[token], /rejoindre/[token]) — lot P11.
//
// Hors de `features/player` exprès : ces pages sont PUBLIQUES (garde de
// bundle tests/unit/adminBoundariesGuard.test.ts — ni TanStack ni module
// joueuse). Les routes servies vivent, elles, dans features/player/invitations.
//
// Pas de `playerRequest` ici : ces pages s'ouvrent SANS compte, et un 401
// n'y est pas une session expirée à rediriger mais un état à afficher
// (« connecte-toi pour accepter »). Le client rend donc la réponse brute
// (`ok`, `status`, corps JSON) et laisse la page décider ; il ne lève que
// sur une panne réseau.

export type TokenResponse<T = Record<string, unknown>> = {
  ok: boolean;
  status: number;
  /** Corps JSON, `null` s'il est illisible. */
  json: (T & { error?: string; code?: string }) | null;
};

async function call<T>(
  url: string,
  init: { method?: 'GET' | 'POST'; bearer?: string | null; body?: unknown } = {}
): Promise<TokenResponse<T>> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  // La route d'invitation accepte cookie OU Bearer : le Bearer quand la page
  // en a un, le cookie prend le relais sinon.
  if (init.bearer) headers.Authorization = `Bearer ${init.bearer}`;
  const res = await fetch(url, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const json = (await res.json().catch(() => null)) as TokenResponse<T>['json'];
  return { ok: res.ok, status: res.status, json };
}

const invitationUrl = (token: string) =>
  `/api/invitations/${encodeURIComponent(token)}`;
const joinLinkUrl = '/api/teams/invite-links/by-token';

export const invitationsClient = {
  /** Ce que dit l'invitation, toutes familles, sans la consommer. */
  read: <T>(token: string) => call<T>(invitationUrl(token)),
  /** Accepte (ou refuse, invitation d'équipe) pour la personne connectée. */
  respond: <T>(
    token: string,
    opts: { action?: 'accept' | 'reject'; bearer?: string | null } = {}
  ) =>
    call<T>(invitationUrl(token), {
      method: 'POST',
      bearer: opts.bearer,
      body: opts.action ? { action: opts.action } : undefined,
    }),
  /** Métadonnées publiques d'un lien d'équipe partageable. */
  readJoinLink: <T>(token: string) =>
    call<T>(`${joinLinkUrl}?token=${encodeURIComponent(token)}`),
  /** Inscription par lien d'équipe (session Bearer obligatoire). */
  joinByLink: <T>(
    bearer: string,
    body: { token: string; battle_tag: string | null; specialty: string | null }
  ) => call<T>(joinLinkUrl, { method: 'POST', bearer, body }),
};
