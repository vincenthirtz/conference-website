// components/admin/caster/SceneList.tsx
//
// Liste des scènes du cockpit + CRUD complet (lot 7) : création par type,
// renommage inline, duplication, suppression confirmée, montée/descente.
// Port de womenscup-caster/src/renderer/sceneManager.js — même vocabulaire
// d'actions, sur la MÊME table `caster_scenes`, donc utilisable indifféremment
// depuis le web ou l'app desktop.
//
// Répartition des responsabilités :
//   - la logique pure (nouvel ordre, nom de copie, data par défaut) vit dans
//     utils/caster/sceneCrud.ts ;
//   - les écritures Supabase vivent dans hooks/useCasterScenes.ts (elles
//     `throw`) ;
//   - ce composant orchestre : confirmation, toasts, journal d'audit et
//     sélection de la scène créée. La page reste mince (elle ne fait que
//     brancher le hook).
//
// Le drag & drop n'est PAS implémenté : les flèches montent/descendent suffisent
// et sont utilisables au clavier — en régie, une souris qui dérape sur un
// glisser-déposer réordonne l'antenne par accident.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { logger } from '@/utils/logger';
import { logCasterAction } from '@/utils/caster/auditClient';
import { moveInList } from '@/utils/caster/sceneCrud';
import {
  CASTER_SCENE_TYPES,
  type CasterPresenceUser,
  type CasterScene,
  type CasterSceneType,
} from '@/types/caster';

/** Mutateurs de la liste — fournis par `useCasterScenes`. */
export type SceneCrud = {
  createScene: (type: CasterSceneType) => Promise<string>;
  renameScene: (sceneId: string, name: string) => Promise<void>;
  duplicateScene: (sceneId: string) => Promise<string>;
  deleteScene: (sceneId: string) => Promise<void>;
  reorderScenes: (orderedIds: string[]) => Promise<void>;
};

type Props = {
  scenes: CasterScene[];
  selectedId: string | null;
  onSelect: (sceneId: string) => void;
  /** Autres casters (web ou desktop) ayant la scène ouverte, par id de scène. */
  othersByScene: Record<string, CasterPresenceUser[]>;
  /** Libellé i18n d'un type de scène (résolu par la page : dict typé strict). */
  typeLabel: (type: string) => string;
  crud: SceneCrud;
};

const actionBtn =
  'shrink-0 rounded-md border border-neutral-700 bg-neutral-800/80 px-1.5 py-0.5 text-[11px] leading-none text-neutral-300 hover:bg-neutral-700 hover:text-white disabled:opacity-30 disabled:hover:bg-neutral-800/80';

export default function SceneList({
  scenes,
  selectedId,
  onSelect,
  othersByScene,
  typeLabel,
  crud,
}: Props) {
  const t = useAdminT('adminCasterScenes');
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();

  // Une seule mutation à la fois : en régie, un double-clic sur « Dupliquer »
  // ne doit pas créer deux copies.
  const [busy, setBusy] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');

  const fail = useCallback(
    (template: string, err: unknown) => {
      logger.error('[SceneList] mutation error', err);
      addToast(
        format(template, { message: (err as Error)?.message || '' }),
        'error'
      );
    },
    [addToast]
  );

  async function create(type: CasterSceneType) {
    if (busy) return;
    setBusy(true);
    try {
      const id = await crud.createScene(type);
      onSelect(id);
      addToast(format(t.sceneCreated, { name: typeLabel(type) }), 'success');
      // Journal APRÈS succès : une scène de plus est visible par tous les
      // casters et par l'app desktop.
      logCasterAction({
        action: 'caster_scene_create',
        entityId: id,
        details: { type },
      });
    } catch (err) {
      fail(t.sceneCreateError, err);
    } finally {
      setBusy(false);
    }
  }

  async function commitRename(scene: CasterScene) {
    const name = draftName.trim();
    setRenamingId(null);
    if (!name || name === scene.name) return;
    try {
      await crud.renameScene(scene.id, name);
      addToast(t.sceneRenamed, 'success');
    } catch (err) {
      fail(t.sceneRenameError, err);
    }
  }

  async function duplicate(scene: CasterScene) {
    if (busy) return;
    setBusy(true);
    try {
      const id = await crud.duplicateScene(scene.id);
      onSelect(id);
      addToast(t.sceneDuplicated, 'success');
    } catch (err) {
      fail(t.sceneDuplicateError, err);
    } finally {
      setBusy(false);
    }
  }

  async function remove(scene: CasterScene) {
    if (busy || scenes.length <= 1) return;
    const ok = await confirm({
      title: t.sceneDeleteTitle,
      subtitle: format(t.sceneDeleteBody, { name: scene.name }),
      confirmLabel: t.sceneDeleteConfirm,
      variant: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await crud.deleteScene(scene.id);
      // La page retombe sur la première scène (selected = fallback scenes[0]),
      // on n'a donc rien à sélectionner explicitement ici.
      addToast(format(t.sceneDeleted, { name: scene.name }), 'success');
      logCasterAction({
        action: 'caster_scene_delete',
        entityId: scene.id,
        details: { name: scene.name, type: scene.type },
      });
    } catch (err) {
      fail(t.sceneDeleteError, err);
    } finally {
      setBusy(false);
    }
  }

  async function move(scene: CasterScene, dir: -1 | 1) {
    if (busy) return;
    const next = moveInList(scenes, scene.id, dir);
    if (!next) return; // déjà en bout de liste
    setBusy(true);
    try {
      await crud.reorderScenes(next.map((s) => s.id));
    } catch (err) {
      fail(t.sceneReorderError, err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <nav
      aria-label={t.sceneListTitle}
      className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-2"
      data-testid="caster-scene-list"
    >
      <NewSceneMenu
        onPick={(type) => void create(type)}
        disabled={busy}
        typeLabel={typeLabel}
      />

      <ul className="space-y-1">
        {scenes.map((scene, index) => {
          const isSelected = selectedId === scene.id;
          // Indicateur consultatif : un autre caster (web OU desktop) a cette
          // scène ouverte. Jamais bloquant.
          const others = othersByScene[scene.id] || [];
          const othersNames = others.map((u) => u.displayName).join(', ');
          const isRenaming = renamingId === scene.id;
          return (
            <li
              key={scene.id}
              className={`group rounded-xl px-1 py-1 ${
                isSelected
                  ? 'bg-purple-600/20 border border-purple-500/40'
                  : 'border border-transparent hover:bg-neutral-800/60'
              }`}
              data-testid="caster-scene-item"
            >
              {isRenaming ? (
                <div className="flex items-center gap-1 px-1.5 py-1">
                  <input
                    // Focus immédiat : le renommage vient d'un clic sur ✎, on
                    // attend de pouvoir taper tout de suite.
                    autoFocus
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void commitRename(scene);
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setRenamingId(null);
                      }
                    }}
                    aria-label={format(t.sceneRenameLabel, {
                      name: scene.name,
                    })}
                    className="min-w-0 flex-1 rounded-md bg-neutral-950 border border-purple-500/50 px-2 py-1 text-sm text-white"
                    data-testid="caster-scene-rename-input"
                  />
                  <button
                    type="button"
                    onClick={() => void commitRename(scene)}
                    className={actionBtn}
                    title={t.sceneRenameSave}
                  >
                    <span aria-hidden="true">✓</span>
                    <span className="sr-only">{t.sceneRenameSave}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRenamingId(null)}
                    className={actionBtn}
                    title={t.sceneRenameCancel}
                  >
                    <span aria-hidden="true">✕</span>
                    <span className="sr-only">{t.sceneRenameCancel}</span>
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onSelect(scene.id)}
                    aria-current={isSelected ? 'true' : undefined}
                    className={`w-full flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition ${
                      isSelected ? 'text-white' : 'text-neutral-300'
                    }`}
                  >
                    <span className="font-medium truncate">{scene.name}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {others.length > 0 && (
                        <span
                          title={format(t.sceneOpenByOthers, {
                            names: othersNames,
                          })}
                          className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-200"
                          data-testid="caster-scene-presence-dot"
                        >
                          <span aria-hidden="true">👁</span>
                          {others.length > 1 && others.length}
                          <span className="sr-only">
                            {format(t.sceneOpenByOthers, {
                              names: othersNames,
                            })}
                          </span>
                        </span>
                      )}
                      <span className="rounded-full border border-neutral-700 bg-neutral-950/70 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-400">
                        {typeLabel(scene.type)}
                      </span>
                    </span>
                  </button>

                  {/* Actions : discrètes tant que la scène n'est ni
                      sélectionnée, ni survolée, ni porteuse du focus — mais
                      TOUJOURS dans l'ordre de tabulation (opacité, pas
                      `hidden`), donc atteignables au clavier. */}
                  <div
                    className={`flex items-center gap-1 px-1.5 pb-0.5 transition-opacity ${
                      isSelected
                        ? 'opacity-100'
                        : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
                    }`}
                    data-testid="caster-scene-actions"
                  >
                    <button
                      type="button"
                      onClick={() => void move(scene, -1)}
                      disabled={busy || index === 0}
                      className={actionBtn}
                      title={t.sceneMoveUp}
                      data-testid="caster-scene-move-up"
                    >
                      <span aria-hidden="true">↑</span>
                      <span className="sr-only">
                        {format(t.sceneMoveUpAria, { name: scene.name })}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void move(scene, 1)}
                      disabled={busy || index === scenes.length - 1}
                      className={actionBtn}
                      title={t.sceneMoveDown}
                      data-testid="caster-scene-move-down"
                    >
                      <span aria-hidden="true">↓</span>
                      <span className="sr-only">
                        {format(t.sceneMoveDownAria, { name: scene.name })}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDraftName(scene.name);
                        setRenamingId(scene.id);
                      }}
                      disabled={busy}
                      className={actionBtn}
                      title={t.sceneRename}
                      data-testid="caster-scene-rename"
                    >
                      <span aria-hidden="true">✎</span>
                      <span className="sr-only">
                        {format(t.sceneRenameAria, { name: scene.name })}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void duplicate(scene)}
                      disabled={busy}
                      className={actionBtn}
                      title={t.sceneDuplicate}
                      data-testid="caster-scene-duplicate"
                    >
                      <span aria-hidden="true">⧉</span>
                      <span className="sr-only">
                        {format(t.sceneDuplicateAria, { name: scene.name })}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(scene)}
                      disabled={busy || scenes.length <= 1}
                      title={
                        scenes.length <= 1
                          ? t.sceneDeleteLastHint
                          : t.sceneDelete
                      }
                      className={`${actionBtn} border-red-500/40 bg-red-900/30 text-red-200 hover:bg-red-900/60`}
                      data-testid="caster-scene-delete"
                    >
                      <span aria-hidden="true">🗑</span>
                      <span className="sr-only">
                        {format(t.sceneDeleteAria, { name: scene.name })}
                      </span>
                    </button>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
      {dialog}
    </nav>
  );
}

/**
 * Bouton « + Nouvelle scène » et son menu de types (les 12 de
 * CASTER_SCENE_TYPES). Motif menu WAI-ARIA minimal : navigation aux flèches,
 * Échap referme en rendant le focus au bouton, clic extérieur referme.
 */
function NewSceneMenu({
  onPick,
  disabled,
  typeLabel,
}: {
  onPick: (type: CasterSceneType) => void;
  disabled: boolean;
  typeLabel: (type: string) => string;
}) {
  const t = useAdminT('adminCasterScenes');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Clic extérieur : referme sans rendre le focus (le clic l'a déjà déplacé).
  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [open]);

  // Focus sur le premier item à l'ouverture (menu navigable aux flèches).
  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [open]);

  function onMenuKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('button') || []
    );
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(i + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      btnRef.current?.focus();
    }
  }

  return (
    <div ref={wrapRef} className="relative mb-2">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="menu"
        className="w-full rounded-xl border border-dashed border-neutral-700 bg-neutral-950/40 px-3 py-2 text-sm font-medium text-neutral-300 hover:border-purple-500/50 hover:text-white disabled:opacity-40"
        data-testid="caster-scene-new"
      >
        {t.newSceneButton}
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={t.newSceneMenuLabel}
          onKeyDown={onMenuKeyDown}
          className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-950 p-1 shadow-xl"
          data-testid="caster-scene-new-menu"
        >
          {CASTER_SCENE_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onPick(type);
              }}
              className="block w-full rounded-lg px-2.5 py-1.5 text-left text-sm text-neutral-300 hover:bg-purple-600/25 hover:text-white"
            >
              {typeLabel(type)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
