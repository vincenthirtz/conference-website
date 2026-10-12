// components/tcg/TcgPackSachet.tsx
//
// LE SACHET SCELLÉ qu'on déchire avant de voir ses cartes.
//
// UN SEUL VRAI BOUTON, TROIS FAÇONS DE L'ACTIVER. C'est un `<button>` natif :
// clic, tap, Entrée et Espace l'ouvrent sans une ligne de clavier à écrire, et
// son nom accessible (« Ouvrir le paquet ») est son texte visible. Le glissé
// horizontal n'est qu'un raccourci tactile POSÉ SUR ce bouton : il suit le
// doigt (le haut du sachet se soulève) et ouvre au-delà d'un seuil — mais
// relâcher plus tôt déclenche de toute façon le clic natif, qui ouvre aussi.
// Personne ne reste bloqué devant un sachet qui « n'a pas voulu ».
//
// LE SUIVI DU DOIGT NE PASSE PAS PAR REACT. La progression du glissé est
// écrite dans la variable CSS `--tear` de l'élément : aucun rendu par
// `pointermove`, le navigateur ne fait que recomposer un `transform`.
//
// DÉCORATIF POUR TOUT LE RESTE. Le motif, le nœud de la marque et la ligne
// pointillée sont `aria-hidden` ; le contenu des cartes, lui, est déjà dans le
// DOM sous le sachet (cf. `TcgPackReveal`) — le sachet ne cache qu'à l'œil.
//
// Sous `prefers-reduced-motion`, il n'apparaît même pas (cf. `globals.css`) :
// le paquet est ouvert d'emblée.

import Image from 'next/image';
import { useRef, type JSX, type PointerEvent } from 'react';

/** Part de la largeur à parcourir pour déchirer d'un glissé. */
const SWIPE_THRESHOLD = 0.45;

export default function TcgPackSachet({
  phase,
  onOpen,
  labels,
}: {
  phase: 'sealed' | 'tearing';
  onOpen: () => void;
  labels: { openPack: string; openPackHint: string };
}): JSX.Element {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ x: number; width: number } | null>(null);

  const setTear = (value: number) => {
    buttonRef.current?.style.setProperty('--tear', value.toFixed(3));
  };

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (phase !== 'sealed' || e.button !== 0) return;
    drag.current = {
      x: e.clientX,
      width: e.currentTarget.getBoundingClientRect().width || 1,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const start = drag.current;
    if (!start) return;
    const progress = Math.min(
      1,
      Math.abs(e.clientX - start.x) / (start.width * SWIPE_THRESHOLD)
    );
    setTear(progress);
    if (progress >= 1) {
      drag.current = null;
      onOpen();
    }
  };

  const endDrag = () => {
    if (!drag.current) return;
    drag.current = null;
    // Relâché avant le seuil : le haut du sachet retombe (transition CSS). Le
    // clic natif qui suit ouvrira quand même — cf. l'en-tête.
    setTear(0);
  };

  const sealed = phase === 'sealed';

  return (
    <div className="tcg-sachet-stage" data-phase={phase}>
      <button
        ref={buttonRef}
        type="button"
        className="tcg-sachet"
        data-phase={phase}
        // Pendant la déchirure, le bouton n'est plus une commande : il ne
        // doit ni rouvrir, ni intercepter un clic destiné à une carte.
        disabled={!sealed}
        onClick={onOpen}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span className="tcg-sachet-piece tcg-sachet-top" aria-hidden />
        <span className="tcg-sachet-piece tcg-sachet-body" aria-hidden>
          <span className="tcg-sachet-mark">
            <Image
              src="/img/logos/2026-logo.png"
              alt=""
              width={96}
              height={96}
              className="h-full w-full object-contain"
            />
          </span>
        </span>
        <span className="tcg-sachet-tearline" aria-hidden />
        <span className="tcg-sachet-flash" aria-hidden />
        <span className="tcg-sachet-label">{labels.openPack}</span>
      </button>
      {sealed && (
        <p className="tcg-sachet-hint" aria-hidden>
          {labels.openPackHint}
        </p>
      )}
    </div>
  );
}
