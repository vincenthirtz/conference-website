// features/admin/moderation/hooks/useBlacklistExpiry.ts — état « sanction
// temporaire » partagé par les deux listes noires (joueuses :
// components/admin/moderation/BlacklistPanel.tsx ; entités :
// EntityBlacklistPanel.tsx), qui le recopiaient à l'identique.
//
//   - `available` : migration blacklist_expires_at appliquée (champ
//     `expiry_available` des réponses de liste) — sinon champ et filtre
//     « échues » sont masqués ;
//   - `choice` : échéance saisie dans le formulaire d'ajout
//     (cf. BlacklistExpiryField, `expiryBody`).

import { useState } from 'react';

/** Même forme que `ExpiryChoice` (components/admin/moderation/BlacklistExpiry). */
type ExpiryChoice = { preset: string; date: string };

const NO_EXPIRY: ExpiryChoice = { preset: '', date: '' };

export function useBlacklistExpiry() {
  const [state, setState] = useState({ available: true, choice: NO_EXPIRY });
  return {
    available: state.available,
    choice: state.choice,
    setChoice: (choice: ExpiryChoice) => setState((s) => ({ ...s, choice })),
    /** Après un ajout : formulaire sans échéance. */
    reset: () => setState((s) => ({ ...s, choice: NO_EXPIRY })),
    /** À brancher sur `onData` de la liste. */
    readAvailability: (res: { expiry_available?: boolean }) =>
      setState((s) => ({ ...s, available: res.expiry_available !== false })),
  };
}
