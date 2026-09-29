// features/ruban — LE kit « Le Ruban », unique pour l'admin et l'espace
// joueuse (docs/PLAN-industrialisation-joueur.md, lot P7). Une surface ne
// diffère des autres que par sa DENSITÉ (styles/<surface>-ruban.css), jamais
// par ses briques ni sa palette (styles/ruban-tokens.css).
//
// Toute nouvelle brique naît ici — la garde « iso »
// (tests/unit/playerBoundariesGuard.test.ts) refuse une brique définie
// ailleurs. Ce kit n'importe ni TanStack ni `features/admin` : il doit rester
// importable par le bundle joueuse (tests/unit/adminBoundariesGuard.test.ts).

export {
  default as Button,
  ButtonLink,
  type ButtonSize,
  type ButtonVariant,
} from './Button';
export { default as Chip, type ChipTone } from './Chip';
export {
  default as DangerZone,
  type DangerAction,
  type DangerZoneLabels,
} from './DangerZone';
export { default as EntityHeader } from './EntityHeader';
export { FicheLayout, FicheSection, MetaList } from './Fiche';
export {
  default as ListToolbar,
  FilterSelect,
  ListSearch,
} from './ListToolbar';
export { default as PageHeader } from './PageHeader';
export { default as StatTile, type StatTone } from './StatTile';
export * from './ruban';
