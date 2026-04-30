import type { JSX } from 'react';
import type { SVGTypes } from '@/types/types';

export function RulesIcon({
  className,
  fill,
}: Readonly<SVGTypes>): JSX.Element {
  const stroke = fill || 'currentColor';
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M7 3.5h7l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20V5a1.5 1.5 0 0 1 1.5-1.5Z"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="M14 3.5V8h4.5"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="M9 12h6"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="M9 16h3.5"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

export function MailIcon({
  className,
  fill,
}: Readonly<SVGTypes>): JSX.Element {
  const stroke = fill || 'currentColor';
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="3.5"
        y="5.5"
        width="17"
        height="13"
        rx="2"
        ry="2"
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
      />
      <path
        d="m4.5 8.5 7.5 4.8 7.5-4.8"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

export function LegalShieldIcon({
  className,
  fill,
}: Readonly<SVGTypes>): JSX.Element {
  const stroke = fill || 'currentColor';
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 3 6 5v6c0 4.4 3 8.2 6 9.5 3-1.3 6-5.1 6-9.5V5l-6-2Z"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="m9 12.5 2.2 2.2L15.5 10"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

export function DonationIcon({
  className,
  fill,
}: Readonly<SVGTypes>): JSX.Element {
  const stroke = fill || 'currentColor';
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 20s-6.5-3.6-6.5-9A4.5 4.5 0 0 1 12 6.5 4.5 4.5 0 0 1 18.5 11c0 5.4-6.5 9-6.5 9Z"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <circle
        cx="12"
        cy="11"
        r="2.4"
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
      />
      <path
        d="M12 9.6v2.8M11.1 11h1.8"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

export function SitemapIcon({
  className,
  fill,
}: Readonly<SVGTypes>): JSX.Element {
  const stroke = fill || 'currentColor';
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        x="8.5"
        y="3.5"
        width="7"
        height="4.5"
        rx="1"
        ry="1"
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
      />
      <rect
        x="3"
        y="16.5"
        width="5.5"
        height="4.5"
        rx="1"
        ry="1"
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
      />
      <rect
        x="10"
        y="16.5"
        width="4"
        height="4.5"
        rx="1"
        ry="1"
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
      />
      <rect
        x="15.5"
        y="16.5"
        width="5.5"
        height="4.5"
        rx="1"
        ry="1"
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
      />
      <path
        d="M12 8v4.5"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="M12 14.5h-4.5V16"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="M12 14.5h4.5V16"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="M12 14.5v1.5"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

export function NewsIcon({
  className,
  fill,
}: Readonly<SVGTypes>): JSX.Element {
  const stroke = fill || 'currentColor';
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="12"
        cy="12"
        r="8.5"
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
      />
      <circle
        cx="12"
        cy="12"
        r="3"
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
      />
      <path
        d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeWidth="1.4"
      />
    </svg>
  );
}

export function LiveIcon({
  className,
  fill,
}: Readonly<SVGTypes>): JSX.Element {
  const stroke = fill || 'currentColor';
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="12"
        cy="12"
        r="3"
        fill={stroke}
        stroke={stroke}
        strokeWidth="1.6"
      />
      <path
        d="M7.5 7.5a6.4 6.4 0 0 0 0 9"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeWidth="1.6"
      />
      <path
        d="M16.5 7.5a6.4 6.4 0 0 1 0 9"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeWidth="1.6"
      />
      <path
        d="M4.5 4.5a11 11 0 0 0 0 15"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeWidth="1.6"
      />
      <path
        d="M19.5 4.5a11 11 0 0 1 0 15"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

export function SupportIcon({
  className,
  fill,
}: Readonly<SVGTypes>): JSX.Element {
  const stroke = fill || 'currentColor';
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v10A1.5 1.5 0 0 1 18.5 17H8l-4 3.5V5.5Z"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="M12 8.5v3.2"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="14" r="0.9" fill={stroke} />
    </svg>
  );
}

export function AboutIcon({
  className,
  fill,
}: Readonly<SVGTypes>): JSX.Element {
  const stroke = fill || 'currentColor';
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
      />
      <line
        x1="12"
        y1="11"
        x2="12"
        y2="17"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="12" cy="7.5" r="1" fill={stroke} />
    </svg>
  );
}
