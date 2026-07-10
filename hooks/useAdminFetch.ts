import { useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import { supabaseClient } from '@/utils/supabase';

export type AdminFetchOptions = RequestInit & {
  /**
   * If true, do not redirect to the login path on a 401 response.
   * Default: false (the hook redirects on 401).
   */
  skipAuthRedirect?: boolean;
};

export type UseAdminFetchOptions = {
  /**
   * Path to redirect to on 401 responses. Defaults to '/admin/login'.
   * Set this when calling the hook from non-staff contexts (player, team, etc.).
   */
  loginPath?: string;
};

export class AdminFetchError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown = null) {
    super(message);
    this.name = 'AdminFetchError';
    this.status = status;
    this.payload = payload;
  }
}

type AdminFetchApi = {
  /**
   * Perform an authenticated fetch against an API endpoint.
   * Automatically attaches the Supabase access token as a Bearer header
   * and redirects to the configured loginPath on 401 (unless
   * skipAuthRedirect is set).
   *
   * Throws if no session is present. Returns the raw Response so the
   * caller can inspect status / parse manually.
   */
  adminFetch: (input: string, init?: AdminFetchOptions) => Promise<Response>;
  /**
   * Same as adminFetch but parses JSON and throws AdminFetchError on
   * !res.ok or when the payload contains an `error` field.
   */
  adminFetchJson: <T = unknown>(
    input: string,
    init?: AdminFetchOptions
  ) => Promise<T>;
};

export function useAdminFetch(options: UseAdminFetchOptions = {}): AdminFetchApi {
  const { loginPath = '/admin/login' } = options;
  const router = useRouter();

  // Latest-ref pattern : `router` (objet du pages-router Next) et `loginPath`
  // sont lus UNIQUEMENT dans le callback async post-commit (jamais au render),
  // donc on les garde dans des refs mises à jour à chaque render. Cela permet
  // à `adminFetch`/`adminFetchJson` d'avoir des deps VIDES → identité STABLE
  // sur toute la durée de vie du composant. Sans ça, l'identité changeait à
  // chaque changement de `router` (hydratation, query), forçant les 91
  // consommateurs à des `eslint-disable react-hooks/exhaustive-deps` (cf. R12)
  // et exposant à des refetch parasites. Le comportement (redirect 401 vers le
  // loginPath courant) est identique — on lit toujours la valeur la plus récente.
  const routerRef = useRef(router);
  routerRef.current = router;
  const loginPathRef = useRef(loginPath);
  loginPathRef.current = loginPath;

  const adminFetch = useCallback(
    async (input: string, init: AdminFetchOptions = {}): Promise<Response> => {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        throw new AdminFetchError('Session manquante.', 401, null);
      }

      const { skipAuthRedirect, headers: rawHeaders, ...rest } = init;
      const headers = new Headers(rawHeaders);
      headers.set('Authorization', `Bearer ${token}`);
      if (
        typeof rest.body === 'string' &&
        rest.body.length > 0 &&
        !headers.has('Content-Type')
      ) {
        headers.set('Content-Type', 'application/json');
      }

      const res = await fetch(input, {
        credentials: 'same-origin',
        ...rest,
        headers,
      });

      if (res.status === 401 && !skipAuthRedirect) {
        routerRef.current.replace(loginPathRef.current);
      }

      return res;
    },
    []
  );

  const adminFetchJson = useCallback(
    async <T = unknown>(
      input: string,
      init: AdminFetchOptions = {}
    ): Promise<T> => {
      const res = await adminFetch(input, init);
      let payload: unknown = null;
      try {
        payload = await res.json();
      } catch {
        payload = null;
      }
      const errMsg =
        payload && typeof payload === 'object' && 'error' in payload
          ? String((payload as { error: unknown }).error)
          : null;
      if (!res.ok || errMsg) {
        throw new AdminFetchError(
          errMsg || `Requête échouée (${res.status})`,
          res.status,
          payload
        );
      }
      return payload as T;
    },
    [adminFetch]
  );

  return { adminFetch, adminFetchJson };
}
