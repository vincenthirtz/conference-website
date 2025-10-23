import { JSX } from 'react';
import LinkedIn from '../components/illustration/Socials/LinkedIn';
import X from '../components/illustration/Socials/X';
import Youtube from '../components/illustration/Socials/Youtube';

export interface SocialWithIcon {
  name: string;
  href: string;
  icon: ({
    className,
    fill,
  }: {
    className?: string;
    fill?: string;
  }) => JSX.Element;
}

const socials: SocialWithIcon[] = [
  // {
  //   name: 'Linkedin',
  //   href: 'https://www.linkedin.com/company/asyncapi/',
  //   icon: LinkedIn,
  // },
  // {
  //   name: 'Twitter(X)',
  //   href: 'https://x.com/asyncapispec',
  //   icon: X,
  // },
  // {
  //   name: 'YouTube',
  //   href: 'https://www.youtube.com/@AsyncAPI',
  //   icon: Youtube,
  // },
];

export default socials;
