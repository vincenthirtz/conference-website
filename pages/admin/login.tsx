// La connexion vit désormais sur /login (page publique unifiée joueuse + staff).
// /admin/login est conservé comme alias historique : il redirige vers /login en
// préservant la query (?next=…) pour ne casser aucun lien existant.
import type { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(ctx.query)) {
    if (typeof value === 'string') search.append(key, value);
    else if (Array.isArray(value)) value.forEach((v) => search.append(key, v));
  }
  const qs = search.toString();
  return {
    redirect: {
      destination: `/login${qs ? `?${qs}` : ''}`,
      permanent: false,
    },
  };
};

// Jamais rendu : la redirection SSR s'exécute avant.
export default function AdminLoginRedirect() {
  return null;
}
