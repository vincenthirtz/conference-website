// components/admin/PushOptIn.tsx
//
// Compatibility wrapper — la logique a ete deplacee vers
// components/shared/PushOptIn.tsx pour pouvoir etre reutilisee par le Cockpit
// caster (Lot 4 run-of-show).
//
// On garde ce fichier comme alias pour ne pas casser les imports existants
// (cf. pages/_app.tsx). Comportement strictement identique a la V1 :
// audience='admin', variant='banner'.

import SharedPushOptIn from '@/components/shared/PushOptIn';

export default function PushOptIn() {
  return <SharedPushOptIn audience="admin" variant="banner" />;
}
