// components/Home/HomeQuickLinks.tsx
// Trio de raccourcis maison: FAQ, Roadmap, Scrim. Le bouton "Scrim" est mis en
// avant car il sert à attirer des équipes externes vers notre flow public.

import Link from 'next/link';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';

type QuickLink = {
  href: string;
  label: string;
  description: string;
  iconPath: string;
  highlight?: boolean;
};

const LINKS: QuickLink[] = [
  {
    href: '/espace-capitaine#faq',
    label: 'FAQ',
    description: 'Réponses aux questions des capitaines et des joueuses.',
    iconPath:
      'M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827V14',
  },
  {
    href: '/timeline-2026',
    label: 'Roadmap',
    description: 'Les grandes étapes 2026 de l’OW Women’s Cup.',
    iconPath: 'M13 10V3L4 14h7v7l9-11h-7z',
  },
  {
    href: '/scrim',
    label: 'Scrim',
    description: 'Vous êtes une équipe ? Proposez un match amical à nos teams.',
    iconPath: 'M22 12a10 10 0 11-20 0 10 10 0 0120 0zM10 8l6 4-6 4z',
    highlight: true,
  },
];

export default function HomeQuickLinks() {
  return (
    <section className="container mx-auto max-w-5xl px-4 mt-12">
      <div className="text-center mb-6">
        <Heading typeStyle="heading-sm" className="text-white">
          En un clic
        </Heading>
        <Paragraph
          typeStyle="body-sm"
          textColor="text-gray-400"
          className="mt-1"
        >
          Tout ce qu’il faut savoir, et un canal direct pour les équipes
          externes.
        </Paragraph>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="group">
            <div
              className={[
                'h-full rounded-2xl border p-5 transition-colors',
                link.highlight
                  ? 'border-cyan-500/40 bg-gradient-to-br from-cyan-500/15 via-cyan-500/5 to-transparent hover:border-cyan-400/70 hover:bg-cyan-500/10'
                  : 'border-white/10 bg-white/[0.03] hover:border-white/30 hover:bg-white/[0.05]',
              ].join(' ')}
            >
              <div className="flex items-center gap-3 mb-2">
                <div
                  className={[
                    'w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0',
                    link.highlight
                      ? 'border-cyan-400/50 bg-cyan-500/20 text-cyan-200'
                      : 'border-white/10 bg-white/5 text-gray-300',
                  ].join(' ')}
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d={link.iconPath}
                    />
                  </svg>
                </div>
                <p
                  className={[
                    'text-base font-semibold transition-colors',
                    link.highlight
                      ? 'text-cyan-100 group-hover:text-white'
                      : 'text-white',
                  ].join(' ')}
                >
                  {link.label}
                </p>
                {link.highlight && (
                  <span className="ml-auto px-2 py-0.5 rounded-full bg-cyan-500/30 text-cyan-100 text-[10px] uppercase tracking-wide">
                    Externe
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-400">{link.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
