import type { GetServerSideProps } from 'next';

/**
 * Legacy route shim. L'ajout d'un membre se fait désormais dans la modale
 * `AddMemberModal` sur la page d'édition d'une équipe (`/admin/teams/[teamId]/
 * edit?add-member=1`), câblée depuis la fiche équipe. Cette page autonome (avec
 * son propre sélecteur d'équipe) faisait doublon. Redirection permanente (308)
 * vers la liste des équipes (même gate `manager`), d'où l'on choisit l'équipe
 * cible avant d'ouvrir la modale.
 */
export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: '/admin/teams', permanent: true },
});

export default function TeamAddMemberRedirect() {
  return null;
}
