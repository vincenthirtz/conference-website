import type { GetServerSideProps } from 'next';
import {
  requireStaffRoleFromRequest,
  StaffUnauthenticatedError,
  StaffUnauthorizedError,
} from '@/utils/staff';

/**
 * Legacy route shim. Email logs now live as the "Emails" tab of the merged
 * /admin/logs page. This tab is admin-only, so we keep the admin gate here:
 * a non-admin hitting the old bookmark still gets 403 (rather than silently
 * landing on the manager-visible Staff tab). Admins are redirected to the tab.
 */
export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const { req, res } = ctx;
  try {
    await requireStaffRoleFromRequest(req as any, res as any, 'admin');
  } catch (err: unknown) {
    if (err instanceof StaffUnauthenticatedError) {
      return { redirect: { destination: '/admin/login', permanent: false } };
    }
    if (err instanceof StaffUnauthorizedError) {
      return { redirect: { destination: '/403', permanent: false } };
    }
    throw err;
  }
  return {
    redirect: { destination: '/admin/logs?tab=emails', permanent: true },
  };
};

export default function EmailLogsRedirect() {
  return null;
}
