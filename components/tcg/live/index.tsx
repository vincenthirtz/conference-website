// components/tcg/live/index.tsx
//
// POINT D'INSERTION des blocs « en action » de la vitrine publique `/tcg`.
//
// La page (`pages/tcg.tsx`) rend `<TcgLiveSections />` entre la présentation de
// l'association et le catalogue. AUJOURD'HUI CE COMPOSANT NE REND RIEN : il
// réserve la place, pour que les blocs vivants se branchent ICI, sans retoucher
// la page ni sa mise en page.
//
// Blocs prévus (non implémentés) : fil des tirages rares, classement des
// collectionneuses, carte de la semaine.
//
// RÈGLES POUR QUI BRANCHE UN BLOC :
//   - un fichier par bloc dans ce dossier (`RareDrawsFeed.tsx`…), rendu dans
//     `SLOTS` ci-dessous, dans l'ordre d'affichage ;
//   - chaque bloc est une `<section>` avec son propre `<h2>`, et rend `null`
//     tant qu'il n'a rien à montrer (pas de cadre vide, pas d'en-tête orphelin) ;
//   - données lues CÔTÉ CLIENT, après le rendu (la page est statique, ISR 300 s)
//     via une route publique (sous /api/tcg) ou `useRealtimeChannel` — jamais
//     `supabaseAdmin`, jamais les routes admin ni celles du bot ;
//   - AUCUNE JOUEUSE NOMMÉE sans son consentement : la page est indexée et ne
//     liste personne (cf. l'en-tête de `pages/tcg.tsx`). Un classement des
//     collectionneuses doit donc passer par un opt-in, comme la vitrine ;
//   - textes dans `lib/i18n/locales/{fr,en}/` (parité vérifiée), couleurs par
//     jetons (`var(--color-violet)`…) : ce dossier est compté par le cliquet de
//     dette joueuse (`scripts/player-metrics.ts`, portée SHARED).
//
// Chaque bloc est isolé par `LiveBoundary` : une panne d'un fil en direct
// retire ce bloc, pas la page.

import { Component, type ReactNode } from 'react';

import { logger } from '@/utils/logger';

/**
 * Coupe-circuit d'un bloc vivant : en cas d'erreur, le bloc DISPARAÎT.
 *
 * Pas le `ErrorBoundary` de l'application : son repli occupe 60 % de l'écran
 * et propose de « réessayer », ce qui est juste pour une page, disproportionné
 * pour un encart facultatif au milieu d'une vitrine.
 */
export class LiveBoundary extends Component<
  { children: ReactNode; name: string },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error): void {
    logger.error('[tcg/live] bloc %s retiré : %s', this.props.name, error);
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Les blocs branchés, dans l'ordre d'affichage. VIDE pour l'instant.
 *
 *   const SLOTS = [{ name: 'rare-draws', node: <RareDrawsFeed /> }];
 */
const SLOTS: ReadonlyArray<{ name: string; node: ReactNode }> = [];

/** Les blocs « en action » de `/tcg`. Ne rend rien tant qu'aucun n'est branché. */
export default function TcgLiveSections(): ReactNode {
  if (SLOTS.length === 0) return null;
  return (
    <div className="mt-16 flex flex-col gap-16" data-tcg-live-sections>
      {SLOTS.map((slot) => (
        <LiveBoundary key={slot.name} name={slot.name}>
          {slot.node}
        </LiveBoundary>
      ))}
    </div>
  );
}
