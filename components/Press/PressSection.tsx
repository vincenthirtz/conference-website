import type { JSX } from 'react';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';

type PressItem = {
  title: string;
  source: string;
  url: string;
  logo?: string;
};

const PRESS_ITEMS: PressItem[] = [
  {
    title: "OW Women's Cup 2026",
    source: 'Ranked Actu',
    url: 'https://rankedactu.fr/article/e-sport/cmmucnmqd000401jv59636io8',
    logo: 'https://rankedactu.fr/_next/image?url=%2Flogo_white.webp&w=256&q=75',
  },
];

function PressSection(): JSX.Element {
  return (
    <section className="container mt-20 flex flex-col gap-6 px-4 md:px-0">
      <div className="flex flex-col items-center text-center">
        <div className="section-eyebrow text-xl text-white font-semibold mb-1">
          Presse
        </div>
        <Heading
          typeStyle="heading-md"
          className="text-gradient text-center lg:mt-3"
        >
          Ils parlent de nous
        </Heading>
        <Paragraph
          typeStyle="body-lg"
          className="mt-3 max-w-2xl"
          textColor="text-gray-200"
        >
          Retrouvez les articles et médias qui couvrent l&apos;OW Women&apos;s
          Cup.
        </Paragraph>
      </div>

      <div className="grid gap-4 md:grid-cols-3 justify-items-center">
        {PRESS_ITEMS.map((item) => (
          <a
            key={item.url}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="press-card rounded-2xl border border-white/10 bg-white/5 p-5 flex flex-col gap-3 transition-all duration-300 w-full max-w-sm"
          >
            {item.logo ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={item.logo}
                alt={item.source}
                className="h-8 w-auto object-contain"
                loading="lazy"
              />
            ) : (
              <div className="text-xs uppercase tracking-[0.14em] text-blue-200/80">
                {item.source}
              </div>
            )}
            <h3 className="text-lg font-semibold text-white leading-snug">
              {item.title}
            </h3>
            <span className="text-sm neon-text-cyan mt-auto inline-flex items-center gap-1 press-card__cta">
              Lire l&apos;article <span aria-hidden>→</span>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

export default PressSection;
