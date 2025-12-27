import React from 'react';

export interface SVGTypes {
  className?: string;
  fill?: string;
}

export interface LinkItem {
  title: string;
  ref?: string;
  subMenu?: LinkItem[];
}

export interface EventSponsor {
  image: string;
  websiteUrl: string;
}

export interface City {
  name: string;
  country: string;
  date: string;
  cfpDate: string;
  description: string;
  img: string;
  address: string;
  mapUrl: string | undefined;
  freeEntry: boolean;
  cfp: string | null;
  recordings: string | null;
  playlist: string | null;
}

export enum ConferenceStatus {
  UPCOMING = 'Upcoming',
  ONGOING = 'Ongoing',
  ENDED = 'Ended',
}

export interface Speaker {
  name: string;
  title: string;
  link: string;
  img: string;
  id: number;
  city: string[];
  pub?: boolean;
}

export interface Social {
  name: string;
  href: string;
  imgUrl: string;
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

export interface SocialWithIcon {
  name: string;
  href: string;
  icon: ({ className, fill }: SVGTypes) => React.JSX.Element;
}

export interface CfpForm {
  Fullname: string;
  Email: string;
  Bio: string;
  Social: string;
  Title: string;
  Description: string;
  Format: string;
  Level: string;
  AdditionalInfo: string;
}

export interface CfpStepProps {
  setStep: (e: React.FormEvent<HTMLFormElement> | null, step: number) => void;
  setForm: React.Dispatch<React.SetStateAction<Partial<CfpForm>>>;
  data: Partial<CfpForm>;
}

export interface SelectOptions {
  value: string;
  label: string;
}
