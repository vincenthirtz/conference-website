// components/admin/commandPaletteEvents.ts — ouvrir la palette ⌘K depuis un
// bouton (champ « Rechercher… » de la coquille admin) sans importer la
// palette : elle est chargée à part (`dynamic`), un bouton ne doit pas la
// tirer dans son propre bundle.

export const OPEN_COMMAND_PALETTE_EVENT = 'admin:open-command-palette';

export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT));
}
