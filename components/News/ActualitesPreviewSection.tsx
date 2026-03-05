import Link from 'next/link';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import Button from '@/components/Buttons/button';
import type { JSX } from 'react';

function ActualitesPreviewSection(): JSX.Element {
  return (
    <section
      id="tournoi-mixte"
      className="container mt-20 mb-16 lg:mb-24 flex flex-col gap-8 px-4 md:px-0"
    >
      <div className="relative overflow-hidden rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-950/40 via-neutral-900/60 to-purple-950/30 p-8 md:p-12">
        {/* Decorative glow */}
        <div className="absolute -top-20 -right-20 h-60 w-60 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 h-60 w-60 rounded-full bg-purple-500/10 blur-3xl" />

        <div className="relative flex flex-col items-center text-center gap-6">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/20 text-blue-300 text-sm font-semibold uppercase tracking-wider">
            <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
            3 Avril 2026
          </span>

          <Heading
            typeStyle="heading-md"
            className="text-gradient text-center"
          >
            Tournoi Mixte
          </Heading>

          <div className="max-w-2xl">
            <Paragraph
              typeStyle="body-lg"
              className="mt-2"
              textColor="text-gray-200"
            >
              Tournoi mixte hommes/femmes pour lancer la saison comp&eacute;titive.
              Un avant-go&ucirc;t de ce qui vous attend en octobre&nbsp;!
            </Paragraph>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 w-full max-w-xl">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
              <div className="text-2xl font-bold text-white">Mixte</div>
              <div className="text-xs text-neutral-400 mt-1">Format ouvert</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
              <div className="text-2xl font-bold text-white">3 Avril</div>
              <div className="text-xs text-neutral-400 mt-1">Save the date</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
              <div className="text-2xl font-bold text-white">Saison 2026</div>
              <div className="text-xs text-neutral-400 mt-1">Coup d&apos;envoi</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 mt-4 justify-center">
            <Link href="/team/create">
              <Button type="button" className="px-8 h-[52px]">
                Inscrire mon équipe
              </Button>
            </Link>
            <Link href="/timeline-2026">
              <Button type="button" overlay className="px-8 h-[52px] border border-white/20 hover:border-white/40 transition">
                Voir le programme
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export default ActualitesPreviewSection;
