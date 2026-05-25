// pages/admin/api-docs.tsx
//
// Owner-only Swagger UI page. Renders the live OpenAPI spec served at
// `/api/admin/docs/openapi` via `swagger-ui-react`. Dynamically imported
// to avoid SSR (swagger-ui-react touches window at import time) and to
// keep the heavy bundle out of the rest of the admin UI.

import dynamic from 'next/dynamic';
import Head from 'next/head';
import { withStaffPage } from '@/utils/staff';

import 'swagger-ui-react/swagger-ui.css';

const SwaggerUI = dynamic(() => import('swagger-ui-react'), {
  ssr: false,
  loading: () => (
    <p style={{ padding: '2rem', color: '#888' }}>Loading API docs…</p>
  ),
});

export const getServerSideProps = withStaffPage('owner');

export default function ApiDocsPage() {
  return (
    <>
      <Head>
        <title>API docs · Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <main style={{ minHeight: '100vh', background: '#fafafa' }}>
        <SwaggerUI
          url="/api/admin/docs/openapi"
          docExpansion="list"
          deepLinking
          filter
          tryItOutEnabled
          persistAuthorization
        />
      </main>
    </>
  );
}
