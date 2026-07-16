// pages/caster/cockpit.tsx
//
// La régie (ex-« cockpit caster ») a déménagé dans l'admin : /admin/regie.
// Elle réutilisait déjà la session staff (cf. utils/casterAuth) — elle vit
// désormais dans la chrome admin, gatée owner/admin/caster.
//
// On garde cette route en redirection serveur pour ne pas casser les anciens
// bookmarks / la PWA installée sur /caster/cockpit.

import type { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: { destination: '/admin/regie', permanent: false },
  };
};

export default function CockpitMovedRedirect() {
  // Jamais rendu : la redirection SSR intervient avant le rendu.
  return null;
}
