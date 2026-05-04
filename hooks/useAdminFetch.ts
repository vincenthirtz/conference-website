import { useCallback } from 'react';
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
        router.replace(loginPath);
      }

      return res;
    },
    [router, loginPath]
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
