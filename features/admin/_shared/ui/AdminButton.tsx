// Ré-export de compatibilité (lot P7) : la brique vit dans features/ruban/.
// Anciens noms conservés pour les importeurs admin ; ce fichier disparaîtra
// quand ils importeront features/ruban directement. N'y définis RIEN.

export {
  default,
  ButtonLink as AdminButtonLink,
  type ButtonSize as AdminButtonSize,
  type ButtonVariant as AdminButtonVariant,
} from '@/features/ruban/Button';
