// pages/developpeurs.tsx
//
// Ancienne page « API publique », devenue une redirection permanente.
//
// Elle documentait à la main les endpoints publics, en page d'accueil, pour un
// public qui n'était pas celui qui arrive : ceux qui ouvrent cette adresse
// viennent organiser une compétition, pas lire une liste de paramètres de
// requête. Et la documentation, elle, existe deux fois — la version générée
// depuis la spécification (`/developpeurs/reference`) ne peut pas dériver,
// celle-ci le pouvait.
//
// La page vit désormais à `/organisateurs`, avec les offres et la souscription.
// Les développeurs y ont leur section, qui renvoie à la référence et aux clés.
//
// 308 et non 302 : l'adresse a changé pour de bon, et les moteurs doivent
// reporter le référencement plutôt que garder les deux.

import type { GetServerSideProps } from 'next';

export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: { destination: '/organisateurs', permanent: true },
});

export default function DevelopersRedirect() {
  return null;
}
