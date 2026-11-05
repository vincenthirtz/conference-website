export interface SVGTypes {
  className?: string;
  fill?: string;
}

export interface LinkItem {
  title: string;
  ref?: string;
  badge?: string;
  subMenu?: LinkItem[];
  /** Sous-titre d'un sous-menu (« À venir », « À revoir ») : ni lien ni focus. */
  heading?: boolean;
  /** Entrée grisée, sans lien ni focus (un événement annoncé, pas encore ouvert). */
  disabled?: boolean;
}

export enum ConferenceStatus {
  UPCOMING = 'Upcoming',
  ONGOING = 'Ongoing',
  ENDED = 'Ended',
}

export interface Team {
  name: string;
  title: string;
  link: string;
  img: string;
  id: number;
  city: string[];
  color?: string;
  pub?: boolean;
}
