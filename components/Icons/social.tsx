import type { JSX } from 'react';
import type { SVGTypes } from '@/types/types';

export function TikTokIcon({
  className,
  fill,
}: Readonly<SVGTypes>): JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill={fill || 'currentColor'}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.71a8.21 8.21 0 0 0 4.76 1.51v-3.45a4.85 4.85 0 0 1-1-.08Z" />
    </svg>
  );
}

export function InstagramIcon({
  className,
  fill,
}: Readonly<SVGTypes>): JSX.Element {
  const stroke = fill || 'currentColor';
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="17.5" cy="6.5" r="1.2" fill={stroke} stroke="none" />
    </svg>
  );
}

export function TwitchIcon({
  className,
  fill,
}: Readonly<SVGTypes>): JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill={fill || 'currentColor'}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M3.5 2 2 5.5V20h5v2.5h3L12.5 20H17l4.5-4.5V2H3.5Zm16 12.5L16 18h-4.5L9 20.5V18H5V3.5h14.5v11ZM14 7v5h1.5V7H14Zm-4 0v5h1.5V7H10Z" />
    </svg>
  );
}

export function YouTubeIcon({
  className,
  fill,
}: Readonly<SVGTypes>): JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill={fill || 'currentColor'}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.546 12 3.546 12 3.546s-7.505 0-9.377.504A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.504 9.376.504 9.376.504s7.505 0 9.377-.504a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814ZM9.545 15.568V8.432L15.818 12l-6.273 3.568Z" />
    </svg>
  );
}

export function RssIcon({
  className,
  fill,
}: Readonly<SVGTypes>): JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill={fill || 'currentColor'}
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="6.18" cy="17.82" r="2.18" />
      <path d="M4 4.44v2.83c7.03 0 12.73 5.7 12.73 12.73h2.83c0-8.59-6.97-15.56-15.56-15.56Z" />
      <path d="M4 10.1v2.83c3.9 0 7.07 3.17 7.07 7.07h2.83c0-5.47-4.43-9.9-9.9-9.9Z" />
    </svg>
  );
}
