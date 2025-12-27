import type {
  Dispatch,
  MouseEventHandler,
  ReactNode,
  SetStateAction,
} from 'react';
import type { City, Speaker, Team, SVGTypes } from './types';

export type ButtonType = 'button' | 'submit' | 'reset' | undefined;

export interface IButton {
  className?: string;
  children: ReactNode;
  overlay?: boolean;
  onClick?: MouseEventHandler;
  type: ButtonType;
  disabled?: boolean;
  test?: string;
}

export interface IDropdown {
  city: Partial<City>;
  cities: City[];
  setCity: Dispatch<SetStateAction<Partial<City>>>;
  handleSpeakers: (arg0: string) => void;
}

export interface ISlider {
  children: ReactNode[];
}

export interface ISpeaker {
  details: Speaker;
  location?: string | undefined;
  className?: string;
}

export type AdminLink = {
  title: string;
  ref: string;
};

export interface INavDropProp {
  setDrop: Dispatch<SetStateAction<boolean>>;
  isStaff: boolean;
  staffName: string | null;
  adminLinks: AdminLink[];
  adminLoading: boolean;
  onLogout: () => void;
}

export interface PastEditonCardProp {
  url: string;
}

export interface TeamProps {
  details: Team;
  location?: string;
  className?: string;
}

export interface HamburgerProps {
  className?: string;
}

export interface IArrows extends SVGTypes {
  direction: string;
}

export type ParagraphTypeStyle = 'body-lg' | 'body-md' | 'body-sm';

export interface IParagraph {
  typeStyle?: ParagraphTypeStyle;
  textColor?: string;
  fontWeight?: string;
  className?: string;
  children: ReactNode;
}

export type HeadingLevel = 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

export type HeadingTypeStyle =
  | 'heading-lg'
  | 'heading-md'
  | 'heading-md-semibold'
  | 'heading-sm'
  | 'heading-sm-semibold'
  | 'heading-xs'
  | 'heading-xs-semibold'
  | 'body-lg'
  | 'body-md'
  | 'body-sm';

export interface IHeading {
  typeStyle?: HeadingTypeStyle;
  level?: HeadingLevel;
  textColor?: string;
  className?: string;
  children: ReactNode;
}
