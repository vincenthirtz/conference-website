export interface SVGTypes {
  className?: string;
  fill?: string;
}

export interface LinkItem {
  title: string;
  ref?: string;
  badge?: string;
  subMenu?: LinkItem[];
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
