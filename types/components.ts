import type {
  Dispatch,
  MouseEventHandler,
  ReactNode,
  SetStateAction,
} from 'react';
import type { Team } from './types';
import type { StaffRole } from './admin';

export type ButtonType = 'button' | 'submit' | 'reset' | undefined;

export interface IButton {
  className?: string;
  children: ReactNode;
  overlay?: boolean;
  onClick?: MouseEventHandler;
  // Optionnel : ignoré quand `as="link"` (rendu <a>, l'attribut type n'a pas
  // de sens). ButtonType inclut déjà `undefined`.
  type?: ButtonType;
  disabled?: boolean;
  test?: string;
  size?: 'default' | 'compact';
  as?: 'button' | 'link';
  href?: string;
  target?: string;
  rel?: string;
}

export type AdminLink = {
  title: string;
  ref: string;
  minRole?: StaffRole;
  /**
   * Marque le lien comme faisant partie de la « console développeur » (tenant
   * `kind='developer'`). Un tenant développeur ne voit que ces liens.
   */
  devConsole?: boolean;
  children?: AdminLink[];
};

export interface INavDropProp {
  setDrop: Dispatch<SetStateAction<boolean>>;
  isStaff: boolean;
  staffName: string | null;
  adminLinks: AdminLink[];
  adminLoading: boolean;
  offsetTop?: number;
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
