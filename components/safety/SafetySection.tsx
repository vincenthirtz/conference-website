// components/safety/SafetySection.tsx
//
// Section de la page /securite : une région nommée par son titre (`h2`),
// atteignable par l'ancre du sommaire sans passer sous l'en-tête fixe.
//
// Titres en blanc plein, pas en dégradé de marque : le texte en
// `background-clip` peut disparaître en mode contraste élevé, et cette page
// doit rester lisible partout.

import type { ReactNode } from 'react';

type Props = {
  id: string;
  title: string;
  children: ReactNode;
};

export default function SafetySection({ id, title, children }: Props) {
  const headingId = `${id}-titre`;
  return (
    <section id={id} aria-labelledby={headingId} className="scroll-mt-header">
      <h2
        id={headingId}
        className="text-2xl font-bold tracking-tight text-white sm:text-3xl"
      >
        {title}
      </h2>
      <span className="brand-rule mt-3 block" aria-hidden="true" />
      {children}
    </section>
  );
}
