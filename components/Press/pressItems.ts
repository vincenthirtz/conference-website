// components/Press/pressItems.ts
//
// Source unique des retombées presse, lue par la section Presse et par la bande
// « soutiens » de l'accueil.
//
// Les logos sont hébergés CHEZ NOUS (public/img/logos). Un logo servi par le
// site du média partait vers un tiers avant tout consentement, et quand ce site
// tombe, la requête reste pendante : le 15/09/2026, rankedactu.fr ne répondait
// plus, l'accueil affichait une image cassée et n'atteignait jamais le repos
// réseau. Le logo de Ranked Actu a été récupéré depuis l'archive du Web.

export type PressItem = {
  title: string;
  source: string;
  url: string;
  logo?: string;
};

export const PRESS_ITEMS: PressItem[] = [
  {
    title: "OW Women's Cup 2026",
    source: 'Ranked Actu',
    url: 'https://rankedactu.fr/article/e-sport/cmu5mmuh8000001mrbw0rj3qc',
    logo: '/img/logos/rankedactu.webp',
  },
];
