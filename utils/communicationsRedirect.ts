import type { GetServerSidePropsResult } from 'next';
import type { ParsedUrlQuery } from 'querystring';

/**
 * Builds a permanent (308) redirect to the merged /admin/communications hub for
 * the four legacy list routes (news, announcements, campaigns, notifications).
 * Any incoming query params are preserved (e.g. `search`, `status`, `offset`),
 * and the `tab` param is forced to the target tab. Array-valued params keep
 * their first value — enough for the deep-links these pages actually receive.
 */
export function communicationsRedirect(
  tab: 'news' | 'announcements' | 'campaigns' | 'notifications',
  query: ParsedUrlQuery
): GetServerSidePropsResult<never> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key === 'tab') continue; // forced below
    if (Array.isArray(value)) {
      if (value[0] !== undefined) params.set(key, value[0]);
    } else if (value !== undefined) {
      params.set(key, value);
    }
  }
  params.set('tab', tab);
  return {
    redirect: {
      destination: `/admin/communications?${params.toString()}`,
      permanent: true,
    },
  };
}
