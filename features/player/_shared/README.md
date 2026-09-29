# `features/player/_shared/`

Socle commun des modules `features/player/<domaine>/` (ADR 0002) :
coquille `PlayerShell` et archétypes mobiles (P8), client typé `playerHttp` +
cache (P5), `useSchemaForm` (P6).

**Pas de briques « Le Ruban » ici** (bouton, puce, carte, en-tête…) : le kit
est unique et vit dans `features/ruban/` (P7), partagé avec l'admin. La garde
« iso » de `tests/unit/playerBoundariesGuard.test.ts` échoue si une brique est
définie dans `features/player/**` ou `components/player/**`.
